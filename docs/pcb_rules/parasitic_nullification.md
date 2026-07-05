# PCB Layout Rules — TIA Parasitic Capacitance Nullification

## The Problem
Cf = 1.3 pF. This is at the edge of what is physically achievable on a PCB.
PCB trace and pad parasitic capacitance from the Rf footprint alone can be
0.3–0.8 pF, consuming 25–60% of the entire Cf budget before you solder anything.

Without these layout rules, your measured f_-3dB will be significantly lower
than the calculated 12 MHz, and you will not achieve clean 2 Mbps Manchester decoding.

## Rule 1: Ground and Power Plane Cutout (MOST CRITICAL)

**Action:** Cut both the GND plane and the 3.3V plane from ALL PCB layers
directly under the following nodes:
- The IN− trace (OPA380 inverting input)
- The Rf footprint pads and connecting trace
- The Cf footprint pads and connecting trace

**Extent:** Extend the cutout approximately 1 mm beyond each pad/trace edge
on all layers EXCEPT the layer carrying the signal trace itself.

**Why:** A trace or pad over a ground plane forms a parallel-plate capacitor:
```
C_parasitic = ε₀ × εr × A / d
```
For a 0402 pad at 0.1 mm over a ground plane: C ≈ 0.3–0.5 pF.
Removing the plane removes the bottom plate — capacitance drops to fractions of fF.

## Rule 2: 0201 Package for Cf (MANDATORY)

**Use 0201 (metric 0603) C0G/NP0 for Cf. NOT 0402.**

Pad area scales parasitic capacitance roughly linearly with package size.
An 0402 pad against an adjacent ground plane contributes 0.3–0.5 pF —
at a 1.3 pF total budget, that is 25–40% of your entire allocated Cf.

C0G/NP0 dielectric is mandatory: X5R/X7R have piezoelectric effects that
introduce vibration-induced noise at these sensitivity levels.

## Rule 3: Guard Trace (NOT Guard Plane)

**Use a guard trace around the sensitive IN− node, NOT a ground plane fill.**

A guard plane near IN− would create exactly the parasitic capacitance you are
trying to eliminate. A guard TRACE, driven to the same potential as IN−,
creates zero voltage differential between itself and the sensitive node —
leakage current injection is blocked without adding parallel-plate capacitance.

**Implementation:**
- Buffer the guard trace potential off the TIA's own inverting node
  (or use a matched dummy op-amp follower if signal integrity requires it)
- Guard trace width: same as the signal trace (do not make it wide)
- Guard trace location: surround the IN− node, not the whole TIA circuit

## Rule 4: Maximum 3 mm Trace Run

**The entire signal path must be 3 mm or less, total:**
```
Photodiode cathode → IN− → Rf → Cf → OPA380 output
```

- Same copper layer throughout — zero vias in this path
- Via barrel capacitance (0.1–0.5 pF per via) is unacceptable here
- Place the OPA380, Rf, Cf, and photodiode as a tight cluster

## Rule 5: Power Supply Decoupling Placement

- 100 nF + 10 µF per supply rail
- Physically within 5 mm of OPA380 power pins
- 100 nF: C0G/NP0 or X7R, placed closest to pin
- 10 µF: X5R MLCC (not tantalum — too much ESR at high frequency)

## Rule 6: Bench Iteration (Non-Negotiable)

The calculations give you a starting point. Final Cf value MUST be tuned
empirically on the actual assembled board:

1. Assemble board with Cf = 1.5 pF (slightly high, easier to remove than add)
2. Drive a known 4 MHz square-wave IR source at the photodiode
3. Scope the TIA output — look for rise/fall time and overshoot
4. Reduce Cf toward 1.0 pF until rise time is minimized without oscillation
5. Lock in the value, then verify full system at 2 Mbps before moving on

**Rule:** If you are not getting rise times < 100 ns on the bench, fix the
PCB layout before changing component values. The layout is almost always the cause.

## PCB Stack-Up Recommendation

For a 2-layer board:
- Top copper: signal traces, components
- Bottom copper: ground plane (with cutouts per Rule 1)
- Avoid 4-layer if cost-constrained, but 4-layer gives better EMI control

## Summary Checklist

- [ ] GND and 3.3V planes cut under IN−, Rf, Cf (1mm margin)
- [ ] Cf is 0201 C0G/NP0 package
- [ ] Guard trace around IN− node, driven to IN− potential
- [ ] Total signal trace run < 3 mm, no vias
- [ ] 100 nF + 10 µF per rail < 5 mm from OPA380
- [ ] Bench Cf tuning with oscilloscope before committing to production
