"use strict";

// BGD Comparator — Phase B
// Step 3: Render table with diff badges

const selectedIds = ["shimano-deore-m6100", "shimano-slx-m7100"];

// Row config:
// - key: field in JSON
// - label: shown to user
// - format: optional, formats raw value
// - diff: optional, defines how to compute the badge
//   - type: 'number' (numeric diff like −210 g) or 'rank' (just an ↑ arrow)
//   - lowerIsBetter: true if smaller value is better (weight, price)
//   - unit: prefix or suffix for the badge
const tableRows = [
  {
    key: "speeds",
    label: "Speeds",
    diff: { type: "rank", lowerIsBetter: false },
  },
  {
    key: "weight_g_approx",
    label: "Weight",
    format: (v) => `${v} g`,
    diff: { type: "number", lowerIsBetter: true, unit: "g", suffix: true },
  },
  {
    key: "price_eur_approx",
    label: "Price",
    format: (v) => `€${v}`,
    diff: { type: "number", lowerIsBetter: true, unit: "€", suffix: false },
  },
  { key: "freehub", label: "Freehub" },
  {
    key: "gear_range_percent",
    label: "Gear range",
    format: (v) => `${v}%`,
    diff: { type: "rank", lowerIsBetter: false },
  },
  { key: "cassette_range", label: "Cassette" },
  {
    key: "league",
    label: "League",
    format: (v, g) => g.league_label,
    diff: { type: "rank", lowerIsBetter: false },
  },
  { key: "year_introduced", label: "Year" },
];

async function loadGroupsets() {
  try {
    const response = await fetch("data/groupsets.json");
    return await response.json();
  } catch (error) {
    console.error("Failed to load groupsets:", error);
    return [];
  }
}

// Build a diff badge HTML for a single cell.
// Returns '' if no badge should be shown (only one item, or this is the best, or all equal).
function buildBadge(value, allValues, diffConfig) {
  if (!diffConfig) return "";
  if (allValues.length < 2) return "";

  const best = diffConfig.lowerIsBetter
    ? Math.min(...allValues)
    : Math.max(...allValues);

  // All values equal → no badge for anyone
  if (allValues.every((v) => v === allValues[0])) return "";

  // This cell IS the best → no badge (the others get badges relative to it)
  if (value === best) return "";

  // Compute diff vs best
  const diff = value - best;
  const isWorse = diffConfig.lowerIsBetter ? diff > 0 : diff < 0;
  const badgeClass = isWorse ? "diff-badge--warn" : "diff-badge--good";

  if (diffConfig.type === "rank") {
    const symbol = isWorse ? "↓" : "↑";
    return `<span class="diff-badge ${badgeClass}">${symbol}</span> `;
  }

  // type: 'number'
  const sign = diff > 0 ? "+" : "−"; // − is the proper minus sign
  const absDiff = Math.abs(diff);
  const text = diffConfig.suffix
    ? `${sign}${absDiff} ${diffConfig.unit}`
    : `${sign}${diffConfig.unit}${absDiff}`;
  return `<span class="diff-badge ${badgeClass}">${text}</span> `;
}

function renderTable(allGroupsets) {
  const selected = selectedIds
    .map((id) => allGroupsets.find((g) => g.id === id))
    .filter(Boolean);

  const headerCells = selected
    .map(
      (g) => `
        <th scope="col">
          <span class="compare-brand">${g.brand} ${g.family}</span>
          <span class="compare-model">${g.series}</span>
        </th>`,
    )
    .join("");

  const theadHTML = `
    <tr>
      <th scope="col" class="compare-label-col"></th>
      ${headerCells}
    </tr>`;

  const tbodyHTML = tableRows
    .map((row) => {
      // Collect all values for this row across selected groupsets
      const allValues = selected.map((g) => g[row.key]);

      const cells = selected
        .map((g) => {
          const raw = g[row.key];
          const display = row.format ? row.format(raw, g) : raw;
          const badge = buildBadge(raw, allValues, row.diff);
          return `<td>${badge}${display}</td>`;
        })
        .join("");

      return `
        <tr>
          <th scope="row">${row.label}</th>
          ${cells}
        </tr>`;
    })
    .join("");

  const table = document.getElementById("compare-table");
  table.querySelector("thead").innerHTML = theadHTML;
  table.querySelector("tbody").innerHTML = tbodyHTML;
}

async function init() {
  const groupsets = await loadGroupsets();
  renderTable(groupsets);
}

init();
