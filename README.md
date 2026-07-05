# Project LUX 

<div align="center">
  <img src="https://img.shields.io/badge/Language-Go%20%7C%20C-00ADD8?style=for-the-badge&logo=go" alt="Go | C" />
  <img src="https://img.shields.io/badge/Hardware-RP2040-4B0082?style=for-the-badge" alt="RP2040" />
  <img src="https://img.shields.io/badge/Architecture-Bare--Metal-FF4500?style=for-the-badge" alt="Bare-Metal" />
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge" alt="Status" />
</div>

<br/>

**Project LUX** is a high-speed, bare-metal Photonic IP Network. It completely bypasses standard RF, Wi-Fi, and Ethernet, transmitting raw IPv4 packets over an invisible 2 MHz Infrared Light beam at 3G speeds. Built entirely from the ground up, LUX features a zero-allocation Go kernel driver mapping virtual network interfaces (TUN) directly to an RP2040-driven optical transceiver via high-speed USB bulk endpoints.

---

## ⚡ The Architecture (The Flex)

LUX is designed for extreme performance, exploiting CPU-level cache geometries, custom hardware-accelerated framing, and zero-copy datapaths.

### Kernel Layer (Go): Zero-Allocation & False-Sharing Immunity
The host daemon operates completely lock-free. It utilizes custom **SPSC (Single-Producer Single-Consumer) Ring Buffers** heavily optimized for modern CPU topologies:
- **L1 Cache-Line Padding:** Head and tail atomics are separated by explicit 64-byte padding. This absolutely eliminates SMP False-Sharing—preventing the producer's writes from triggering MESI Invalidations on the consumer's cache line.
- **Zero-Allocation Datapath:** Memory is pre-allocated at startup. There are zero heap allocations (`make()`, `new()`, or dynamically sized slices) on the hot path, resulting in zero Garbage Collection (GC) jitter at gigabit network speeds.

### Error Correction: In-Place RS(255, 223) FEC
Because free-space optics are susceptible to atmospheric scattering and noise, LUX integrates forward error correction:
- **Zero-Allocation Reed-Solomon:** The RS(255, 223) encoding/decoding operates entirely in-place. 
- **Exact MTU Chunking:** The 1500-byte IPv4 MTU is automatically chunked into 223-byte blocks, encoded into 255-byte shards, and reconstructed without triggering the GC.

### Hardware Layer (RP2040): CPU-less Optical Routing
The RP2040 microcontroller does not use its ARM Cortex-M0+ cores for data routing. 
- **Direct DMA Bridging:** Incoming USB Bulk packets from the TinyUSB stack are bridged directly via hardware DMA channels into the PIO state machine FIFOs. The CPU merely oversees link state; the silicon hardware routes the megabytes.

### Signal Processing (PIO): Manchester Phase Math
Optical signals require DC-balanced line codes. We implemented a custom Manchester Encoder/Decoder directly in the RP2040's Programmable I/O (PIO) assembly:
- **3/4T Phase Sampling:** To prevent clock desynchronization over long packets, the PIO RX state machine dynamically realigns its sampling phase on every edge transition.
- **Cycle-Accurate Math:** The sampling window is calculated precisely (`nop[3]` → `in pins, 1` → `nop[6]`) to guarantee the analog pin is sampled exactly at the 75% (3/4T) mark of the bit period, maximizing the signal-to-noise ratio margin.

---

## 🛠️ The Hardware BOM

To build the LUX optical transceiver, you will need:

1. **Microcontroller:** Raspberry Pi Pico (RP2040)
2. **Infrared Emitter:** High-power IR LED + **IRLZ44N MOSFET** for fast switching.
3. **Photodiode:** Fast PIN Photodiode (e.g., **Osram SFH 203**). *Do not use high-capacitance ambient light sensors.*
4. **Transimpedance Amplifier (TIA):** **OPA380** (Precision, high-speed TIA).
5. **Hysteresis Comparator:** **TLV3501** (4.5ns ultra-fast comparator).

### ⚠️ PCB & Analog Warnings
The analog front-end is highly sensitive. The TIA feedback loop relies on a precisely calculated 1.3pF capacitor.
- **Ground Cutouts:** You MUST remove the ground plane directly underneath the photodiode and the TIA's inverting input.
- **Guard Traces:** Implement guard traces to prevent leakage currents.
- Failure to control parasitic PCB trace capacitance will destroy the 1.3pF feedback loop, causing massive ringing and destroying the 2 MHz bandwidth.

---

## 🚀 Build & Run Instructions

### 1. Build the RP2040 Firmware (C/PIO)
You must have the [Raspberry Pi Pico SDK](https://github.com/raspberrypi/pico-sdk) installed and configured.

```bash
cd firmware
mkdir build && cd build
cmake ..
make -j4
```
*Flash the resulting `lux_firmware.uf2` file onto your RP2040.*

### 2. Run the Host Daemon (Go)
Requires Go 1.21+ and a macOS or Linux host.

```bash
cd go_kernel
go mod tidy
go build -o lux_daemon ./...
sudo ./lux_daemon
```

*Note: On macOS, this will automatically allocate a `utun` interface. Configure the IP routes as prompted in the console output.*
