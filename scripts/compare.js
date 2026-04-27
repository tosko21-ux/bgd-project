"use strict";

// BGD Comparator — Phase B
// Session 6: adapted for 31-record dataset with range values

const MIN_SELECTED = 1;
const MAX_SELECTED = 3;

let selectedIds = ["shimano-deore-m6100", "shimano-slx-m7100"];
let allGroupsets = [];

// ---------- Helpers ----------

// Parse numeric values, including ranges like "240 - 290" → midpoint 265.
// Used for diff calculations only; cells display the raw string.
function parseNumeric(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const parts = value.split("-").map((s) => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return (parts[0] + parts[1]) / 2;
  }
  return parseFloat(value);
}

// Format gear_range_percent ratio (e.g. 5.1) as a percent string (e.g. "510%")
function formatGearRange(v) {
  return `${Math.round(v * 100)}%`;
}

// ---------- Table config ----------

const tableRows = [
  {
    key: "speeds",
    label: "Speeds",
    diff: { type: "rank", lowerIsBetter: false },
  },
  {
    key: "weight_g_approx",
    label: "Weight (g)",
    diff: {
      type: "number",
      lowerIsBetter: true,
      unit: "g",
      suffix: true,
      parse: parseNumeric,
    },
  },
  {
    key: "price_eur_approx",
    label: "Price (€)*",
    diff: {
      type: "number",
      lowerIsBetter: true,
      unit: "€",
      suffix: false,
      parse: parseNumeric,
    },
  },
  { key: "freehub", label: "Freehub" },
  {
    key: "gear_range_percent",
    label: "Gear range (%)",
    format: (v) => Math.round(v * 100),
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

// ---------- Data loading ----------
async function loadGroupsets() {
  try {
    const response = await fetch("data/groupsets.json");
    return await response.json();
  } catch (error) {
    console.error("Failed to load groupsets:", error);
    return [];
  }
}

// ---------- Selection helpers ----------
function getById(id) {
  return allGroupsets.find((g) => g.id === id);
}

function getSelected() {
  return selectedIds.map(getById).filter(Boolean);
}

function displayName(g) {
  return `${g.family} ${g.series}`;
}

// ---------- Diff badge ----------
function buildBadge(value, allValues, diffConfig) {
  if (!diffConfig) return "";
  if (allValues.length < 2) return "";

  // Exclude NaN values (e.g. unparseable strings) from best calculation
  const validValues = allValues.filter((v) => !Number.isNaN(v));
  if (validValues.length < 2) return "";

  const best = diffConfig.lowerIsBetter
    ? Math.min(...validValues)
    : Math.max(...validValues);

  if (validValues.every((v) => v === validValues[0])) return "";
  if (value === best) return "";
  if (Number.isNaN(value)) return "";

  const diff = value - best;
  const isWorse = diffConfig.lowerIsBetter ? diff > 0 : diff < 0;
  const badgeClass = isWorse ? "diff-badge--warn" : "diff-badge--good";

  if (diffConfig.type === "rank") {
    const symbol = isWorse ? "↓" : "↑";
    return `<span class="diff-badge ${badgeClass}">${symbol}</span> `;
  }

  const sign = diff > 0 ? "+" : "−";
  const absDiff = Math.round(Math.abs(diff));
  const text = diffConfig.suffix
    ? `${sign}${absDiff} ${diffConfig.unit}`
    : `${sign}${diffConfig.unit}${absDiff}`;
  return `<span class="diff-badge ${badgeClass}">${text}</span> `;
}

// ---------- Render: Chips ----------
function renderChips() {
  const container = document.getElementById("chips");
  const selected = getSelected();

  const canRemove = selected.length > MIN_SELECTED;
  const canAdd = selected.length < MAX_SELECTED;

  const chipsHTML = selected
    .map((g) => {
      const removeBtn = canRemove
        ? `<span class="chip-remove" aria-hidden="true">×</span>`
        : "";
      return `
        <button
          class="chip"
          type="button"
          data-id="${g.id}"
          aria-label="${canRemove ? `Remove ${displayName(g)}` : displayName(g)}"
          ${canRemove ? "" : "disabled"}
        >
          <span class="chip-label">${displayName(g)}</span>
          ${removeBtn}
        </button>`;
    })
    .join("");

  const addHTML = canAdd
    ? `<button class="chip chip--add" type="button" id="add-chip" aria-label="Add another groupset">
         <span class="chip-label">+ Add another</span>
       </button>`
    : "";

  container.innerHTML = chipsHTML + addHTML;
}

// ---------- Render: Table ----------
function renderTable() {
  const selected = getSelected();
  const table = document.getElementById("compare-table");

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
      // If diff config has a parser, use it to produce numeric values for diff.
      // Cells still show the raw (or formatted) value.
      const parser = row.diff?.parse;
      const rawValues = selected.map((g) => g[row.key]);
      const diffValues = parser ? rawValues.map(parseNumeric) : rawValues;

      const cells = selected
        .map((g, i) => {
          const raw = rawValues[i];
          const display = row.format ? row.format(raw, g) : raw;
          const badge = buildBadge(diffValues[i], diffValues, row.diff);
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

  table.querySelector("thead").innerHTML = theadHTML;
  table.querySelector("tbody").innerHTML = tbodyHTML;
}

// ---------- Render: Honest takes ----------
function renderHonestTakes() {
  const container = document.getElementById("honest-takes");
  const selected = getSelected();

  container.innerHTML = selected
    .map((g) => {
      const text = g.honest_take || "Honest take coming soon.";
      const isPlaceholder = !g.honest_take;
      const extraClass = isPlaceholder ? " honest-take--placeholder" : "";
      return `
        <aside class="honest-take${extraClass}" aria-label="Honest take on ${displayName(g)}">
          <p class="honest-take-label">Honest take — ${displayName(g)}</p>
          <p class="honest-take-text">${text}</p>
        </aside>`;
    })
    .join("");
}

// ---------- Render: Pros/Cons ----------
function renderProsCons() {
  const container = document.getElementById("proscons");
  const selected = getSelected();

  // Hide entire block if no record has pros or cons data.
  // Pros/cons will be generated dynamically from diffs in a future session.
  const hasAnyData = selected.some(
    (g) => Array.isArray(g.pros) || Array.isArray(g.cons),
  );
  if (!hasAnyData) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = selected
    .map((g) => {
      const pros = Array.isArray(g.pros) ? g.pros : [];
      const cons = Array.isArray(g.cons) ? g.cons : [];
      const prosHTML = pros.length
        ? `<ul class="proscons-list proscons-list--pros">${pros.map((i) => `<li>${i}</li>`).join("")}</ul>`
        : "";
      const consHTML = cons.length
        ? `<ul class="proscons-list proscons-list--cons">${cons.map((i) => `<li>${i}</li>`).join("")}</ul>`
        : "";
      return `
        <div class="proscons-col">
          <h3 class="proscons-title">${displayName(g)}</h3>
          ${prosHTML}
          ${consHTML}
        </div>`;
    })
    .join("");
}

// ---------- Render: Search dropdown ----------
function renderSearchResults(query) {
  const dropdown = document.getElementById("search-results");
  const trimmed = query.trim().toLowerCase();

  if (trimmed === "") {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
    return;
  }

  const matches = allGroupsets.filter((g) => {
    if (selectedIds.includes(g.id)) return false;
    const haystack = `${g.brand} ${g.family} ${g.series}`.toLowerCase();
    return haystack.includes(trimmed);
  });

  if (matches.length === 0) {
    dropdown.innerHTML = `<li class="search-no-results">No matches found</li>`;
    dropdown.hidden = false;
    return;
  }

  dropdown.innerHTML = matches
    .map(
      (g) => `
        <li class="search-result" role="option" data-id="${g.id}" tabindex="0">
          <span class="search-result-brand">${g.brand}</span>
          ${displayName(g)}
        </li>`,
    )
    .join("");
  dropdown.hidden = false;
}

function clearSearch() {
  const input = document.getElementById("search-input");
  const dropdown = document.getElementById("search-results");
  input.value = "";
  dropdown.hidden = true;
  dropdown.innerHTML = "";
}

// ---------- Actions ----------
function addGroupset(id) {
  if (selectedIds.length >= MAX_SELECTED) return;
  if (selectedIds.includes(id)) return;
  selectedIds.push(id);
  renderAll();
  clearSearch();
}

function removeGroupset(id) {
  if (selectedIds.length <= MIN_SELECTED) return;
  selectedIds = selectedIds.filter((selectedId) => selectedId !== id);
  renderAll();
}

function renderAll() {
  renderChips();
  renderTable();
  renderHonestTakes();
  renderProsCons();
}

// ---------- Event wiring ----------
function setupEvents() {
  const chipsContainer = document.getElementById("chips");
  const searchInput = document.getElementById("search-input");
  const dropdown = document.getElementById("search-results");

  chipsContainer.addEventListener("click", (event) => {
    const removeBtn = event.target.closest(".chip-remove");
    if (removeBtn) {
      const chip = removeBtn.closest(".chip");
      const id = chip.dataset.id;
      removeGroupset(id);
      return;
    }

    const addBtn = event.target.closest("#add-chip");
    if (addBtn) {
      searchInput.focus();
    }
  });

  searchInput.addEventListener("input", (event) => {
    renderSearchResults(event.target.value);
  });

  dropdown.addEventListener("click", (event) => {
    const result = event.target.closest(".search-result");
    if (!result) return;
    addGroupset(result.dataset.id);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search")) {
      dropdown.hidden = true;
    }
  });
}

// ---------- Init ----------
async function init() {
  allGroupsets = await loadGroupsets();
  setupEvents();
  renderAll();
}

init();
