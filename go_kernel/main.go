// main.go — Project LUX
// Entry point: opens the macOS utun TUN interface, initializes USB Bulk
// transport to the RP2040, and launches the 4-goroutine lock-free pipeline:
//
//   [TUN kernel] → tunReader → uplinkRing → usbWriter → [RP2040 TX PIO]
//   [RP2040 RX PIO] → usbReader → downlinkRing → tunWriter → [TUN kernel]
//
// Key invariants (see LUX_MANIFEST.md §1.3):
//   - TUN reader and USB writer are NEVER on the same goroutine.
//     Decoupling them via spscRing prevents USB jitter from stalling
//     the kernel TUN buffer (which would cause the OS to drop packets).
//   - All inter-goroutine data movement is through spscRing (lock-free).
//   - No channels carry packet data — channels are doorbells only.
//   - dropCount is the only shared atomic modified by multiple goroutines.
//
// Post-launch setup (run these once after the binary starts):
//   sudo ifconfig <ifname> 10.0.0.1 10.0.0.2 up
//   sudo route add -net 10.0.0.0/24 -interface <ifname>

package main

import (
	"fmt"
	"log"
	"sync/atomic"

	"github.com/google/gousb"
)

// USB device identifiers for the RP2040 running the LUX firmware.
// Default RP2040 TinyUSB VID/PID — update if you set a custom descriptor.
const (
	usbVID    gousb.ID = 0x2E8A
	usbPID    gousb.ID = 0x000A
	bulkOutEP          = 0x01 // host → RP2040 (TX path)
	bulkInEP           = 0x81 // RP2040 → host (RX path)
	mtu                = 1500 // max IPv4 payload, matches utun read buffer
)

// dropCount tracks tail-dropped packets (ring full). Expose via a /metrics
// endpoint or periodic log to detect when USB throughput cannot keep up.
var dropCount atomic.Uint64

func main() {
	// ── TUN Interface ──────────────────────────────────────────────────────
	tun, name := openUtun()
	defer tun.Close()
	fmt.Printf("[LUX] Virtual interface ready: %s\n", name)
	fmt.Printf("[LUX] Configure with:\n")
	fmt.Printf("  sudo ifconfig %s 10.0.0.1 10.0.0.2 up\n", name)
	fmt.Printf("  sudo route add -net 10.0.0.0/24 -interface %s\n", name)

	// ── USB Bulk Transport ─────────────────────────────────────────────────
	ctx := gousb.NewContext()
	defer ctx.Close()

	dev, err := ctx.OpenDeviceWithVIDPID(usbVID, usbPID)
	if err != nil || dev == nil {
		log.Fatalf("[LUX] USB device not found (VID=%04X PID=%04X): %v", usbVID, usbPID, err)
	}
	defer dev.Close()

	cfg, err := dev.Config(1)
	if err != nil {
		log.Fatalf("[LUX] USB config(1): %v", err)
	}
	defer cfg.Close()

	intf, err := cfg.Interface(0, 0)
	if err != nil {
		log.Fatalf("[LUX] USB interface(0,0): %v", err)
	}
	defer intf.Close()

	outEP, err := intf.OutEndpoint(bulkOutEP)
	if err != nil {
		log.Fatalf("[LUX] USB out endpoint 0x%02X: %v", bulkOutEP, err)
	}

	inEP, err := intf.InEndpoint(bulkInEP)
	if err != nil {
		log.Fatalf("[LUX] USB in endpoint 0x%02X: %v", bulkInEP, err)
	}

	fmt.Printf("[LUX] USB Bulk transport established\n")

	// ── Lock-Free Rings ────────────────────────────────────────────────────
	uplinkRing := newSPSCRing()   // TUN → USB
	downlinkRing := newSPSCRing() // USB → TUN

	// ── Goroutine 1: TUN Reader (producer for uplink ring) ─────────────────
	// Drains the kernel buffer as fast as the OS delivers packets.
	// MUST NOT be blocked by USB latency — that's what the ring is for.
	go func() {
		// utun prepends a 4-byte AF header to every packet on macOS.
		raw := make([]byte, mtu+4)
		for {
			pkt, err := readTun(tun, raw)
			if err != nil {
				log.Printf("[LUX] tun read: %v", err)
				continue
			}
			if pkt == nil {
				continue
			}
			if !uplinkRing.push(pkt) {
				dropCount.Add(1) // ring full — drop newest, TCP will retransmit
			}
		}
	}()

	// ── Goroutine 2: USB Writer (consumer of uplink ring) ──────────────────
	// Reads from the uplink ring, frames the packet, and writes to RP2040.
	// Decoupled from TUN reader — USB stalls do not backpressure the kernel.
	go func() {
		var frameBuf [maxFrameSize]byte
		consumeLoop(uplinkRing, func(pkt []byte) {
			// frameInto writes directly into the pre-allocated frameBuf.
			// Zero heap allocations.
			framed := frameInto(frameBuf[:], pkt)
			if _, err := outEP.Write(framed); err != nil {
				log.Printf("[LUX] usb write: %v", err)
			}
		})
	}()

	// ── Goroutine 3: USB Reader (producer for downlink ring) ───────────────
	// Reads incoming frames from the RP2040 RX PIO path, deframes, and
	// pushes recovered IPv4 payload into the downlink ring.
	go func() {
		// maxFrameSize covers the worst-case encoded frame with all headers.
		buf := make([]byte, maxFrameSize)
		for {
			n, err := inEP.Read(buf)
			if err != nil {
				log.Printf("[LUX] usb read: %v", err)
				continue
			}
			// deframeRaw validates CRC32 and returns the raw IPv4
			// payload pointing into buf. Zero allocations.
			pkt := deframeRaw(buf[:n])
			if pkt == nil {
				continue // CRC or framing failure — drop
			}
			// push copies pkt into the ring slot before returning.
			if !downlinkRing.push(pkt) {
				dropCount.Add(1)
			}
		}
	}()

	// ── Main goroutine: TUN Writer (consumer of downlink ring) ─────────────
	// Injects received packets back into the macOS IP stack via the TUN fd.
	// Runs on the main goroutine — no 5th goroutine needed.
	//
	// tunWriteBuf is pre-allocated. OS-specific logic handles headers.
	tunWriteBuf := make([]byte, mtu+4)
	consumeLoop(downlinkRing, func(pkt []byte) {
		if err := writeTun(tun, pkt, tunWriteBuf); err != nil {
			log.Printf("[LUX] tun write: %v", err)
		}
	})

	// consumeLoop never returns under normal operation.
	log.Printf("[LUX] exiting — total dropped packets: %d", dropCount.Load())
}
