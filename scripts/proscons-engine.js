"use strict";

// BGD Pros/Cons Template Engine
// Generates dynamic pros/cons for selected groupsets based on diff rules.
// Rules trigger only when there is a meaningful difference between selected sets.

// ---------- Helpers ----------

// Reads the chainring count from drivetrain_type ("1x12", "2x10", "3x9 / 2x9").
// For dual-format strings, takes the first (worst-case) format.
function getChainringCount(drivetrainType) {
  if (!drivetrainType) return null;
  const firstFormat = drivetrainType.split("/")[0].trim();
  const match = firstFormat.match(/^(\d)x/);
  return match ? parseInt(match[1], 10) : null;
}

// Tests whether two groupsets differ on a given key.
function hasDifference(selected, key) {
  const values = selected.map((g) => g[key]);
  const uniqueValues = [...new Set(values)];
  return uniqueValues.length > 1;
}

// Tests whether selected groupsets contain mixed mechanical and electronic.
function hasMixedTechnology(selected) {
  const isMech = (g) => g.technology === "mechanical";
  const isElectronic = (g) =>
    g.technology === "wireless" || g.technology === "wired";
  return selected.some(isMech) && selected.some(isElectronic);
}

// Checks whether a groupset belongs to SRAM Transmission family.
function isTransmission(groupset) {
  return (
    groupset.series && groupset.series.toLowerCase().includes("transmission")
  );
}

// Tests whether selected contains both Transmission and non-Transmission.
function hasMixedTransmission(selected) {
  return (
    selected.some(isTransmission) && selected.some((g) => !isTransmission(g))
  );
}

// ---------- Rules ----------
// Each rule:
//   id      — unique identifier
//   applies — function(selected) returning true/false
//   evaluate — function(groupset, selected) returning { pros: [...], cons: [...] }
//              (either array can be empty or omitted)

const rules = [
  {
    id: "drivetrain_maintenance",
    applies(selected) {
      // Apply when at least 2 selected groupsets differ in chainring count
      const counts = selected
        .map((g) => getChainringCount(g.drivetrain_type))
        .filter((c) => c !== null);
      const uniqueCounts = [...new Set(counts)];
      return uniqueCounts.length > 1;
    },
    evaluate(groupset) {
      const count = getChainringCount(groupset.drivetrain_type);
      if (count === 1) {
        return {
          pros: [
            "Single chainring — fewer parts, less to adjust, less to break.",
          ],
          cons: [
            "One chainring up front — narrower gear range than 2x/3x setups.",
          ],
        };
      }
      if (count === 2) {
        return {
          pros: ["Two chainrings — wider total gear range for varied terrain."],
          cons: [
            "Front and rear derailleur to keep aligned — more fiddly to maintain.",
          ],
        };
      }
      if (count === 3) {
        return {
          pros: [
            "Three chainrings — widest range, you'll always find a usable gear.",
          ],
          cons: [
            "Three chainrings, two derailleurs, lots of overlapping combos. More to adjust, more to wear out.",
          ],
        };
      }
      return {};
    },
  },

  {
    id: "freehub_compat",
    applies(selected) {
      return hasDifference(selected, "freehub");
    },
    evaluate(groupset, selected) {
      const myFreehub = groupset.freehub;
      if (!myFreehub) return {};

      // Does at least one OTHER selected set share my freehub?
      const sameAsAnother = selected.some(
        (g) => g.id !== groupset.id && g.freehub === myFreehub,
      );

      if (sameAsAnother) {
        return {
          pros: [
            "Same freehub as another selected set — no wheel changes if you switch.",
          ],
        };
      }
      return {
        cons: [
          "Different freehub from other selected sets — switching means a new freehub body or wheel (~€100-150).",
        ],
      };
    },
  },

  {
    id: "mech_vs_electronic",
    applies(selected) {
      return hasMixedTechnology(selected);
    },
    evaluate(groupset) {
      if (groupset.technology === "mechanical") {
        return {
          pros: [
            "Cable-actuated — no batteries to charge, no firmware to update.",
          ],
          cons: ["Cable stretches over time — needs occasional re-adjustment."],
        };
      }
      if (
        groupset.technology === "wireless" ||
        groupset.technology === "wired"
      ) {
        return {
          pros: [
            "Crisp, consistent shifts — no cable stretch to compensate for.",
          ],
          cons: [
            "Battery to manage — a flat battery means stuck in whatever gear it died in.",
          ],
        };
      }
      return {};
    },
  },

  {
    id: "transmission_ecosystem",
    applies(selected) {
      return hasMixedTransmission(selected);
    },
    evaluate(groupset) {
      if (isTransmission(groupset)) {
        return {
          pros: [
            "Direct-mount derailleur — bolts straight to the frame's hanger, more crash-resistant.",
          ],
          cons: [
            "Uses Flattop chains only — pricier, and not interchangeable with other groupsets.",
          ],
        };
      }
      // Non-Transmission set in a mixed selection
      return {
        pros: [
          "Standard chain compatibility — uses common chains, easy to source and replace.",
        ],
      };
    },
  },
];

// ---------- Public API ----------

const MAX_PROS = 3;
const MAX_CONS = 3;

// Generates pros/cons for each selected groupset.
// Returns: { groupsetId: { pros: [...], cons: [...] } }
function generateProsCons(selected) {
  if (!selected || selected.length < 2) return {};

  const result = {};
  for (const groupset of selected) {
    result[groupset.id] = { pros: [], cons: [] };
  }

  for (const rule of rules) {
    if (!rule.applies(selected)) continue;
    for (const groupset of selected) {
      const evaluation = rule.evaluate(groupset, selected);
      if (evaluation.pros) {
        result[groupset.id].pros.push(...evaluation.pros);
      }
      if (evaluation.cons) {
        result[groupset.id].cons.push(...evaluation.cons);
      }
    }
  }

  // Apply caps
  for (const id in result) {
    result[id].pros = result[id].pros.slice(0, MAX_PROS);
    result[id].cons = result[id].cons.slice(0, MAX_CONS);
  }

  return result;
}

// Tests whether any rule produced output (used to decide whether to render the section).
function hasAnyProsCons(prosConsByGroupset) {
  return Object.values(prosConsByGroupset).some(
    (entry) => entry.pros.length > 0 || entry.cons.length > 0,
  );
}
