# Spider Compatibility Tool — Design Reference

**Canonical document. Read this first in every session that touches Spider.**

Source: BGD_2_handoff.xlsx, sheets "In progress", "Decision log", "Roadmap forward".

---

## What it is

Drivetrain compatibility checker. User picks 5 components, tool tells them if the combination works.

- **Pattern:** anchor + 5 components (shifter, rear derailleur, cassette, chain, crankset)
- **Scope:** drivetrain only — brakes are OUT (tier-locked, no compatibility logic needed)
- **Battery for SRAM electronic (AXS/Transmission):** handled silently in background, no extra slot

## Verdict model (5 states)

| State             | Color                    | Meaning                                                                 |
| ----------------- | ------------------------ | ----------------------------------------------------------------------- |
| 🟢 Compatible     | green (existing palette) | Works, verified                                                         |
| 🟡 Caveat (low)   | yellow                   | Works with a minor caveat (economic / setup / feature gating)           |
| 🟠 Caveat (high)  | orange                   | Frankenbuild — works but real risk / "mačkopes" (formerly: labradoodle) |
| 🔴 Not compatible | saturated red            | Physically/logically does not work                                      |
| ⚪ Unverified     | neutral gray             | No rule exists for this combo (default fallback)                        |

**Verified-only philosophy:** if a combo isn't in rules → show Unverified + suggested alternatives. NO baba Vanga guessing. Trust > coverage.

## UX flow — DECIDED (Variant B, linear flow)

- 5 component cards, horizontal on desktop, vertical on mobile
- Free selection: user picks anything in any order, no progressive filtering
- Verdict bar at TOP of section, persistent, color-changes live with selection
- Status badges per card: tiny dot + word (OK / Caveat / Block / Unverified). Caveat with `risk_level: "high"` renders orange instead of yellow.
- Caveat detail: collapsible/visible row below cards with left-color border explaining why
- Mobile-first; configurator feel (Tesla / Apple / Bike-Discount build pattern)
- Mockup approved by Tomáš in session 22 (two states: empty + caveat verdict)

## Rules approach — Hybrid

**Computed engine** — calculates from component attributes:

- Speed match (11s vs 12s)
- Freehub match (HG vs Micro Spline vs XD)
- Mechanical vs electronic
- SRAM Transmission ecosystem (Flattop chain requirement)

**Explicit rules** — for edge cases the computed layer can't cover:

- Specific model-to-model exceptions
- Documented manufacturer caveats
- High-risk caveat combinations (Frankenbuild / mačkopes — formerly stored as `labradoodle` verdict, migrated to `caveat + risk_level: "high"` in Session 28)

## "Frankenbuild" EN copy pool (orange caveat verdict, random rotation per render)

8 expressions, randomly chosen each time UI renders a high-risk caveat (orange) verdict. Note: file is still named `labradoodle_pool.json` (legacy name) but the verdict label "Labradoodle" was removed in Session 28. The 8 expressions stay — they describe Frankenbuild / mačkopes combos regardless of the internal verdict name:

1. Frankenbuild — Built from parts that weren't supposed to meet. It works.
2. Duct tape verified — Officially unsupported. Unofficially fine.
3. Off-menu combo — Not on the spec sheet, but riders make it work.
4. Pirate rig — Sailing under no manufacturer's flag.
5. Garage-blessed — Bike shop approved. Sort of.
6. Unofficial cousin — Same family, different paperwork.
7. Stack Overflow combo — Some forum thread says it works. Probably does.
8. Plot twist build — Nothing about this should work. It does.

## Files involved

| File                                             | Purpose                                                                                     | Status                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `data/compatibility_rules/explicit.json`         | 98 Spider rules + 21 research notes                                                         | ✅ DONE (Session 23)                                                 |
| `data/compatibility_rules/extended.json`         | 22 archived non-Spider rules (frame_type, bike_type, wheel_hub, etc.)                       | ✅ DONE (Session 23) — parked, may activate via silent engine in S24 |
| `data/compatibility_rules/labradoodle_pool.json` | 8 EN UI strings for orange caveat (Frankenbuild) verdict, random rotation. Legacy filename. | ✅ DONE (Session 23)                                                 |
| `data/compatibility_rules/computed.json`         | Computed engine rules (speed, freehub, etc.)                                                | EMPTY — fill in Session 24                                           |
| `scripts/compatibility-engine.js`                | Computed checks + explicit lookup                                                           | TO CREATE (Session 24)                                               |
| `spider.html` (or similar)                       | Spider UI page                                                                              | TO CREATE (Session 25)                                               |

## Naming

- Tool name (working): **Spider** — drivetrain compatibility checker
- Public name TBD when going live

## Roadmap (Sessions 23 → 27)

| Session | Goal                                                           |
| ------- | -------------------------------------------------------------- |
| 23      | `compatibility_rules.json` schema + first 10–15 explicit rules |
| 24      | `compatibility-engine.js` — computed checks + explicit lookup  |
| 25      | Spider UI build (linear flow, wire to engine)                  |
| 26      | Verdict breakdown UI + cost calculator                         |
| 27      | Polish + deploy                                                |

## Schema decisions (Session 23 — DONE)

1. **Rule entry shape:** `components` map with role keys (Format B), not flat `component_a/component_b`. Engine matches roles to UI slots directly.
2. **Organisation:** Flat array. Filtering by verdict/role happens in engine, not file structure.
3. **Hybrid approach:** Separate files — `computed.json` for engine-calculated rules, `explicit.json` for edge cases.
4. **Frankenbuild (orange caveat) UI copy pool:** Separate file (`labradoodle_pool.json`, legacy filename) — UI copy strings, not compatibility data. Rendered for findings with `verdict: "caveat"` + `risk_level: "high"`.

## Working principles (must-follow for assistant)

- One step at a time. Strict.
- No "next steps" preview unless asked.
- Visual mockups over text descriptions.
- Simplest working path. No over-engineering.
- Confirmation before destructive actions.
- Slovak conversation; EN content (web copy, JSON) without diacritics.
- **Read this document AND `BGD_2_handoff.xlsx` at the start of every Spider session.**

## Current state (after Session 23)

- `explicit.json`: 98 Spider rules + 21 research notes
  - Verdicts (post-Session-28): block 44, compatible 42, caveat 12 (8 with risk_level=high migrated from legacy "labradoodle", 4 with risk_level pending audit)
- `extended.json`: 22 archived rules — non-Spider roles, parked for potential silent-engine use in S24
- `labradoodle_pool.json`: 8 EN expressions for orange caveat (Frankenbuild) verdict — legacy filename
- `computed.json`: empty — Session 24 task
- All Spider rules use exactly 2 components, only Spider's 5 roles (shifter, RD, cassette, chain, crankset)
