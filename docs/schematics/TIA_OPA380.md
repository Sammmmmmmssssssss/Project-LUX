# TIA Stage — OPA380 Transimpedance Amplifier

## Purpose
Convert microampere-level photocurrent from the IR photodiode into a
logic-level voltage swing that the TLV3501 comparator can cleanly threshold.

## Design Target
- Bit rate: 2 Mbps → Manchester transition rate: 4 MHz
- Required bandwidth: ≥ 10–12 MHz (rule of thumb: 5× the fundamental)
- Rise time at 12 MHz: ~29 ns (0.35/BW) — well under 250 ns half-bit period ✓

## Component Selection

### Photodiode
**DO NOT use BPW34 or similar large-area PIN diodes.**
- BPW34 junction capacitance: Cd ≈ 70 pF @ 0V bias → completely kills bandwidth
- Required: Osram SFH 203 or Vishay VEMD5510C
  - Cd ≈ 3–10 pF reverse-biased (use 10 pF for worst-case calculation)
  - Apply 5V reverse bias to reduce Cd by further 30–40%

### Feedback Resistor (Rf)
- Value: **10 kΩ, 1%, thin-film**
- Sets transimpedance gain: Vout = Rf × I_photo
- At 50 µA peak photocurrent (bright IR pulse, close range): 0.5 V swing

### Feedback Capacitor (Cf)
**Governing equation (noise-gain peaking stability):**
```
Cf = sqrt( Cd / (2π × Rf × GBP) )
   = sqrt( 10e-12 / (2π × 10,000 × 90e6) )
   = sqrt( 10e-12 / 5.655e9 )
   ≈ 1.33 pF
```

**OPA380 GBP = 90 MHz** (guaranteed minimum)

**f_-3dB verification:**
```
f_-3dB = 1 / (2π × Rf × Cf)
       = 1 / (2π × 10,000 × 1.33e-12)
       ≈ 12.0 MHz ✓
```

**BOM value:** 1.0 pF or 1.5 pF C0G/NP0, **0201 package** (NOT 0402)
- 0402 adds 0.3–0.5 pF PCB parasitic against adjacent ground plane
- At a 1.3 pF budget, that is 25–40% of the entire capacitance budget
- Hand-select from batch OR use a lab trimmer cap during bench tuning
- Accept ~10–15% BW shift from rounding to nearest standard value

## Bill of Materials

| Reference | Value | Specification |
|-----------|-------|---------------|
| D1 | Osram SFH 203 or Vishay VEMD5510C | IR photodiode, Cd ≤ 10 pF |
| U1 | OPA380 | TIA op-amp, GBP = 90 MHz, SOT-23-5 |
| Rf | 10 kΩ | 1%, thin-film, 0402 or 0201 |
| Cf | 1.0–1.5 pF | C0G/NP0, **0201 only** |
| Rbias | See datasheet | 5V reverse bias network for D1 |
| C_supply | 100 nF + 10 µF per rail | Placed <5 mm from OPA380 power pins |

## Supply Decoupling (CRITICAL)
- OPA380 is sensitive to supply noise coupling at these bandwidths
- **100 nF + 10 µF per rail**, physically within 5 mm of OPA380 pins
- Use X5R or better MLCC for the 10 µF; X7R for the 100 nF

## Post-TIA Stage (NOT optional)
The OPA380 output is an analog waveform — rounded Manchester transitions
even after correct Cf tuning. The RP2040 GPIO needs a clean digital edge.

**Add the TLV3501 comparator stage (see comparator_TLV3501.md)**

Signal chain:
```
Photodiode (reverse-biased)
    → OPA380 TIA (Rf=10kΩ, Cf=1.3pF)
    → 100 nF AC-coupling capacitor
    → TLV3501 comparator with ±30 mV hysteresis
    → RP2040 GPIO RX_PIN (GPIO 16)
```

## Bench Verification Procedure
1. Drive a known square-wave IR source at 4 MHz (Manchester transition rate)
2. Scope the TIA output (before comparator): look for rounded but symmetric transitions
3. Iterate Cf empirically to achieve cleanest waveform — math is the starting point
4. Verify rise time < 100 ns (< 40% of 250 ns half-bit period)
5. Add TLV3501 and verify clean rail-to-rail digital output
