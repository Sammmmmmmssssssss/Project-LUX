// frame.go — Project LUX
// Layer 2 framing: sync word, length prefix, CRC32 integrity check.
//
// ═══════════════════════════════════════════════════════════════════════════
// LUX WIRE FORMAT
// ═══════════════════════════════════════════════════════════════════════════
//
//   TX pipeline (see main.go, Goroutine 2):
//     IPv4 pkt → frameInto() → USB Bulk OUT → RP2040
//
//   RX pipeline (see main.go, Goroutine 3):
//     USB Bulk IN → deframeRaw() → TUN
//
//   Wire layout of a single LUX frame on the USB/optical link:
//     ┌──────────┬──────────┬───────────────────────┬──────────┐
//     │ SYNC (4B)│  LEN (2B)│     PAYLOAD (var)     │ CRC32(4B)│
//     └──────────┴──────────┴───────────────────────┴──────────┘
//     SYNC = 0xCAFEF00D (big-endian)
//     LEN  = byte length of PAYLOAD (big-endian uint16)
//     CRC32= IEEE CRC32 over PAYLOAD only (big-endian uint32)
//
// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION NOTES
// ═══════════════════════════════════════════════════════════════════════════
//   frameInto()  — zero allocation. Writes into a caller-supplied buffer.
//   frame()      — allocates. For tests and control messages ONLY. Not hot path.
//   deframeRaw() — zero allocation. Returns a sub-slice of the input buffer.
//   deframe()    — alias for deframeRaw. For compatibility with tests.

package main

import (
	"encoding/binary"
	"hash/crc32"
)

// syncWord is the 4-byte magic number at the start of every LUX frame.
// 0xCAFEF00D chosen for high Hamming distance from 0x00000000 and 0xFFFFFFFF.
const syncWord uint32 = 0xCAFEF00D

// maxFrameSize: sync(4) + len(2) + mtu(1500) + crc32(4) = 1510 bytes
const maxFrameSize = 1510

// frameInto writes a complete LUX frame into dst and returns the used slice.
// Format: [SYNC(4)][LEN(2)][payload][CRC32(4)]
//
// dst must be at least len(payload)+10 bytes. Panics if too small.
// Zero allocations — writes entirely into the caller-supplied buffer.
// The CRC covers only the payload — not the sync or length fields.
func frameInto(dst, payload []byte) []byte {
	total := 4 + 2 + len(payload) + 4
	binary.BigEndian.PutUint32(dst[0:4], syncWord)
	binary.BigEndian.PutUint16(dst[4:6], uint16(len(payload)))
	copy(dst[6:], payload)
	crc := crc32.ChecksumIEEE(payload)
	binary.BigEndian.PutUint32(dst[6+len(payload):], crc)
	return dst[:total]
}

// frame allocates a new byte slice and writes a LUX frame into it.
// Use ONLY for unit tests and non-hot-path control messages.
// The hot path (uplinkRing consumer) must use frameInto on its pre-allocated frameBuf.
func frame(pkt []byte) []byte {
	buf := make([]byte, 4+2+len(pkt)+4)
	return frameInto(buf, pkt)
}

// deframeRaw validates the sync word, length field, and CRC32 of buf,
// then returns the raw payload slice (a zero-copy sub-slice of buf).
// Returns nil on any validation failure — caller treats nil as a dropped frame.
//
// Zero allocations — the returned slice points into buf.
func deframeRaw(buf []byte) []byte {
	if len(buf) < 10 {
		return nil // minimum frame: sync(4) + len(2) + crc(4), zero payload
	}
	if binary.BigEndian.Uint32(buf[0:4]) != syncWord {
		return nil // sync mismatch — not a LUX frame or severe corruption
	}
	l := binary.BigEndian.Uint16(buf[4:6])
	if int(l)+10 > len(buf) {
		return nil // truncated payload — partial USB read, retry at transport layer
	}
	payload := buf[6 : 6+l]
	crc := binary.BigEndian.Uint32(buf[6+l : 10+l])
	if crc32.ChecksumIEEE(payload) != crc {
		return nil // CRC failure — drop frame
	}
	return payload
}

// deframe is an alias for deframeRaw for use in tests and non-FEC paths.
func deframe(buf []byte) []byte {
	return deframeRaw(buf)
}
