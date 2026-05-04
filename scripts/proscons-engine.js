"use strict";

// BGD Pros/Cons Template Engine
// Generates dynamic pros/cons for selected items based on diff rules.
// Rules trigger only when there is a meaningful difference between selected items.
// Supports multiple component types (drivetrains, brakes) via the `type` parameter.

// ---------- Drivetrain helpers ----------

// Reads the chainring count from drivetrain_type ("1x12", "2x10", "3x9 / 2x9").
// For dual-format strings, takes the first (worst-case) format.
function getChainringCount(drivetrainType) {
  if (!drivetrainType) return null;
  const firstFormat = drivetrainType.split("/")[0].trim();
  const match = firstFormat.match(/^(\d)x/);
  return match ? parseInt(match[1], 10) : null;
}

// Tests whether two items differ on a given key.
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

// ---------- Brake helpers ----------

// Parses numeric values, including ranges like "240 - 290" → midpoint 265.
// Returns NaN for unparseable input.
function parseNumeric(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const parts = value.split("-").map((s) => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return (parts[0] + parts[1]) / 2;
  }
  return parseFloat(value);
}

// Detects "tool-less" reach adjust from the lever_features string.
function hasToolLessReach(brake) {
  if (!brake.lever_features) return false;
  return brake.lever_features.toLowerCase().includes("tool-less");
}

// ---------- Drivetrain rules ----------

const drivetrainRules = [
  {
    id: "drivetrain_maintenance",
    applies(selected) {
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
      return {
        pros: [
          "Standard chain compatibility — uses common chains, easy to source and replace.",
        ],
      };
    },
  },
];

// ---------- Brake rules ----------

const brakeRules = [
  {
    id: "brake_weight",
    applies(selected) {
      const weights = selected
        .map((b) => parseNumeric(b.weight_g_approx))
        .filter((w) => !Number.isNaN(w));
      if (weights.length < 2) return false;
      const spread = Math.max(...weights) - Math.min(...weights);
      return spread >= 50;
    },
    evaluate(brake, selected) {
      const weights = selected
        .map((b) => parseNumeric(b.weight_g_approx))
        .filter((w) => !Number.isNaN(w));
      const myWeight = parseNumeric(brake.weight_g_approx);
      if (Number.isNaN(myWeight)) return {};
      const minWeight = Math.min(...weights);
      const maxWeight = Math.max(...weights);

      if (myWeight === minWeight) {
        return {
          pros: ["Lightest in this comparison — saves weight at the bar."],
        };
      }
      if (myWeight === maxWeight) {
        return {
          cons: ["Heaviest in this comparison — adds rotational mass."],
        };
      }
      return {};
    },
  },

  {
    id: "brake_pistons",
    applies(selected) {
      if (!hasDifference(selected, "pistons")) return false;
      // Trigger only when all selected brakes share the same league.
      // Piston count is a meaningful differentiator only between brakes of
      // equivalent quality (e.g. Deore M6100 2-pot vs M6120 4-pot, both
      // Enthusiast). Across leagues, build quality dominates piston count
      // (e.g. XTR 2-pot outbrakes a low-tier 4-pot).
      const leagues = selected.map((b) => b.league_label);
      const uniqueLeagues = [...new Set(leagues)];
      return uniqueLeagues.length === 1;
    },
    evaluate(brake) {
      if (brake.pistons === 2) {
        return {
          cons: [
            "Less braking power on long descents — fades faster on heavy bikes.",
          ],
        };
      }
      if (brake.pistons === 4) {
        return {
          pros: [
            "More braking power — better on steep descents and heavy bikes (eMTB, enduro).",
          ],
        };
      }
      return {};
    },
  },

  {
    id: "brake_oil_type",
    applies(selected) {
      return hasDifference(selected, "oil_type");
    },
    evaluate(brake) {
      if (brake.oil_type === "Mineral") {
        return {
          pros: [
            "Mineral oil doesn't damage paint or absorb water — easier home maintenance.",
          ],
        };
      }
      if (brake.oil_type && brake.oil_type.toUpperCase().includes("DOT")) {
        return {
          pros: [
            "Higher boiling point — more consistent on long, hard descents.",
          ],
          cons: [
            "DOT fluid eats paint and absorbs moisture — needs replacement every 1-2 years.",
          ],
        };
      }
      return {};
    },
  },

  {
    id: "brake_reach_adjust",
    applies(selected) {
      const values = selected.map(hasToolLessReach);
      const uniqueValues = [...new Set(values)];
      return uniqueValues.length > 1;
    },
    evaluate(brake) {
      if (hasToolLessReach(brake)) {
        return {
          pros: [
            "Reach adjust by hand — fit different glove thicknesses without an Allen key.",
          ],
        };
      }
      return {
        cons: [
          "Reach adjust needs an Allen key — fine for set-and-forget, annoying mid-ride.",
        ],
      };
    },
  },

  {
    id: "brake_one_finger",
    applies(selected) {
      return hasDifference(selected, "one_finger_lever");
    },
    evaluate(brake) {
      if (brake.one_finger_lever === true) {
        return {
          pros: [
            "One-finger braking — your hand stays relaxed on long descents, less arm pump.",
          ],
        };
      }
      if (brake.one_finger_lever === false) {
        return {
          cons: [
            "Needs 2 fingers to brake hard — hands get tired faster on long descents.",
          ],
        };
      }
      return {};
    },
  },
];

// ---------- Rules registry ----------

const rulesByType = {
  drivetrains: drivetrainRules,
  brakes: brakeRules,
};

// ---------- Public API ----------

const MAX_PROS = 3;
const MAX_CONS = 3;

// Generates pros/cons for each selected item.
// `type` selects the rule set: "drivetrains" or "brakes".
// Returns: { itemId: { pros: [...], cons: [...] } }
function generateProsCons(selected, type = "drivetrains") {
  if (!selected || selected.length < 2) return {};

  const rules = rulesByType[type];
  if (!rules) return {};

  const result = {};
  for (const item of selected) {
    result[item.id] = { pros: [], cons: [] };
  }

  for (const rule of rules) {
    if (!rule.applies(selected)) continue;
    for (const item of selected) {
      const evaluation = rule.evaluate(item, selected);
      if (evaluation.pros) {
        result[item.id].pros.push(...evaluation.pros);
      }
      if (evaluation.cons) {
        result[item.id].cons.push(...evaluation.cons);
      }
    }
  }

  for (const id in result) {
    result[id].pros = result[id].pros.slice(0, MAX_PROS);
    result[id].cons = result[id].cons.slice(0, MAX_CONS);
  }

  return result;
}

// Tests whether any rule produced output.
function hasAnyProsCons(prosConsByItem) {
  return Object.values(prosConsByItem).some(
    (entry) => entry.pros.length > 0 || entry.cons.length > 0,
  );
}
