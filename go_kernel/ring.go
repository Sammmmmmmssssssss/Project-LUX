// ring.go — Project LUX
// Lock-free Single-Producer Single-Consumer ring buffer.
//
// Architecture rules (see LUX_MANIFEST.md §1.3):
//   - head and tail are on SEPARATE cache lines to prevent false-sharing.
//     Without padding, both atomics share a 64B line; every write by the
//     producer causes an MESI Invalid on the consumer's copy — destroying
//     the lock-free advantage completely.
//   - The notify channel is a capacity-1 DOORBELL, not a data channel.
//     With a pop() that fully drains the ring before reaching the select,
//     a missed wakeup is structurally impossible — no timeout needed.
//   - NEVER use time.After() in consumeLoop. It allocates a new Timer on
//     the heap every evaluation → GC storm → packet drops at network speeds.
//
// Consumer backoff: spin (200 iters) → yield (100 iters) → park on doorbell
// This keeps wake latency sub-100ns for the 2 Mbps real-time framing path.

package main

import (
	"runtime"
	"sync/atomic"
)

// cacheLineSize is the CPU cache line width.
// x86 and most ARM64: 64 bytes.
// Apple Silicon M-series: may be 128 bytes.
// Verify with: sysctl hw.cachelinesize
// If 128, change this constant and re-build.
const cacheLineSize = 64

// ringSize MUST be a power of 2 — enables bitwise mask (h & (ringSize-1))
// instead of modulo, which is critical on the hot path.
const ringSize = 1024

// packetSlot is a fixed-size slot in the ring.
// Written exclusively by the producer, read exclusively by the consumer
// after the atomic head store (happens-before via release/acquire semantics).
type packetSlot struct {
	buf [mtu]byte
	n   int
}

// spscRing is a lock-free SPSC ring buffer with explicit cache-line padding.
//
// Memory layout (addresses increase downward):
//   slots[]  — large data array, naturally crosses many cache lines
//   _pad0    — full cache line of padding to isolate slots from head
//   head     — 8 bytes, written ONLY by producer goroutine
//   _pad1    — 56 bytes padding to fill head's cache line to 64 bytes
//   tail     — 8 bytes, written ONLY by consumer goroutine
//   _pad2    — 56 bytes padding to isolate tail from any struct that follows
//   notify   — doorbell channel (pointer, 8 bytes)
type spscRing struct {
	slots [ringSize]packetSlot
	_pad0 [cacheLineSize]byte      // isolate slots[] tail from head's line
	head  atomic.Uint64            // written ONLY by producer
	_pad1 [cacheLineSize - 8]byte  // pad Uint64 (8B) to a full 64B line
	tail  atomic.Uint64            // written ONLY by consumer
	_pad2 [cacheLineSize - 8]byte  // isolate tail from whatever follows
	notify chan struct{}            // capacity=1 — doorbell, not a data queue
}

// newSPSCRing allocates and initializes the ring.
// Must use a constructor — the notify channel cannot be zero-value.
func newSPSCRing() *spscRing {
	return &spscRing{notify: make(chan struct{}, 1)}
}

// push writes data into the ring. Called ONLY by the producer goroutine.
// Returns false (drop-newest) when the ring is full — mirrors real NIC ring
// overflow behavior. TCP congestion control handles backpressure above this.
func (r *spscRing) push(data []byte) bool {
	h := r.head.Load()
	t := r.tail.Load()
	if h-t >= ringSize {
		return false // full
	}
	slot := &r.slots[h&(ringSize-1)]
	slot.n = copy(slot.buf[:], data)
	// Store with release semantics — the consumer's acquire on head.Load()
	// guarantees it sees the completed slot write before it reads the slot.
	r.head.Store(h + 1)
	// Non-blocking doorbell signal. Costs ~nothing when consumer is spinning
	// or yielding (not yet parked). If channel already holds a token, the
	// default branch fires and we skip — the parked consumer will wake on
	// the existing token and drain all pending slots including this one.
	select {
	case r.notify <- struct{}{}:
	default:
	}
	return true
}

// pop reads the next available packet from the ring. Called ONLY by consumer.
// Returns (nil, false) when empty.
func (r *spscRing) pop() ([]byte, bool) {
	t := r.tail.Load()
	if r.head.Load() == t {
		return nil, false // empty
	}
	slot := &r.slots[t&(ringSize-1)]
	out := slot.buf[:slot.n]
	// Store with release semantics — producer's next head check will see
	// this tail update and know the slot is free for reuse.
	r.tail.Store(t + 1)
	return out, true
}

// consumeLoop runs the consumer with a 3-tier backoff:
//   1. Spin   (spinIters):  busy-loop, sub-100ns wake latency.
//              This is where 2 Mbps real-time framing lives.
//              Do NOT add any syscall-crossing operations here.
//   2. Yield  (yieldIters): runtime.Gosched() — cooperative yield.
//              Still no thread suspension; other goroutines get a turn.
//   3. Park:   block on the doorbell channel.
//              ~0% CPU while idle. Woken by push() within nanoseconds.
//
// handle is called for every packet. It is called on the consumer goroutine
// and must not block for longer than a few microseconds or it will backlog
// the ring. USB write belongs in handle for the uplink path.
const (
	spinIters  = 200 // pure busy-spin threshold
	yieldIters = 100 // cooperative yield threshold
)

func consumeLoop(r *spscRing, handle func([]byte)) {
	spins := 0
	for {
		if pkt, ok := r.pop(); ok {
			spins = 0
			handle(pkt)
			continue
		}
		switch {
		case spins < spinIters:
			spins++
			// tight spin — intentionally no runtime call here
		case spins < spinIters+yieldIters:
			spins++
			runtime.Gosched()
		default:
			// Park the goroutine. push() will send a doorbell token
			// when new data arrives. With a capacity-1 channel and
			// pop() draining the ring completely before reaching here,
			// a missed wakeup is structurally impossible.
			<-r.notify
			spins = 0
		}
	}
}
