# LUX_MANIFEST.md — PROJECT LUX SAVE STATE
> **This file is the canonical context handoff document for Project LUX.**
> Any AI model reading this file has everything it needs to continue development
> without asking questions. Do not modify this file without appending a changelog entry.

---

## 0. Project Identity

| Field | Value |
|---|---|
| **Project Name** | Project LUX |
| **Mission** | Bare-metal Free Space Optics (FSO) IP network over 940 nm infrared laser |
| **Target Throughput** | 2–5 Mbps (line-rate 2 Mbps Manchester, with RS-FEC headroom) |
| **Host Platform** | macOS (primary), Linux (secondary via runtime.GOOS swap) |
| **MCU Platform** | Raspberry Pi Pico (RP2040) |
| **Language Split** | Pure Go (OS/kernel layer) + C (RP2040 firmware) + PIO ASM (signal layer) |
| **USB Protocol** | USB 2.0 High-Speed Bulk Transfer (gousb / libusb-1.0) — NO serial/CDC |
| **Source Conversation** | https://claude.ai/chat/13bd9ae1-32b8-4f1f-8317-e448e71459d6 |
| **PDF Reference** | ~/Downloads/Project LUX_ Free space optics network via infrared laser - Claude.pdf |

---

## 1. ARCHITECTURE RULES (Non-Negotiable)

### 1.1 RP2040 PIO Manchester RX — 3/4T Sampling Math (FINAL v3)

**Clock setup:**
- System clock: sys_clk = 125 MHz
- SM clock divider: 125 / 32 = 3.90625 → SM clk = 32 MHz
- 1 SM cycle = 31.25 ns
- Bit period T = 16 cycles (500 ns/bit at 2 Mbps)

**The 3/4T Trick — Phase Breakdown (edge-relative):**
```
t = 0.0T  → Mid-bit edge detected (wait 1/0 pin 0 fires)
t = 0.25T → Pre-sample delay: nop [3] = 4 cycles
            SAMPLE: in pins, 1 (1 cycle — counts toward post-sample budget)
t = 0.75T → Stable half-cell sampled CORRECT
t = 1.25T → Post-sample delay: nop [6] = 7 cycles (7 + 1 consumed by in = 8 = 0.5T)
            SM is now BLIND through the 1.0T boundary transition
            Re-armed to catch next mid-bit edge at 1.5T CORRECT
```

**Cycle accounting (edge-relative):**
```
nop[3] (4) + in (1) + nop[6] (7) = 12 cycles = 0.75T after edge
Absolute: 0.5T (edge) + 0.75T (delay) = 1.25T VERIFIED
```

**CRITICAL ERRORS — NEVER REPEAT:**
- WRONG: nop [11] after edge = 12 cycles = 1.25T → samples NEXT bit (time-travel bug)
- WRONG: hardcoded wait 1/wait 0 alternating = breaks on consecutive identical bits (11, 00)
- CORRECT: jmp pin at loop top to dynamically select edge polarity

**Final PIO Assembly (manchester_rx.pio v3 — ONLY valid version):**
```asm
; manchester_rx.pio  (v3 — corrected phase math, self-correcting polarity)
; sys_clk = 125 MHz, SM clk = 32 MHz (31.25 ns/cycle), T = 16 cycles
.program manchester_rx
.wrap_target
sync_check:
    jmp pin high_now         ; test current pin level via JMP_PIN
low_now:
    wait 1 pin 0              ; block for mid-bit RISING edge (t = 0.5T)
    jmp got_edge
high_now:
    wait 0 pin 0              ; block for mid-bit FALLING edge (t = 0.5T)
got_edge:
    nop [3]                   ; 4 cycles = 0.25T past edge = 0.75T absolute
    in pins, 1                ; SAMPLE at exactly 0.75T (stable half-cell)
    nop [6]                   ; 7 cycles (in consumed 1) = 1.25T absolute
                              ; SM blind through 1.0T boundary, re-armed for 1.5T
.wrap
```

**C-side init (mandatory):**
```c
sm_config_set_jmp_pin(&c, RX_PIN);          // REQUIRED: without this jmp pin reads GPIO 0
sm_config_set_in_pins(&c, RX_PIN);
sm_config_set_in_shift(&c, false, true, 8); // MSB-first, autopush @ 8 bits
float div = (float)clock_get_hz(clk_sys) / 32000000.0f;
sm_config_set_clkdiv(&c, div);
```

---

### 1.2 Manchester TX PIO

**Clock:** SM = 8 MHz (divider = 15.625, exact), 1 cycle = 125 ns, 2 cycles/half-bit = 250 ns → 2 Mbps
**Convention:** IEEE 802.3 — bit=1: HIGH→LOW, bit=0: LOW→HIGH

```asm
; manchester_tx.pio
.program manchester_tx
.side_set 1 opt
.wrap_target
    pull block
    set x, 31
bitloop:
    out y, 1
    jmp !y do_zero
do_one:
    nop            side 1 [1]
    jmp bit_end    side 0 [1]
do_zero:
    nop            side 0 [1]
    jmp bit_end    side 1 [1]
bit_end:
    jmp x-- bitloop
.wrap
```

---

### 1.3 Go SPSC Ring — False-Sharing and Zero-Allocation Rules

**False-sharing rule:** head (producer) and tail (consumer) MUST be on separate 64-byte cache lines.
Without padding, every write by one core invalidates the other core's cache line (MESI Invalid).

**Verified struct layout:**
```go
const cacheLineSize = 64 // verify: sysctl hw.cachelinesize (Apple M-series may be 128)

type packetSlot struct {
    buf [mtu]byte
    n   int
}

type spscRing struct {
    slots [ringSize]packetSlot
    _pad0 [cacheLineSize]byte      // isolate slots[] from head cache line
    head  atomic.Uint64             // written ONLY by producer
    _pad1 [cacheLineSize - 8]byte  // pad to full 64B line
    tail  atomic.Uint64             // written ONLY by consumer
    _pad2 [cacheLineSize - 8]byte  // isolate tail from following memory
    notify chan struct{}             // capacity=1 doorbell — NOT a data channel
}
```

**Zero-allocation rule:**
- FORBIDDEN: time.After() in hot loop = GC bomb (allocates Timer on heap every call)
- CORRECT: capacity-1 doorbell alone. With pop() draining ring before select, missed wakeup is structurally impossible.

**Correct consumer (spin → yield → park):**
```go
const (
    spinIters  = 200
    yieldIters = 100
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
        case spins < spinIters+yieldIters:
            spins++
            runtime.Gosched()
        default:
            <-r.notify // parks goroutine, ~0% CPU while idle
            spins = 0
        }
    }
}
```

---

### 1.4 TLV3501 Hysteresis Math — ±30 mV Band

Supply: VCC = 3.3V, mid-rail = 1.65V

```
Vhys = VCC / (2·Rf/Rb + 1) = 60 mV target
→ Rf/Rb = 27 → Rb = 3.6 kΩ, Rf = 100 kΩ
Verified: Vhys = 58 mV (±29 mV), center = 1.650 V = VCC/2
```

| Ref | Value | Node |
|-----|-------|------|
| R1 | 3.6 kΩ | VCC → V+ |
| R2 | 3.6 kΩ | V+ → GND |
| R3 | 100 kΩ | V+ → Vout (positive feedback) |
| Rseries | 49.9 Ω | TIA output → V− (ringing damper) |

Signal chain: Photodiode → OPA380 TIA → 100nF AC-couple → TLV3501 → RP2040 GPIO

---

### 1.5 OPA380 TIA Component Values

| Part | Value | Notes |
|------|-------|-------|
| Rf | 10 kΩ, 1%, thin-film | Gain: 10kΩ × I_photo → 500 mV at 50 µA |
| Cf | 1.3 pF (use 1.0 or 1.5 pF C0G/NP0 0201) | Hand-tune on bench |
| Photodiode | Osram SFH 203 or Vishay VEMD5510C | Cd ≈ 3-10 pF reversed. NOT BPW34 (70 pF!) |
| GBP (OPA380) | 90 MHz | — |
| f_-3dB | ~12 MHz | Cf = sqrt(10e-12/(2π×10k×90M)) ≈ 1.33 pF |

---

### 1.6 PCB Layout Rules (Parasitic Nullification)

1. Cut GND AND 3.3V planes under IN- trace, Rf footprint, Cf footprint. Extend 1mm beyond pads on ALL layers except signal layer.
2. Use 0201 NP0/C0G for Cf. (0402 alone adds 0.3-0.5 pF — unacceptable.)
3. Guard trace (NOT guard plane) driven to IN- potential — zero capacitance contribution.
4. Max 3 mm trace from photodiode cathode → IN- → Rf/Cf → output. No vias. Same layer.
5. Iterate Cf empirically with scope. Trust math as starting point only.

---

### 1.7 USB and Framing Constants

```go
const (
    syncWord  uint32    = 0xCAFEF00D
    usbVID    gousb.ID  = 0x2E8A      // RP2040 default
    usbPID    gousb.ID  = 0x000A
    bulkOutEP           = 0x01
    bulkInEP            = 0x81
    mtu                 = 1500
    ringSize            = 1024        // must be power of 2
)
// Frame format: [SYNC(4)][LEN(2)][PAYLOAD][CRC16(2)]
// CRC16: Modbus polynomial 0xA001
// FEC: RS(255,223) — github.com/klauspost/reedsolomon — encode before Write, decode after Read
```

---

## 2. DIRECTORY MAP

```
/Users/samiranmishra/Documents/Project Lux/
|
+-- LUX_MANIFEST.md              <- YOU ARE HERE — AI save state
|
+-- go_kernel/                   <- Pure Go: TUN + USB Bulk
|   +-- go.mod                   <- module github.com/lux-net/kernel
|   +-- main.go                  <- Entry: openUtun + USB + goroutines
|   +-- tun_darwin.go            <- macOS utun via PF_SYSTEM/SYSPROTO_CONTROL
|   +-- tun_linux.go             <- Linux /dev/net/tun via ioctl
|   +-- ring.go                  <- spscRing: cache-line-padded, doorbell
|   +-- frame.go                 <- frame/deframe + CRC16 + RS-FEC scaffold
|   +-- usb.go                   <- USB Bulk endpoint helpers
|
+-- firmware/                    <- C code for RP2040
|   +-- CMakeLists.txt
|   +-- pio/
|   |   +-- manchester_tx.pio    <- TX PIO assembly
|   |   +-- manchester_rx.pio    <- RX PIO assembly (v3 ONLY)
|   +-- src/
|       +-- main.c               <- TinyUSB + PIO + DMA init
|       +-- lux_tx.c             <- USB bulk-out -> DMA -> TX FIFO
|       +-- lux_rx.c             <- RX PIO ISR -> DMA -> USB bulk-in
|       +-- usb_descriptors.c    <- TinyUSB device descriptor
|
+-- docs/
    +-- schematics/
    |   +-- TIA_OPA380.md
    |   +-- comparator_TLV3501.md
    +-- pcb_rules/
        +-- parasitic_nullification.md
```

---

## 3. CURRENT STATE

### Completed
- [x] LUX_MANIFEST.md — full AI save state
- [x] Directory structure initialized
- [x] go_kernel/go.mod — module initialized
- [x] go_kernel/ring.go — spscRing, zero-alloc consumer, doorbell
- [x] go_kernel/tun_darwin.go — openUtun() macOS implementation
- [x] go_kernel/frame.go — RS(255,223) FEC encoder/decoder (zero-alloc hot path), framing, CRC16
- [x] go_kernel/main.go — entry point, goroutine topology, FEC codecs wired in
- [x] firmware/pio/manchester_tx.pio — TX assembly (v1, 2 Mbps)
- [x] firmware/pio/manchester_rx.pio — RX assembly (v3, corrected 3/4T phase)
- [x] firmware/src/main.c — TinyUSB + PIO + DMA init
- [x] firmware/src/lux_tx.c — TX DMA path
- [x] firmware/src/lux_rx.c — RX DMA path
- [x] firmware/src/usb_descriptors.c — TinyUSB device descriptor
- [x] docs/schematics/TIA_OPA380.md
- [x] docs/schematics/comparator_TLV3501.md
- [x] docs/pcb_rules/parasitic_nullification.md

### Pending
- [ ] go_kernel/usb.go — USB Bulk endpoint helpers (optional refactor from main.go)
- [ ] firmware/CMakeLists.txt — (Requires pico-sdk environment setup)
- [ ] Hardware bench test: validate 3/4T timing with oscilloscope
- [ ] Integration test: send known IP packet over loopback, verify round-trip recovery

---

## 4. KNOWN BUGS AND RESOLUTIONS (DO NOT RE-INTRODUCE)

| Bug | Root Cause | Resolution |
|-----|-----------|------------|
| PIO Time-Travel | nop [11] after edge = 1.25T absolute, samples NEXT bit | nop [3] + in + nop [6] = 0.75T past edge (v3) |
| PIO Desync Repeated Bits | Hardcoded wait 1/wait 0 breaks on 11 or 00 | jmp pin at loop top for dynamic edge polarity |
| SPSC False Sharing | head and tail on same 64B cache line, MESI storms | _pad1/_pad2 [cacheLineSize-8]byte between atomics |
| GC Bomb | time.After() in hot loop allocates Timer every call | Remove. Capacity-1 doorbell is structurally sufficient |
| Blocking USB Loop | tun.Read directly blocking outEP.Write | Decoupled via spscRing producer/consumer goroutines |

---

## 5. CONTEXT HANDOFF FOR NEXT AI MODEL

1. Read this entire file before touching any code.
2. PIO v3 is the ONLY correct Manchester RX assembly. v1 and v2 have documented bugs.
3. Never use time.After() in any hot path.
4. Check Section 3 for current state. Continue from pending items.
5. Source PDF: ~/Downloads/Project LUX_ Free space optics network via infrared laser - Claude.pdf
6. Apple Silicon: run `sysctl hw.cachelinesize` — if 128, set cacheLineSize = 128 in ring.go.

---

## 6. CHANGELOG

| Date | Author | Change |
|------|--------|--------|
| 2026-07-06 | Antigravity (Lead Systems Architect) | Initial manifest from Claude conversation PDF. All arch rules, math, directory map, bug registry captured. |
