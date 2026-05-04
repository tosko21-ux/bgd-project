"use strict";

// BGD Comparator — Phase B
// Session 6: adapted for 31-record dataset with range values
// Session 16: added Drivetrains | Brakes toggle

const MIN_SELECTED = 0;
const MAX_SELECTED = 3;

const VALID_TYPES = ["drivetrains", "brakes"];
const DEFAULT_TYPE = "drivetrains";

let currentType = DEFAULT_TYPE;
let selectedIds = [];
let allItems = [];

// ---------- URL params ----------
// Reads ?type=brakes (defaults to drivetrains)
function readTypeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  return VALID_TYPES.includes(type) ? type : DEFAULT_TYPE;
}

// Reads selected IDs from ?ids=id1,id2,id3
function readIdsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ids = params.get("ids");
  if (!ids) return [];
  return ids
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Updates the URL to reflect the current type and selection without reloading
function updateUrl() {
  const params = new URLSearchParams(window.location.search);

  // Type: only set when not default (cleaner shareable links for drivetrains)
  if (currentType !== DEFAULT_TYPE) {
    params.set("type", currentType);
  } else {
    params.delete("type");
  }

  if (selectedIds.length > 0) {
    params.set("ids", selectedIds.join(","));
  } else {
    params.delete("ids");
  }
  const newSearch = params.toString();
  const newUrl = window.location.pathname + (newSearch ? "?" + newSearch : "");
  window.history.replaceState({}, "", newUrl);
}

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

const tableRowsDrivetrains = [
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

const tableRowsBrakes = [
  {
    key: "pistons",
    label: "Pistons",
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
  { key: "mount_type", label: "Mount" },
  { key: "rotor_compat", label: "Rotor size" },
  { key: "oil_type", label: "Oil" },
  {
    key: "one_finger_lever",
    label: "1-finger lever",
    format: (v) => (v === true ? "Yes" : v === false ? "No" : "—"),
  },
  { key: "intended_use", label: "Use" },
  {
    key: "league",
    label: "League",
    format: (v, g) => g.league_label,
    diff: { type: "rank", lowerIsBetter: false },
  },
];

function getTableRows() {
  return currentType === "brakes" ? tableRowsBrakes : tableRowsDrivetrains;
}

// ---------- Data loading ----------
async function loadDataset(type) {
  const file = type === "brakes" ? "brakes.json" : "groupsets.json";
  try {
    const response = await fetch(`data/${file}`);
    return await response.json();
  } catch (error) {
    console.error(`Failed to load ${file}:`, error);
    return [];
  }
}

// ---------- Selection helpers ----------
function getById(id) {
  return allItems.find((g) => g.id === id);
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

  const addLabel = selected.length === 0 ? "+ Add groupset" : "+ Add another";
  const addHTML = canAdd
    ? `<button class="chip chip--add" type="button" id="add-chip" aria-label="${addLabel}">
         <span class="chip-label">${addLabel}</span>
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

  const tbodyHTML = getTableRows()
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

  // Brakes: no pros/cons engine yet (rules added in session 17)
  if (currentType === "brakes") {
    container.innerHTML = "";
    return;
  }

  // Generate dynamic pros/cons from rules engine
  const prosConsByGroupset = generateProsCons(selected);

  // Hide entire block if no rule produced output (e.g. only 1 set selected,
  // or all selected sets are too similar)
  if (!hasAnyProsCons(prosConsByGroupset)) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = selected
    .map((g) => {
      const entry = prosConsByGroupset[g.id] || { pros: [], cons: [] };
      const prosHTML = entry.pros.length
        ? `<ul class="proscons-list proscons-list--pros">${entry.pros.map((i) => `<li>${i}</li>`).join("")}</ul>`
        : "";
      const consHTML = entry.cons.length
        ? `<ul class="proscons-list proscons-list--cons">${entry.cons.map((i) => `<li>${i}</li>`).join("")}</ul>`
        : "";

      // If a groupset got nothing from any rule, skip the column entirely
      if (!prosHTML && !consHTML) return "";

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

  const matches = allItems.filter((g) => {
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

// ---------- Type switching ----------

// Updates static UI elements (title, subtitle, placeholder, legend, empty state)
// based on the current type. Called once on init and on every toggle switch.
function applyTypeUI() {
  const isBrakes = currentType === "brakes";

  // Page title + subtitle
  document.getElementById("page-title").textContent = isBrakes
    ? "Compare brakes"
    : "Compare groupsets";
  document.getElementById("page-subtitle").textContent = isBrakes
    ? "Pick 2–3 brake sets, see real differences."
    : "Pick 2–3 groupsets, see real differences.";

  // Browser tab title
  document.title = isBrakes
    ? "Compare brakes — BGD"
    : "Compare groupsets — BGD";

  // Search placeholder
  const searchInput = document.getElementById("search-input");
  searchInput.placeholder = isBrakes
    ? "Search a brake set to compare…"
    : "Search a groupset to compare…";
  searchInput.setAttribute(
    "aria-label",
    isBrakes ? "Search brake sets" : "Search groupsets",
  );

  // Empty state text
  document.getElementById("empty-state-text").textContent = isBrakes
    ? "Start by adding a brake set to compare."
    : "Start by adding a groupset to compare.";

  // Legend
  document.getElementById("compare-legend").textContent = isBrakes
    ? "*The price covers the brake set (lever + caliper, front + rear pair). Rotors and adapters are not included. Price and weight shown as market ranges. Difference badges are calculated from the midpoint of each range."
    : "*The price covers the drivetrain (shifter, derailleur, cassette, chain, crankset). Brakes, wheels, and other bits are not part of it. Price and weight shown as market ranges. Difference badges are calculated from the midpoint of each range.";

  // Missing brands note
  document.getElementById("missing-brands").textContent = isBrakes
    ? "Magura, Hope, Formula — if you own these, you didn't buy them by accident. BGD is for the rest of us."
    : "No Microshift, Box or Campagnolo Ekar yet. They're all on the list. Microshift quietly runs half the entry-level bikes out there — it deserves its own spot soon.";

  // Toggle button active states
  const buttons = document.querySelectorAll(".type-toggle-btn");
  buttons.forEach((btn) => {
    const isActive = btn.dataset.type === currentType;
    btn.classList.toggle("type-toggle-btn--active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  // Section aria-label
  document
    .querySelector(".comparator")
    .setAttribute(
      "aria-label",
      isBrakes ? "Brake comparator" : "Groupset comparator",
    );
}

// Switches between drivetrains and brakes. Resets selection.
async function switchType(newType) {
  if (!VALID_TYPES.includes(newType)) return;
  if (newType === currentType) return;

  currentType = newType;
  selectedIds = [];
  allItems = await loadDataset(currentType);

  applyTypeUI();
  clearSearch();
  renderAll();
}

function renderAll() {
  const isEmpty = selectedIds.length === 0;
  document.getElementById("empty-state").hidden = !isEmpty;
  document.querySelector(".compare-table-wrapper").hidden = isEmpty;
  document.querySelector(".compare-legend").hidden = isEmpty;
  document.getElementById("missing-brands").hidden = isEmpty;
  document.getElementById("honest-takes").hidden = isEmpty;
  document.getElementById("proscons").hidden = isEmpty;

  renderChips();
  renderTable();
  renderHonestTakes();
  renderProsCons();
  updateUrl();
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

  // Type toggle (Drivetrains | Brakes)
  document.querySelectorAll(".type-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchType(btn.dataset.type);
    });
  });
}

// ---------- Init ----------
async function init() {
  currentType = readTypeFromUrl();
  allItems = await loadDataset(currentType);

  const urlIds = readIdsFromUrl();
  const validIds = allItems.map((g) => g.id);
  selectedIds = urlIds
    .filter((id) => validIds.includes(id))
    .slice(0, MAX_SELECTED);

  applyTypeUI();
  setupEvents();
  renderAll();
}

init();
