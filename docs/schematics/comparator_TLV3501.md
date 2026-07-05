# Comparator Stage — TLV3501 with ±30 mV Hysteresis

## Purpose
Convert the analog OPA380 TIA output (rounded Manchester transitions)
into a clean rail-to-rail digital signal for the RP2040 GPIO input.

## Device Selection
**TLV3501** — 4.5 ns propagation delay, 3.3V supply compatible
Alternative: LMH7322 (similar spec, different package)

## Input Signal Spec
- TIA output swing: ~0 to ~500 mV centered around 1.65 V mid-rail
- Mid-rail bias: 1.65 V = VCC/2 = 3.3V/2
- Maximum slew: 4 MHz Manchester transition rate

## 3-Resistor Symmetric Hysteresis Network

### Topology
```
VCC (3.3V)
  |
 [R1]
  |
  +──── V+ (comparator non-inverting input)
  |
 [R2]
  |
 GND

V+ also connected to:
  +──── [R3] ──── Vout (comparator output — positive feedback)

V− (comparator inverting input) ← TIA output via 49.9Ω series resistor
```

### Design Equations (Millman's Theorem at V+)
```
Vhys = VCC / (2·R3/Rb + 1)

where Rb = R1 = R2 (symmetric for VCC/2 center)

Target: Vhys = 60 mV (= ±30 mV band)
→ 2·R3/Rb + 1 = 3300/60 = 55
→ R3/Rb = 27
→ Choose Rb = 3.6 kΩ → R3 = 100 kΩ (standard E24 values)
```

### Verification
```
V+_high (Vout=3.3V) = 3.3·R2 / (R1+R2) + 3.3·R2·R1 / (R3·(R1+R2))
                    ≈ 1.679 V

V+_low  (Vout=0V)   = 3.3·R2 / (R1+R2) - 3.3·R2·R1 / (R3·(R1+R2))
                    ≈ 1.621 V

Vhys = 1.679 - 1.621 = 58 mV (±29 mV) ✓  (target was ±30 mV)
Center = (1.679 + 1.621) / 2 = 1.650 V = VCC/2 ✓
```

## Bill of Materials

| Reference | Value | Node | Notes |
|-----------|-------|------|-------|
| U2 | TLV3501 | — | 4.5 ns comparator, SOT-23-5 |
| R1 | 3.6 kΩ | VCC → V+ | E24 standard value |
| R2 | 3.6 kΩ | V+ → GND | Must match R1 exactly |
| R3 | 100 kΩ | V+ → Vout | Positive feedback (hysteresis) |
| Rseries | 49.9 Ω | TIA output → V− | Damps ringing from V− input cap |

## The 49.9Ω Series Resistor (Rseries)
**Not part of the hysteresis math, but critically important.**
The comparator V− input has parasitic capacitance (typically 1–5 pF).
At 12 MHz, this capacitance resonates with the TIA output impedance,
producing false edges at threshold crossings that look like valid Manchester
transitions. The 49.9 Ω series resistor damps this ringing.

Do not omit. Do not substitute with values > 100 Ω (adds delay) or < 22 Ω (insufficient damping).

## Output Connection
- TLV3501 output → RP2040 GPIO 16 (RX_PIN in firmware)
- RP2040 GPIO is 3.3V tolerant, matches TLV3501 rail-to-rail output directly
- No level shifting required

## Bench Verification
1. Inject known Manchester signal (2 Mbps, 50% duty cycle) from function generator
2. Scope V+ to verify hysteresis band is visibly ±~30 mV around 1.65V crossing
3. Scope Vout to verify clean rail-to-rail transitions, no glitches at threshold
4. Check for ringing at threshold — if present, increase Rseries by 10 Ω increments
