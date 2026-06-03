"use strict";

// BGD Spider — compatibility engine (Session 24)
//
// Reads three rule sources:
//   - data/compatibility_rules/computed.json  (declarative, attribute-based)
//   - data/compatibility_rules/explicit.json  (edge cases, model-pair lookups)
//   - data/compatibility_rules/extended.json  (silent rules — frame, hub, battery, etc.)
//
// Component attributes are read from data/groupsets.json. A "component" in the
// Spider model is identified by the groupset id it belongs to + the role slot
// (shifter / rear_derailleur / cassette / chain / crankset).
//
// Public API:
//   evaluate(selection, data) -> { verdict, findings[] }
//
// where:
//   selection = { shifter?: groupsetId, rear_derailleur?: groupsetId,
//                 cassette?: groupsetId, chain?: groupsetId, crankset?: groupsetId }
//
//   data = { groupsets: [...], computed: [...], explicit: [...], extended: [...] }
//
// Returns:
//   verdict  = "compatible" | "caveat" | "block" | "unverified"
//   findings = [ { source, rule_id, verdict, risk_level?, pair, message, ... }, ... ]
//
// Findings are pair-based (Session 26 refactor): each finding describes ONE
// pair (roleA, roleB) in canonical SPIDER_ROLES order. `risk_level`
// ("low"|"high") appears only on caveat findings — high = "Frankenbuild" (UI
// renders orange), low = "minor caveat" (UI renders yellow). The engine
// follows the algorithm in robust_bike_compatibility_algorithm.png.
//
// Session 28 migration: the legacy `labradoodle` verdict was removed; all
// previously-labradoodle rules now live as `caveat` with `risk_level: "high"`.

const SPIDER_ROLES = [
  "shifter",
  "rear_derailleur",
  "cassette",
  "chain",
  "crankset",
];

// Verdict ladder, worst wins.
// Hierarchy: BLOCK (red) > CAVEAT (yellow OR orange depending on risk_level)
//   > UNVERIFIED (gray) > COMPATIBLE (green).
// "unverified" is part of the ladder — it beats "compatible" because an
// unverified pair means the engine cannot confirm safety, even if other pairs
// of the same card are verified compatible. (Worst-wins per card.)
// Note: caveat covers BOTH yellow and orange UI states. UI distinguishes them
// via finding.risk_level ("low" → yellow, "high" → orange). For ranking
// purposes both are the same rank — UI handles the visual split.
const VERDICT_RANK = {
  compatible: 0,
  unverified: 1,
  caveat: 2,
  block: 3,
};

// ---------- Helpers ----------

function pickGroupset(groupsets, id) {
  return groupsets.find((g) => g.id === id) || null;
}

// Returns the array of [role, groupsetId] pairs that the user actually selected.
function selectedEntries(selection) {
  return SPIDER_ROLES.filter((role) => selection[role]).map((role) => [
    role,
    selection[role],
  ]);
}

// Validates a selection against the groupsets dataset.
// Returns { ok: boolean, errors: [{role, id, reason}] }.
// Reason enum: "unknown_role" | "groupset_not_found".
// Empty slots (null/undefined) are NOT errors — user just hasn't picked yet.
function validateSelection(selection, groupsets) {
  const errors = [];
  const safeSelection = selection || {};
  for (const [role, id] of Object.entries(safeSelection)) {
    if (id == null) continue; // empty slot, not an error
    if (!SPIDER_ROLES.includes(role)) {
      errors.push({ role, id, reason: "unknown_role" });
      continue;
    }
    if (!pickGroupset(groupsets, id)) {
      errors.push({ role, id, reason: "groupset_not_found" });
    }
  }
  return { ok: errors.length === 0, errors };
}

// Generates all unique unordered pairs of selected (non-empty) roles.
// For N selected roles, returns C(N,2) pairs.
// Each pair is [roleA, roleB] in canonical SPIDER_ROLES order — so
// {shifter, cassette} is always ["shifter", "cassette"], never reversed.
// This canonical order makes per-pair lookups deterministic downstream.
function generatePairs(selection) {
  const safeSelection = selection || {};
  const selectedRoles = SPIDER_ROLES.filter((role) => safeSelection[role]);
  const pairs = [];
  for (let i = 0; i < selectedRoles.length; i++) {
    for (let j = i + 1; j < selectedRoles.length; j++) {
      pairs.push([selectedRoles[i], selectedRoles[j]]);
    }
  }
  return pairs;
}

// Worst verdict from a list of finding verdicts.
function worstVerdict(verdicts) {
  if (verdicts.length === 0) return null;
  let worst = verdicts[0];
  for (const v of verdicts) {
    if ((VERDICT_RANK[v] ?? -1) > (VERDICT_RANK[worst] ?? -1)) worst = v;
  }
  return worst;
}

// Substitute {value} / {details} in message templates.
function fillTemplate(template, vars) {
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`,
  );
}

// ---------- Per-pair computed evaluation (Session 26 refactor) ----------

// Evaluates one pair [roleA, roleB] against all computed rules whose
// applies_to_roles includes BOTH roles of the pair. Returns:
//
//   { matched: true,  verdict: "block",      finding } — a check failed
//   { matched: true,  verdict: "unverified", finding } — checks applied AND all passed
//   { matched: false }                                — no rule applies to this pair
//
// CRITICAL (handoff 4.2 §4): a passing computed check NEVER yields "compatible".
// Compatible requires an explicit rule. Computed checks can only:
//   - block (when they fail)
//   - contribute to "unverified" (when they pass) — never green.
function evaluatePairAgainstComputed(
  pair,
  selection,
  computedRules,
  groupsets,
) {
  if (!pair || pair.length !== 2) return { matched: false };
  const [roleA, roleB] = pair;
  const safeSelection = selection || {};
  const idA = safeSelection[roleA];
  const idB = safeSelection[roleB];
  if (!idA || !idB) return { matched: false };

  const passedRuleIds = [];
  let failingFinding = null;

  for (const rule of computedRules || []) {
    // Filter: rule must apply to BOTH roles of the pair.
    const appliesTo = rule.applies_to_roles || [];
    if (!appliesTo.includes(roleA) || !appliesTo.includes(roleB)) continue;

    let passed = false;
    let mismatchDetails = null;

    if (rule.check_type === "all_equal") {
      // Compare rule.attribute on the two pair-role groupsets.
      const gA = pickGroupset(groupsets, idA);
      const gB = pickGroupset(groupsets, idB);
      const valA = gA ? gA[rule.attribute] : undefined;
      const valB = gB ? gB[rule.attribute] : undefined;
      if (valA === undefined || valB === undefined) {
        // Missing attribute — skip this rule for this pair (cannot evaluate).
        continue;
      }
      if (valA === valB) {
        passed = true;
      } else {
        mismatchDetails = `${roleA}=${valA}, ${roleB}=${valB}`;
      }
    } else if (rule.check_type === "chain_compatibility") {
      // Pair-role-symmetric Flattop check. The pair must contain rear_derailleur AND chain.
      // (Already guaranteed by applies_to_roles filter, but double-check.)
      const rdRole = pair.includes("rear_derailleur")
        ? "rear_derailleur"
        : null;
      const chainRole = pair.includes("chain") ? "chain" : null;
      if (!rdRole || !chainRole) continue;
      const rd = pickGroupset(groupsets, safeSelection.rear_derailleur);
      const chain = pickGroupset(groupsets, safeSelection.chain);
      if (!rd || !chain) continue;
      const needle = rule.rd_requires_flattop_if?.compatible_chains_contains;
      if (!needle) continue;
      const rdNeedsFlattop = (rd.compatible_chains || "").includes(needle);
      const chainIsFlattop = (chain.compatible_chains || "").includes(needle);
      if (rdNeedsFlattop === chainIsFlattop) {
        passed = true;
      } else {
        mismatchDetails = rdNeedsFlattop
          ? "rear derailleur requires Flattop, chain is non-Flattop"
          : "chain is Flattop but rear derailleur is classic Eagle (non-Flattop)";
      }
    } else {
      // Unknown check_type — skip.
      continue;
    }

    if (passed) {
      passedRuleIds.push(rule.id);
    } else {
      // Failure is definitive: produce block finding and stop.
      failingFinding = {
        source: "computed",
        rule_id: rule.id,
        verdict: "block",
        pair: [roleA, roleB],
        message: fillTemplate(rule.message_mismatch, {
          details: mismatchDetails || "",
        }),
      };
      break;
    }
  }

  if (failingFinding) {
    return { matched: true, verdict: "block", finding: failingFinding };
  }

  if (passedRuleIds.length === 0) {
    // No computed rule applied to this pair.
    return { matched: false };
  }

  // At least one rule applied AND all passed → unverified (NOT compatible).
  // Message lists which checks passed (per A1 decision in Session 26).
  const passedList = passedRuleIds.join(", ");
  return {
    matched: true,
    verdict: "unverified",
    finding: {
      source: "computed",
      rule_id: "inferred",
      verdict: "unverified",
      pair: [roleA, roleB],
      message: `Inferred — computed checks passed (${passedList}), but no verified rule for this pair.`,
      passed_rule_ids: passedRuleIds,
    },
  };
}

// ---------- Explicit / extended lookup (per-pair) ----------

// Finds an explicit/extended rule that matches a single pair from the selection.
// A rule matches iff:
//   - rule.components has exactly the two roles of the pair as its keys
//   - rule.components[role] equals selection[role] for both roles
// Returns the first matching rule (full object, not just verdict) or null.
// Spider invariant (per SPIDER_DESIGN.md): all Spider rules have exactly 2
// components. Rules with !=2 components are skipped silently.
function findExplicitRuleForPair(pair, selection, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return null;
  if (!pair || pair.length !== 2) return null;
  const safeSelection = selection || {};
  const [roleA, roleB] = pair;
  const idA = safeSelection[roleA];
  const idB = safeSelection[roleB];
  if (!idA || !idB) return null;

  for (const rule of rules) {
    // Skip system-level rules (they're trigger-based, not pair-based).
    // See evaluateSystemRules below for system rule handling.
    if (rule.type === "system") continue;
    if (!rule.components || !rule.verdict) continue;
    const ruleRoles = Object.keys(rule.components);
    if (ruleRoles.length !== 2) continue;
    if (!ruleRoles.includes(roleA) || !ruleRoles.includes(roleB)) continue;
    if (rule.components[roleA] !== idA) continue;
    if (rule.components[roleB] !== idB) continue;
    return rule;
  }
  return null;
}

// ---------- System-level rule lookup ----------
// System rules differ from pair rules: they trigger based on a single
// component (or set of components) without being tied to a specific pair.
// Example: M8150 RD requires EP801/EP6 motor — this is a dependency on a
// non-drivetrain component (drive unit), not a relationship between two
// drivetrain components.
//
// Rule shape:
//   {
//     id: "...",
//     type: "system",
//     trigger: { role: "groupset-id", ... },  // 1+ components must ALL match
//     verdict: "caveat" | "block",
//     risk_level: "low" | "high",  // for caveats
//     short_message: "...",         // banner copy (1 sentence)
//     reason: "...",                // modal copy (full explanation)
//     source: { ... }
//   }
//
// Returns array of system findings (may be empty). Each finding has
// type: "system" so renderers can route it to the banner, not to cards.
function evaluateSystemRules(selection, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return [];
  const safeSelection = selection || {};
  const findings = [];

  for (const rule of rules) {
    if (rule.type !== "system") continue;
    if (!rule.trigger || typeof rule.trigger !== "object") continue;
    if (!rule.verdict) continue;

    // ALL trigger components must match the selection.
    const triggerRoles = Object.keys(rule.trigger);
    if (triggerRoles.length === 0) continue;
    const allMatch = triggerRoles.every(
      (role) => safeSelection[role] === rule.trigger[role],
    );
    if (!allMatch) continue;

    const finding = {
      type: "system",
      source: "explicit",
      rule_id: rule.id,
      verdict: rule.verdict,
      triggered_by: [...triggerRoles],
      short_message: rule.short_message || "",
      message: rule.reason || "",
    };
    if (rule.verdict === "caveat") {
      finding.risk_level = rule.risk_level || "low";
    }
    if (rule.source) finding.source_meta = rule.source;
    findings.push(finding);
  }

  return findings;
}

// ---------- Public: evaluate ----------

function evaluate(selection, data) {
  const {
    groupsets = [],
    computed = [],
    explicit = [],
    extended = [],
  } = data || {};
  const safeSelection = selection || {};

  // Step 1 (diagram: "Over vstupne data") — validate IDs.
  const validation = validateSelection(safeSelection, groupsets);
  if (!validation.ok) {
    // Per diagram: show data error, do not compute compatibility.
    return { verdict: "unverified", findings: [], errors: validation.errors };
  }

  // Step 2 — empty selection -> unverified, no findings.
  if (selectedEntries(safeSelection).length === 0) {
    return { verdict: "unverified", findings: [] };
  }

  // Step 3 — generate all pairs of selected roles (canonical order).
  const pairs = generatePairs(safeSelection);

  // Step 4 — evaluate each pair per the diagram:
  //   explicit rule found?  -> use rule's verdict (block/caveat/compatible)
  //   no rule?              -> fallback to per-pair computed checks
  //                              - any check failed  -> block
  //                              - all checks passed -> unverified (NEVER compatible)
  //                              - no check applied  -> unverified
  const findings = [];
  for (const pair of pairs) {
    // 4a — explicit lookup (primary). Then extended (secondary, parked but
    // still loaded — same shape as explicit per handoff sekcia 4.3).
    const explicitMatch = findExplicitRuleForPair(
      pair,
      safeSelection,
      explicit,
    );
    const extendedMatch = explicitMatch
      ? null
      : findExplicitRuleForPair(pair, safeSelection, extended);
    const rule = explicitMatch || extendedMatch;

    if (rule) {
      const finding = {
        source: explicitMatch ? "explicit" : "extended",
        rule_id: rule.id,
        verdict: rule.verdict,
        pair: [...pair],
        message: rule.reason || "",
      };
      // risk_level: read from rule for caveat verdicts; default "low" if absent.
      // (Otazka 1 = A: field on the rule, default low when missing.)
      // Session 28: previously-labradoodle rules are now caveat+risk_level=high.
      if (rule.verdict === "caveat") {
        finding.risk_level = rule.risk_level || "low";
      }
      // Carry through optional rule metadata (parity with legacy runLookup).
      if (rule.economic_warning)
        finding.economic_warning = rule.economic_warning;
      if (rule.alternatives) finding.alternatives = rule.alternatives;
      findings.push(finding);
      continue;
    }

    // 4b — no explicit rule: fall back to per-pair computed checks.
    const computedResult = evaluatePairAgainstComputed(
      pair,
      safeSelection,
      computed,
      groupsets,
    );
    if (computedResult.matched) {
      findings.push(computedResult.finding);
    } else {
      // No computed rule applied either -> unverified, with a stub finding so
      // per-card aggregation downstream knows this pair was visited.
      findings.push({
        source: "inferred",
        rule_id: "no-rule",
        verdict: "unverified",
        pair: [...pair],
        message:
          "No verified rule for this pair, and no computed check applies.",
      });
    }
  }

  // Step 4.5 — evaluate system-level rules (single-component triggers).
  // System findings are added to the same findings array so worst-wins
  // aggregation includes them. They're distinguished by `type: "system"`
  // for renderers (banner vs. per-card placement).
  const systemFindings = evaluateSystemRules(safeSelection, explicit);
  for (const sf of systemFindings) {
    findings.push(sf);
  }

  // Step 5 — overall verdict via worst-wins ladder
  // (BLOCK > CAVEAT > UNVERIFIED > COMPATIBLE; see VERDICT_RANK).
  const verdict = worstVerdict(findings.map((f) => f.verdict)) || "unverified";
  return { verdict, findings };
}

// ---------- Module exports ----------
// Works in browser (global), Node CommonJS, and ESM-via-bundler contexts.
const api = {
  evaluate,
  validateSelection,
  generatePairs,
  evaluateSystemRules,
  SPIDER_ROLES,
  VERDICT_RANK,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof window !== "undefined") {
  window.SpiderEngine = api;
}
