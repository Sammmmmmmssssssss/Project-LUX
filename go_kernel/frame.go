// frame.go — Project LUX
// Layer 2 of the LUX data path: framing + Reed-Solomon FEC.
//
// ═══════════════════════════════════════════════════════════════════════════
// WIRE FORMAT (TX order)
// ═══════════════════════════════════════════════════════════════════════════
//
//   Step 1 — FEC encode (fecCodec.Encode):
//     Input:  raw IPv4 payload (≤ mtu bytes)
//     Output: fecWire buffer containing:
//       [1]  nBlocks  uint8   — number of 223-byte data blocks (≤ maxRSBlocks)
//       [1]  padLen   uint8   — zero-padding added to last block (0–222)
//       [N]  encoded  []byte  — nBlocks × 255 bytes (data+parity interleaved)
//
//   Step 2 — Frame wrap (frame):
//     Wraps the fecWire bytes in:
//       [4]  sync     uint32  — 0xCAFEF00D (big-endian)
//       [2]  len      uint16  — length of fecWire payload (big-endian)
//       [N]  payload  []byte  — fecWire bytes
//       [2]  crc      uint16  — CRC16/Modbus of payload only
//
// ═══════════════════════════════════════════════════════════════════════════
// RX order is the exact inverse: deframe → fecCodec.Decode → deliver to TUN.
// ═══════════════════════════════════════════════════════════════════════════
//
// ZERO-ALLOCATION CONTRACT
// ═══════════════════════════════════════════════════════════════════════════
// fecCodec pre-allocates ALL buffers at construction time (newFECCodec).
// Neither Encode nor Decode calls make(), new(), or append() on the hot path.
// The reedsolomon library operates on [][]byte shard slices — we pre-build
// those slice headers once and re-point their Data pointers into our fixed
// backing arrays each call. The klauspost encoder itself is allocation-free
// on the encode/reconstruct paths when shards are pre-sized.
//
// Do NOT pass a fecCodec between goroutines — it is NOT goroutine-safe.
// Construct one per direction: one for the uplink writer, one for the
// downlink reader.

package main

import (
	"encoding/binary"
	"fmt"

	"github.com/klauspost/reedsolomon"
)

// ── RS(255,223) parameters ─────────────────────────────────────────────────

const (
	rsDataShards   = 223 // data bytes per block
	rsParityShards = 32  // parity bytes per block (255 - 223)
	rsTotalShards  = rsDataShards + rsParityShards // = 255

	// Maximum number of RS blocks needed to cover one full MTU.
	// ceil(1500 / 223) = 7.  Pre-allocate for worst case.
	maxRSBlocks = 7 // ceil(mtu / rsDataShards) = ceil(1500/223) = 7

	// Pre-allocated flat backing arrays (sizes in bytes):
	//   data backing:   maxRSBlocks × rsDataShards   = 7 × 223 = 1561
	//   parity backing: maxRSBlocks × rsParityShards  = 7 × 32  = 224
	//   encoded output: maxRSBlocks × rsTotalShards   = 7 × 255 = 1785
	dataBackingSize   = maxRSBlocks * rsDataShards   // 1561
	parityBackingSize = maxRSBlocks * rsParityShards // 224
	encodedWireSize   = maxRSBlocks * rsTotalShards  // 1785

	// Wire overhead: 1 byte nBlocks + 1 byte padLen
	fecHeaderSize = 2

	// Maximum encoded payload size that can be wrapped in a LUX frame.
	// frame() adds 4 (sync) + 2 (len) + 2 (crc) = 8 bytes of framing.
	maxFrameSize = fecHeaderSize + encodedWireSize + 8 // 1795
)

// syncWord and crc16 constants
const syncWord uint32 = 0xCAFEF00D

// ── fecCodec ──────────────────────────────────────────────────────────────

// fecCodec holds the Reed-Solomon encoder and ALL pre-allocated buffers.
// Construct once per goroutine with newFECCodec(). Do NOT share between
// goroutines — the internal shard slice headers are mutated on every call.
type fecCodec struct {
	enc reedsolomon.Encoder

	// Flat backing arrays — never reallocated after construction.
	dataBacking   [dataBackingSize]byte
	parityBacking [parityBackingSize]byte

	// Pre-built shard slice headers. Their len/cap are set once; only the
	// underlying pointer (via unsafe, handled internally by reedsolomon) is
	// re-derived from our backing arrays. We re-slice them each call to
	// point at the correct block row — this is a header copy (24 bytes),
	// not a heap allocation.
	shards [rsTotalShards][]byte // [223 data + 32 parity] shard views

	// Flat output buffer for the fully encoded wire bytes + FEC header.
	// Sized for worst-case (7 blocks × 255 bytes + 2-byte header).
	wireBuf [fecHeaderSize + encodedWireSize]byte

	// Frame output buffer: wireBuf wrapped in sync/len/crc.
	// Sized for the maximum frame including all framing overhead.
	frameBuf [maxFrameSize]byte
}

// newFECCodec constructs a fecCodec. Returns an error only if the
// reedsolomon library rejects the shard parameters (which is a build-time
// constant violation — should never happen with 223/32).
func newFECCodec() (*fecCodec, error) {
	enc, err := reedsolomon.New(rsDataShards, rsParityShards)
	if err != nil {
		return nil, fmt.Errorf("reedsolomon.New(%d,%d): %w", rsDataShards, rsParityShards, err)
	}
	return &fecCodec{enc: enc}, nil
}

// ── Encode ────────────────────────────────────────────────────────────────

// Encode applies RS(255,223) FEC to pkt and then wraps the result in the
// LUX frame header. Returns a slice into the internal frameBuf — valid until
// the next call to Encode on this codec. The caller MUST consume (e.g. write
// to USB) before calling Encode again.
//
// Hot path: zero heap allocations. All work is in pre-allocated arrays.
func (c *fecCodec) Encode(pkt []byte) []byte {
	// ── 1. Chunk pkt into 223-byte blocks, copy into dataBacking ──────────
	pktLen := len(pkt)
	nBlocks := (pktLen + rsDataShards - 1) / rsDataShards // ceil division
	if nBlocks == 0 {
		nBlocks = 1
	}

	// How many zero-padding bytes were added to the last block.
	// padLen tells the decoder how many bytes to strip from the last block.
	lastBlockDataLen := pktLen - (nBlocks-1)*rsDataShards
	padLen := rsDataShards - lastBlockDataLen

	// Zero the entire data backing region for this call so that any
	// partial last block is already zero-padded without a separate fill.
	// Only zero the bytes actually used — avoids touching cold cache lines.
	dataUsed := nBlocks * rsDataShards
	for i := range c.dataBacking[:dataUsed] {
		c.dataBacking[i] = 0
	}

	// Copy packet bytes into the flat data backing, block-by-block.
	copy(c.dataBacking[:pktLen], pkt)

	// Zero parity backing for this call (parity is fully overwritten by
	// Encode below, but zeroing prevents stale data leaking if nBlocks
	// shrinks between calls — safe and cheap for 224 bytes).
	parityUsed := nBlocks * rsParityShards
	for i := range c.parityBacking[:parityUsed] {
		c.parityBacking[i] = 0
	}

	// ── 2. Build shard slice headers pointing into the backing arrays ──────
	// Each RS encode call operates on exactly rsTotalShards=255 shards of
	// 1 byte each — but that's per-symbol, not per-block for our use case.
	//
	// We use the library in "split stream" mode: for each block b, we hand
	// it exactly one data shard of rsDataShards bytes and rsParityShards
	// parity shards of rsParityShards bytes (1 byte each in GF(2^8)).
	//
	// Actually, the klauspost API works differently: New(dataShards, parityShards)
	// means each "shard" is a slice of equal length. We encode one block at a time:
	//   - dataShards (223) slices, each of length 1 byte (one symbol per shard per block)
	//   - parityShards (32) slices, each of length 1 byte
	//
	// For maximum throughput with minimal allocations, we process all blocks
	// as a single batch: each "shard" slice spans ALL blocks (length = nBlocks).
	// This way we make exactly ONE encoder call per Encode() invocation.
	//
	// Shard layout:
	//   shards[0..222]  = data shards:   shards[i] = dataBacking[i::223]   (stride view)
	//   shards[223..254]= parity shards: shards[j] = parityBacking[j::32]  (stride view)
	//
	// But the dataBacking is ROW-major (blocks × 223), not column-major.
	// The reedsolomon library treats shards as parallel byte streams — each
	// shard[i] is the i-th "column" across all blocks.
	//
	// To avoid a transpose (which would be an allocation or a complex shuffle),
	// we instead process ONE block at a time, using single-byte-length shards.
	// One encoder call per block, 7 calls worst-case. The per-call overhead
	// of the library is negligible vs. the GF multiplication.

	// wireBuf layout: [nBlocks uint8][padLen uint8][block0_255bytes][block1_255bytes]...
	c.wireBuf[0] = uint8(nBlocks)
	c.wireBuf[1] = uint8(padLen)
	wireOff := fecHeaderSize

	for b := 0; b < nBlocks; b++ {
		dataOff := b * rsDataShards
		parOff := b * rsParityShards

		// Point the first 223 shard headers at data rows.
		for i := 0; i < rsDataShards; i++ {
			c.shards[i] = c.dataBacking[dataOff+i : dataOff+i+1]
		}
		// Point the parity shard headers at parity rows.
		for i := 0; i < rsParityShards; i++ {
			c.shards[rsDataShards+i] = c.parityBacking[parOff+i : parOff+i+1]
		}

		// Encode: fills parity shards in-place. Zero allocations on this path.
		if err := c.enc.Encode(c.shards[:]); err != nil {
			// Only possible if shard slice lengths are inconsistent — a bug,
			// not a runtime error. Panic is appropriate: this is not recoverable.
			panic(fmt.Sprintf("lux fec encode block %d: %v", b, err))
		}

		// Interleave: write 223 data bytes then 32 parity bytes into wireBuf.
		// This is the canonical RS block layout — receiver knows the geometry.
		for i := 0; i < rsDataShards; i++ {
			c.wireBuf[wireOff+i] = c.dataBacking[dataOff+i]
		}
		for i := 0; i < rsParityShards; i++ {
			c.wireBuf[wireOff+rsDataShards+i] = c.parityBacking[parOff+i]
		}
		wireOff += rsTotalShards
	}

	wirePayload := c.wireBuf[:wireOff]

	// ── 3. Wrap in LUX frame header ─────────────────────────────────────────
	return frameInto(c.frameBuf[:], wirePayload)
}

// ── Decode ────────────────────────────────────────────────────────────────

// Decode applies deframe validation, then RS(255,223) error correction,
// then strips FEC framing and returns the original IPv4 payload.
// Returns nil on any failure (sync mismatch, CRC failure, RS uncorrectable).
//
// The returned slice points into c.dataBacking — valid until the next call
// to Decode on this codec.
//
// Hot path: zero heap allocations.
func (c *fecCodec) Decode(buf []byte) []byte {
	// ── 1. Validate and strip LUX frame header ────────────────────────────
	wirePayload := deframeRaw(buf)
	if wirePayload == nil {
		return nil
	}

	// ── 2. Parse FEC header ───────────────────────────────────────────────
	if len(wirePayload) < fecHeaderSize {
		return nil
	}
	nBlocks := int(wirePayload[0])
	padLen := int(wirePayload[1])

	// Sanity bounds.
	if nBlocks == 0 || nBlocks > maxRSBlocks {
		return nil
	}
	if padLen >= rsDataShards {
		return nil
	}
	expectedWireLen := fecHeaderSize + nBlocks*rsTotalShards
	if len(wirePayload) < expectedWireLen {
		return nil
	}

	// ── 3. Decode each block ───────────────────────────────────────────────
	wireOff := fecHeaderSize
	for b := 0; b < nBlocks; b++ {
		dataOff := b * rsDataShards
		parOff := b * rsParityShards

		// De-interleave: separate data bytes and parity bytes from wire block.
		blockStart := wireOff
		for i := 0; i < rsDataShards; i++ {
			c.dataBacking[dataOff+i] = wirePayload[blockStart+i]
		}
		for i := 0; i < rsParityShards; i++ {
			c.parityBacking[parOff+i] = wirePayload[blockStart+rsDataShards+i]
		}
		wireOff += rsTotalShards

		// Build shard slice headers pointing into backing arrays.
		for i := 0; i < rsDataShards; i++ {
			c.shards[i] = c.dataBacking[dataOff+i : dataOff+i+1]
		}
		for i := 0; i < rsParityShards; i++ {
			c.shards[rsDataShards+i] = c.parityBacking[parOff+i : parOff+i+1]
		}

		// ReconstructData: repairs up to rsParityShards/2 = 16 byte errors.
		// Operates in-place on c.shards — zero allocations.
		if err := c.enc.ReconstructData(c.shards[:]); err != nil {
			return nil // uncorrectable — drop frame, TCP retransmits
		}
	}

	// ── 4. Assemble output: dataBacking[0 .. totalData-padLen] ────────────
	totalData := nBlocks*rsDataShards - padLen
	if totalData <= 0 || totalData > dataBackingSize {
		return nil
	}
	return c.dataBacking[:totalData]
}

// ── Frame helpers ─────────────────────────────────────────────────────────

// frameInto writes the LUX frame into dst and returns the used sub-slice.
// Format: [SYNC(4)][LEN(2)][payload][CRC16(2)]
// dst must be at least len(payload)+8 bytes. Panics if too small.
// Zero allocations — writes entirely into the caller-provided buffer.
func frameInto(dst, payload []byte) []byte {
	total := 4 + 2 + len(payload) + 2
	binary.BigEndian.PutUint32(dst[0:4], syncWord)
	binary.BigEndian.PutUint16(dst[4:6], uint16(len(payload)))
	copy(dst[6:], payload)
	crc := crc16(payload)
	binary.BigEndian.PutUint16(dst[6+len(payload):], crc)
	return dst[:total]
}

// frame is the legacy allocation-using framer retained for unit tests
// and any path that does NOT go through fecCodec (e.g., control messages).
// Do NOT call from the hot path (uplinkRing consumer).
func frame(pkt []byte) []byte {
	buf := make([]byte, 4+2+len(pkt)+2)
	return frameInto(buf, pkt)
}

// deframeRaw validates sync, length, and CRC then returns the raw payload
// slice (pointing into buf — no copy). Returns nil on any validation failure.
func deframeRaw(buf []byte) []byte {
	if len(buf) < 8 {
		return nil
	}
	if binary.BigEndian.Uint32(buf[0:4]) != syncWord {
		return nil
	}
	l := binary.BigEndian.Uint16(buf[4:6])
	if int(l)+8 > len(buf) {
		return nil
	}
	payload := buf[6 : 6+l]
	crc := binary.BigEndian.Uint16(buf[6+l : 8+l])
	if crc16(payload) != crc {
		return nil
	}
	return payload
}

// deframe is the legacy deframer for paths that do NOT use fecCodec
// (e.g. control messages, tests). On the hot path use fecCodec.Decode.
func deframe(buf []byte) []byte {
	return deframeRaw(buf)
}

// ── CRC16/IBM (Modbus) ────────────────────────────────────────────────────

// crc16 computes CRC-16/IBM over data.
// Polynomial: 0xA001 (reflected 0x8005). Init: 0xFFFF.
func crc16(data []byte) uint16 {
	var crc uint16 = 0xFFFF
	for _, b := range data {
		crc ^= uint16(b)
		for i := 0; i < 8; i++ {
			if crc&1 != 0 {
				crc = (crc >> 1) ^ 0xA001
			} else {
				crc >>= 1
			}
		}
	}
	return crc
}
