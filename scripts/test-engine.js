"use strict";

const fs = require("fs");
const path = require("path");

const { evaluate } = require("./compatibility-engine.js");

// Load real data
const groupsets = JSON.parse(
  fs.readFileSync("/mnt/project/groupsets.json", "utf8"),
);
const computed = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "data", "compatibility_rules", "computed.json"),
    "utf8",
  ),
);
const explicit = JSON.parse(
  fs.readFileSync("/mnt/project/explicit.json", "utf8"),
);
// extended.json not in /mnt/project — pass empty array
const extended = [];

const data = { groupsets, computed, explicit, extended };

// ---------- Test cases ----------

const tests = [
  {
    label: "Empty selection -> unverified",
    selection: {},
    expectedVerdict: "unverified",
    expectMinFindings: 0,
  },
  {
    label: "Single component -> unverified (no rule applies, min 2 components)",
    selection: { shifter: "shimano-xt-m8100" },
    expectedVerdict: "unverified",
  },
  {
    label: "All-Shimano XT M8100 12s build (full 4 components)",
    selection: {
      shifter: "shimano-xt-m8100",
      rear_derailleur: "shimano-xt-m8100",
      cassette: "shimano-xt-m8100",
      chain: "shimano-xt-m8100",
    },
    expectedVerdict: "compatible",
  },
  {
    label: "11s shifter + 12s RD -> speed mismatch -> block",
    selection: {
      shifter: "shimano-deore-m5100",
      rear_derailleur: "shimano-slx-m7100",
    },
    expectedVerdict: "block",
    expectFindingId: "speed-match",
  },
  {
    label:
      "SRAM Transmission RD + classic Eagle chain -> Flattop mismatch -> block",
    selection: {
      rear_derailleur: "sram-x0-transmission",
      chain: "sram-xx1-eagle",
    },
    expectedVerdict: "block",
    expectFindingId: "sram-transmission-flattop",
  },
  {
    label: "SRAM AXS shifter + mechanical RD -> actuation mismatch -> block",
    selection: {
      shifter: "sram-gx-eagle-axs",
      rear_derailleur: "sram-gx-eagle",
    },
    expectedVerdict: "block",
    expectFindingId: "actuation-match",
  },
  {
    label:
      "Worst-wins: explicit labradoodle + computed compatible -> labradoodle",
    selection: {
      cassette: "shimano-deore-m5100",
      rear_derailleur: "shimano-slx-m7100",
    },
    // Explicit rule m5100-cassette-12s-rd-caveat says labradoodle for this exact pair.
    // Speed match check: cassette 11s vs RD 12s -> block.
    // Worst wins -> block (because block > labradoodle).
    expectedVerdict: "block",
  },
  {
    label: "Explicit rule alone — 2 compatible Shimano 11s components",
    selection: {
      shifter: "shimano-deore-m5100",
      rear_derailleur: "shimano-xt-m8000",
    },
    // Both 11s -> speed-match compatible. Explicit m5100-m8000-shifter-rd-compat -> compatible.
    expectedVerdict: "compatible",
  },
  {
    label: "Partial selection (3 components, all match) -> compatible",
    selection: {
      shifter: "shimano-xt-m8100",
      rear_derailleur: "shimano-xt-m8100",
      cassette: "shimano-xt-m8100",
    },
    expectedVerdict: "compatible",
  },
  {
    label:
      "Cross-brand random combo, no explicit rule -> unverified or computed result",
    selection: {
      shifter: "shimano-tourney-tx800",
      rear_derailleur: "sram-xx-sl-transmission",
    },
    // 8s vs 12s -> speed mismatch (block) AND mechanical vs wireless (block).
    expectedVerdict: "block",
  },
  {
    label:
      "Crankset speed mismatch — 11s crankset (M5100) + 12s drivetrain -> block (real-world Deore→SLX upgrade)",
    selection: {
      crankset: "shimano-deore-m5100",
      rear_derailleur: "shimano-slx-m7100",
      chain: "shimano-slx-m7100",
    },
    expectedVerdict: "block",
    expectFindingId: "speed-match",
  },
  {
    label:
      "Labradoodle: Shimano XT M8100 chain + SRAM GX cassette (cross-brand 12s)",
    selection: {
      chain: "shimano-xt-m8100",
      cassette: "sram-gx-eagle",
    },
    // Both 12-speed -> speed-match compatible.
    // Explicit rule m8100-canin-sram-cassette-caveat -> labradoodle.
    // Worst wins -> labradoodle.
    expectedVerdict: "labradoodle",
    expectFindingId: "m8100-chain-sram-cassette-caveat",
  },
];

// ---------- Run ----------

let passed = 0;
let failed = 0;

for (const t of tests) {
  const result = evaluate(t.selection, data);
  const verdictOk = result.verdict === t.expectedVerdict;
  const findingIdOk = t.expectFindingId
    ? result.findings.some((f) => f.rule_id === t.expectFindingId)
    : true;
  const minFindingsOk =
    t.expectMinFindings === undefined ||
    result.findings.length >= t.expectMinFindings;

  const ok = verdictOk && findingIdOk && minFindingsOk;
  if (ok) passed++;
  else failed++;

  const mark = ok ? "OK  " : "FAIL";
  console.log(`${mark}  ${t.label}`);
  console.log(
    `      verdict=${result.verdict} (expected ${t.expectedVerdict}), findings=${result.findings.length}`,
  );
  if (!ok) {
    console.log("      DETAILS:", JSON.stringify(result, null, 2));
  } else if (result.findings.length > 0) {
    for (const f of result.findings) {
      console.log(
        `        - [${f.source}] ${f.rule_id} -> ${f.verdict}: ${f.message.slice(0, 100)}`,
      );
    }
  }
  console.log();
}

console.log(`\n${passed} passed, ${failed} failed (of ${tests.length})`);
process.exit(failed === 0 ? 0 : 1);
