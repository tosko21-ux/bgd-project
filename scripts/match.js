/* ==========================================================================
   BGD — match.js
   Component Match tool — UI controller
   --------------------------------------------------------------------------
   Responsibilities:
   - Load groupsets + compatibility rules (computed/explicit/extended)
   - Render 5 component cards (shifter, RD, cassette, chain, crankset)
   - Custom dropdown picker per card (grouped by brand, with search filter)
   - Wire up to compatibility-engine.js (window.SpiderEngine.evaluate)
   - Verdict bar live update (worst-finding wins)
   - Per-card status badges (worst-finding-touching-card wins)
   - Findings list below cards (compatible: one-liner, others: full row + reason)
   - URL query params for sharing/permalinks
   ========================================================================== */

(function () {
  "use strict";

  // ---------- Constants ----------

  const ROLES = [
    { key: "shifter", label: "Shifter" },
    { key: "rear_derailleur", label: "Rear derailleur" },
    { key: "cassette", label: "Cassette" },
    { key: "chain", label: "Chain" },
    { key: "crankset", label: "Crankset" },
  ];

  const VERDICT_META = {
    compatible: { label: "Compatible", className: "verdict--compatible" },
    caveat: { label: "Caveat", className: "verdict--caveat" },
    block: { label: "Block", className: "verdict--block" },
    unverified: { label: "Unverified", className: "verdict--unverified" },
  };

  // Maps a finding's verdict + risk_level to a CSS class suffix.
  // Caveat with risk_level "high" -> "caveat-high" (orange palette).
  // Caveat with risk_level "low" or missing -> "caveat" (yellow palette).
  // Other verdicts pass through unchanged.
  function verdictClassSuffix(finding) {
    if (!finding) return "unverified";
    const v = finding.verdict;
    if (v === "caveat" && finding.risk_level === "high") return "caveat-high";
    return v;
  }

  // Verdict ladder, worst wins. Must match SpiderEngine.VERDICT_RANK.
  // Hierarchy: BLOCK > CAVEAT > UNVERIFIED > COMPATIBLE.
  // Note: caveat covers BOTH yellow (risk_level=low) and orange (risk_level=high)
  // UI states. Same rank — UI split happens via verdictClassSuffix() above.
  // Session 28: legacy `labradoodle` verdict removed; now caveat+risk_level=high.
  const VERDICT_RANK = {
    compatible: 0,
    unverified: 1,
    caveat: 2,
    block: 3,
  };

  // URL query param keys (short aliases for permalink readability)
  const URL_KEYS = {
    shifter: "sh",
    rear_derailleur: "rd",
    cassette: "cs",
    chain: "ch",
    crankset: "cr",
  };

  // ---------- State ----------

  const state = {
    selection: {}, // { role: groupsetId }
    groupsets: [],
    computed: [],
    explicit: [],
    extended: [],
    pickerOpenForRole: null, // role currently picking; null = closed
    systemModalOpen: false, // true while the system-rule "Learn more" modal is open
  };

  // ---------- DOM refs ----------

  const els = {};

  // ---------- Init ----------

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    els.verdictBar = document.getElementById("verdict-bar");
    els.verdictText = els.verdictBar.querySelector(".verdict-bar-text");
    els.systemBanner = document.getElementById("system-banner");
    els.cards = document.getElementById("match-cards");
    els.findings = document.getElementById("match-findings");
    els.reset = document.getElementById("match-reset");

    try {
      await loadData();
    } catch (err) {
      console.error("Component Match: failed to load data", err);
      els.cards.innerHTML =
        '<p class="empty-state-text">Could not load compatibility data. Please refresh.</p>';
      return;
    }

    readSelectionFromURL();
    renderCards();
    runEngineAndRender();

    els.reset.addEventListener("click", onReset);
    document.addEventListener("keydown", onGlobalKeydown);
  }

  // ---------- Data loading ----------

  async function loadData() {
    const fetches = [
      fetch("data/groupsets.json").then((r) => r.json()),
      fetch("data/compatibility_rules/computed.json").then((r) => r.json()),
      fetch("data/compatibility_rules/explicit.json").then((r) => r.json()),
      fetch("data/compatibility_rules/extended.json").then((r) =>
        r.ok ? r.json() : [],
      ),
    ];
    const [groupsets, computed, explicit, extended] =
      await Promise.all(fetches);
    // Component Match only shows groupsets explicitly marked as supported.
    // Excluded groupsets (lower-tier like Tourney/Altus/Acera/Alivio/M4100)
    // remain in groupsets.json for Compare tool but are hidden here until
    // their compatibility data is fully researched.
    state.groupsets = groupsets.filter(
      (g) => g.component_match_supported !== false,
    );
    state.computed = computed;
    state.explicit = explicit;
    state.extended = extended;
  }

  // ---------- URL params ----------

  function readSelectionFromURL() {
    const params = new URLSearchParams(window.location.search);
    for (const role of Object.keys(URL_KEYS)) {
      const id = params.get(URL_KEYS[role]);
      if (id && state.groupsets.some((g) => g.id === id)) {
        state.selection[role] = id;
      }
    }
  }

  function writeSelectionToURL() {
    const params = new URLSearchParams();
    for (const role of Object.keys(URL_KEYS)) {
      if (state.selection[role]) {
        params.set(URL_KEYS[role], state.selection[role]);
      }
    }
    const query = params.toString();
    const newUrl =
      window.location.pathname +
      (query ? "?" + query : "") +
      window.location.hash;
    window.history.replaceState({}, "", newUrl);
  }

  // ---------- Cards render ----------

  function renderCards() {
    els.cards.innerHTML = "";
    for (const role of ROLES) {
      const card = renderCard(role);
      els.cards.appendChild(card);
    }
  }

  function renderCard(role) {
    const card = document.createElement("div");
    card.className = "match-card";
    card.dataset.role = role.key;

    const selectedId = state.selection[role.key];
    const selectedGs = selectedId
      ? state.groupsets.find((g) => g.id === selectedId)
      : null;

    // Header (role label + status badge)
    const header = document.createElement("div");
    header.className = "match-card-header";

    const label = document.createElement("h2");
    label.className = "match-card-label";
    label.textContent = role.label;
    header.appendChild(label);

    const badge = document.createElement("span");
    badge.className = "status-badge";
    badge.dataset.role = role.key;
    badge.innerHTML =
      '<span class="status-dot"></span><span class="status-text">Unverified</span>';
    header.appendChild(badge);

    card.appendChild(header);

    // Picker trigger button (shows selected groupset or "Select")
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "picker-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.addEventListener("click", () => openPicker(role.key));

    if (selectedGs) {
      trigger.innerHTML = `
        <span class="picker-trigger-content">
          <span class="picker-trigger-brand">${escapeHtml(selectedGs.brand)}</span>
          <span class="picker-trigger-model">${escapeHtml(formatModel(selectedGs))}</span>
        </span>
        <span class="picker-trigger-clear" aria-label="Clear ${role.label}">×</span>
      `;
      // Click on × clears, click elsewhere opens picker
      trigger
        .querySelector(".picker-trigger-clear")
        .addEventListener("click", (e) => {
          e.stopPropagation();
          clearRole(role.key);
        });
    } else {
      trigger.innerHTML =
        '<span class="picker-trigger-placeholder">Select…</span>';
    }

    card.appendChild(trigger);

    return card;
  }

  // ---------- Picker (dropdown modal) ----------

  function openPicker(roleKey) {
    state.pickerOpenForRole = roleKey;

    // Build picker overlay
    let picker = document.getElementById("match-picker");
    if (picker) picker.remove();

    picker = document.createElement("div");
    picker.id = "match-picker";
    picker.className = "picker-overlay";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-modal", "true");
    picker.setAttribute("aria-label", `Select ${roleLabel(roleKey)}`);

    const role = ROLES.find((r) => r.key === roleKey);
    picker.innerHTML = `
      <div class="picker-panel" role="document">
        <div class="picker-header">
          <h2 class="picker-title">Select ${escapeHtml(role.label)}</h2>
          <button type="button" class="picker-close" aria-label="Close picker">×</button>
        </div>
        <div class="picker-search">
          <input
            type="search"
            class="search-input"
            id="picker-search-input"
            placeholder="Search by brand or model…"
            autocomplete="off"
          />
        </div>
        <div class="picker-list" id="picker-list"></div>
      </div>
    `;

    document.body.appendChild(picker);
    renderPickerList("");

    // Wire up
    picker.addEventListener("click", (e) => {
      if (e.target === picker) closePicker(); // click on backdrop
    });
    picker
      .querySelector(".picker-close")
      .addEventListener("click", closePicker);

    const searchInput = picker.querySelector("#picker-search-input");
    searchInput.addEventListener("input", (e) =>
      renderPickerList(e.target.value),
    );
    setTimeout(() => searchInput.focus(), 50);
  }

  function closePicker() {
    state.pickerOpenForRole = null;
    const picker = document.getElementById("match-picker");
    if (picker) picker.remove();
  }

  function renderPickerList(query) {
    const list = document.getElementById("picker-list");
    if (!list) return;

    const q = query.trim().toLowerCase();
    const filtered = q
      ? state.groupsets.filter((g) => {
          const haystack = (
            g.brand +
            " " +
            g.family +
            " " +
            (g.series || "") +
            " " +
            (g.id || "")
          ).toLowerCase();
          return haystack.includes(q);
        })
      : state.groupsets;

    if (filtered.length === 0) {
      list.innerHTML =
        '<p class="picker-empty">No groupsets match your search.</p>';
      return;
    }

    // Group by brand
    const groups = {};
    for (const g of filtered) {
      if (!groups[g.brand]) groups[g.brand] = [];
      groups[g.brand].push(g);
    }
    const brandsOrdered = Object.keys(groups).sort();

    list.innerHTML = "";
    for (const brand of brandsOrdered) {
      const groupEl = document.createElement("div");
      groupEl.className = "picker-group";

      const heading = document.createElement("h3");
      heading.className = "picker-group-heading";
      heading.textContent = brand;
      groupEl.appendChild(heading);

      const items = document.createElement("ul");
      items.className = "picker-items";

      for (const g of groups[brand]) {
        const li = document.createElement("li");
        li.className = "picker-item";
        const isSelected = state.selection[state.pickerOpenForRole] === g.id;
        li.innerHTML = `
          <button type="button" class="picker-item-btn${isSelected ? " is-selected" : ""}" data-id="${escapeHtml(g.id)}">
            <span class="picker-item-model">${escapeHtml(formatModel(g))}</span>
            ${g.speeds ? `<span class="picker-item-meta">${escapeHtml(String(g.speeds))}-speed</span>` : ""}
          </button>
        `;
        li.querySelector("button").addEventListener("click", () => {
          selectRole(state.pickerOpenForRole, g.id);
          closePicker();
        });
        items.appendChild(li);
      }
      groupEl.appendChild(items);
      list.appendChild(groupEl);
    }
  }

  // ---------- Selection actions ----------

  function selectRole(roleKey, groupsetId) {
    state.selection[roleKey] = groupsetId;
    writeSelectionToURL();
    renderCards();
    runEngineAndRender();
  }

  function clearRole(roleKey) {
    delete state.selection[roleKey];
    writeSelectionToURL();
    renderCards();
    runEngineAndRender();
  }

  function onReset() {
    state.selection = {};
    writeSelectionToURL();
    renderCards();
    runEngineAndRender();
  }

  function onGlobalKeydown(e) {
    if (e.key === "Escape") {
      if (state.systemModalOpen) {
        closeSystemModal();
        return;
      }
      if (state.pickerOpenForRole) {
        closePicker();
      }
    }
  }

  // ---------- Engine + render ----------

  function runEngineAndRender() {
    const engine = window.SpiderEngine;
    if (!engine || !engine.evaluate) {
      console.error("Component Match: SpiderEngine not loaded");
      return;
    }

    const result = engine.evaluate(state.selection, {
      groupsets: state.groupsets,
      computed: state.computed,
      explicit: state.explicit,
      extended: state.extended,
    });

    renderVerdictBar(result);
    renderSystemBanner(result);
    renderStatusBadges(result);
    renderFindings(result);
  }

  function renderVerdictBar(result) {
    const meta = VERDICT_META[result.verdict] || VERDICT_META.unverified;

    // Determine the CSS suffix from the OVERALL verdict + the dominant
    // finding's risk_level (e.g. when overall is "caveat" we want to know if
    // ANY finding with that verdict is high-risk).
    const headline = result.findings.find((f) => f.verdict === result.verdict);
    // For overall caveat, scan all caveat findings and pick high if any.
    let dominantRiskLevel;
    if (result.verdict === "caveat") {
      const anyHigh = result.findings.some(
        (f) => f.verdict === "caveat" && f.risk_level === "high",
      );
      dominantRiskLevel = anyHigh ? "high" : "low";
    } else if (headline) {
      dominantRiskLevel = headline.risk_level;
    }
    const suffix = verdictClassSuffix({
      verdict: result.verdict,
      risk_level: dominantRiskLevel,
    });

    // Reset modifier classes
    els.verdictBar.classList.remove(
      "verdict-bar--compatible",
      "verdict-bar--caveat",
      "verdict-bar--caveat-high",
      "verdict-bar--block",
      "verdict-bar--unverified",
    );
    els.verdictBar.classList.add("verdict-bar--" + suffix);

    // Adaptive content: compatible = minimal, others = verdict + headline issue.
    // Unverified has two flavors:
    //   - nothing selected      -> empty-state copy
    //   - something selected    -> Q5 copy (Session 26): "No verified rule —
    //                              proceed at your own risk."
    if (result.verdict === "unverified") {
      const hasAnySelection = Object.keys(state.selection).length > 0;
      els.verdictText.textContent = hasAnySelection
        ? "No verified rule — proceed at your own risk."
        : "Select components to check compatibility";
    } else if (result.verdict === "compatible") {
      els.verdictText.textContent = "Compatible";
    } else {
      const summary = headline
        ? truncate(stripFirstSentence(headline.message), 90)
        : "";
      els.verdictText.innerHTML =
        `<strong>${escapeHtml(meta.label)}</strong>` +
        (summary ? ` — ${escapeHtml(summary)}` : "");
    }
  }

  function renderStatusBadges(result) {
    // For each role: worst verdict among findings touching this role.
    // Tracks both verdict + risk_level so high-risk caveats override low-risk ones.
    const roleVerdicts = {}; // role -> { verdict, risk_level }
    for (const finding of result.findings) {
      // Engine post-Session-26 uses finding.pair = [roleA, roleB] (pair-based shape).
      const roles = finding.pair || [];
      for (const role of roles) {
        const cur = roleVerdicts[role];
        const newRank = VERDICT_RANK[finding.verdict] ?? -1;
        const curRank = cur ? (VERDICT_RANK[cur.verdict] ?? -1) : -1;
        if (
          cur === undefined ||
          newRank > curRank ||
          // Same rank but high-risk wins over low-risk (within caveat).
          (newRank === curRank &&
            finding.verdict === "caveat" &&
            finding.risk_level === "high" &&
            cur.risk_level !== "high")
        ) {
          roleVerdicts[role] = {
            verdict: finding.verdict,
            risk_level: finding.risk_level,
          };
        }
      }
    }

    for (const role of ROLES) {
      const badge = els.cards.querySelector(
        `.status-badge[data-role="${role.key}"]`,
      );
      if (!badge) continue;

      const isSelected = !!state.selection[role.key];
      const entry = isSelected
        ? roleVerdicts[role.key] || { verdict: "unverified" }
        : { verdict: "unverified" };
      const meta = VERDICT_META[entry.verdict] || VERDICT_META.unverified;
      const suffix = verdictClassSuffix(entry);

      badge.className = "status-badge status-badge--" + suffix;
      badge.querySelector(".status-text").textContent = meta.label;
    }
  }

  function renderFindings(result) {
    els.findings.innerHTML = "";

    if (result.findings.length === 0) {
      // No findings at all
      if (Object.keys(state.selection).length === 0) {
        els.findings.innerHTML =
          '<p class="empty-state-text">No components selected yet.</p>';
      } else {
        els.findings.innerHTML =
          '<p class="empty-state-text">No compatibility checks apply to this selection yet.</p>';
      }
      return;
    }

    // Sort: worst first (so users see problems at top)
    const sorted = [...result.findings].sort(
      (a, b) =>
        (VERDICT_RANK[b.verdict] ?? -1) - (VERDICT_RANK[a.verdict] ?? -1),
    );

    for (const finding of sorted) {
      const row = document.createElement("div");
      const suffix = verdictClassSuffix(finding);
      row.className = "finding finding--" + suffix;

      if (finding.verdict === "compatible") {
        // Compact: dot + short label, no reason text
        row.innerHTML = `
          <span class="finding-dot" aria-hidden="true"></span>
          <span class="finding-text">${escapeHtml(stripFirstSentence(finding.message) || ruleLabelFallback(finding))}</span>
        `;
      } else {
        // Full row with left border + verdict label + reason expanded
        const meta = VERDICT_META[finding.verdict] || VERDICT_META.unverified;
        row.innerHTML = `
          <span class="finding-label">${escapeHtml(meta.label)}</span>
          <p class="finding-reason">${escapeHtml(finding.message || "")}</p>
        `;
      }
      els.findings.appendChild(row);
    }
  }

  // ---------- Helpers ----------

  function roleLabel(roleKey) {
    const r = ROLES.find((x) => x.key === roleKey);
    return r ? r.label : roleKey;
  }

  // ---------- System-level rule banner + modal ----------
  //
  // System rules (type: "system" in explicit.json) fire when a trigger matches
  // the current selection, independent of which other components are picked.
  // They surface as a banner under the verdict bar with a short message plus
  // a "Learn more" button that opens a modal with the full reason text.

  function renderSystemBanner(result) {
    const banner = els.systemBanner;
    if (!banner) return;

    const systemFindings = (result.findings || []).filter(
      (f) => f.type === "system",
    );

    if (systemFindings.length === 0) {
      banner.innerHTML = "";
      banner.classList.add("is-hidden");
      banner.classList.remove(
        "system-banner--caveat",
        "system-banner--caveat-high",
        "system-banner--block",
      );
      // Close modal if it was open against a no-longer-active finding.
      if (state.systemModalOpen) closeSystemModal();
      return;
    }

    // Render one banner per system finding (typically just one).
    banner.classList.remove("is-hidden");
    banner.innerHTML = "";

    for (const finding of systemFindings) {
      const suffix = verdictClassSuffix({
        verdict: finding.verdict,
        risk_level: finding.risk_level,
      });
      // Banner gets a per-finding modifier class so colour reflects the rule.
      banner.classList.add("system-banner--" + suffix);

      const row = document.createElement("div");
      row.className = "system-banner-row";
      row.innerHTML = `
        <span class="system-banner-icon" aria-hidden="true">⚠</span>
        <span class="system-banner-text">${escapeHtml(
          finding.short_message || finding.message || "",
        )}</span>
        <button
          type="button"
          class="system-banner-cta"
          data-rule-id="${escapeHtml(finding.rule_id || "")}"
        >Learn more</button>
      `;
      row.querySelector(".system-banner-cta").addEventListener("click", () => {
        openSystemModal(finding);
      });
      banner.appendChild(row);
    }
  }

  function openSystemModal(finding) {
    state.systemModalOpen = true;

    let modal = document.getElementById("system-modal");
    if (modal) modal.remove();

    modal = document.createElement("div");
    modal.id = "system-modal";
    modal.className = "system-modal-overlay";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "system-modal-title");

    // Full reason text: plaintext with \n\n paragraphs and • bullets.
    // We render via white-space: pre-line in CSS, escaping HTML for safety.
    const reasonRaw = finding.message || "";
    // Engine convention: finding.source is the origin tag (e.g. "explicit");
    // the publisher/url metadata object lives on finding.source_meta.
    const sourceObj = finding.source_meta || null;

    modal.innerHTML = `
      <div class="system-modal-panel" role="document">
        <div class="system-modal-header">
          <h2 class="system-modal-title" id="system-modal-title">${escapeHtml(
            finding.short_message || "Compatibility note",
          )}</h2>
          <button type="button" class="system-modal-close" aria-label="Close">×</button>
        </div>
        <div class="system-modal-body">
          <div class="system-modal-reason">${escapeHtml(reasonRaw)}</div>
          ${
            sourceObj && sourceObj.url
              ? `<p class="system-modal-source">
                  Source:
                  <a href="${escapeHtml(sourceObj.url)}"
                     target="_blank"
                     rel="noopener noreferrer">${escapeHtml(
                       sourceObj.publisher || "Reference",
                     )}${
                       sourceObj.title
                         ? " — " + escapeHtml(sourceObj.title)
                         : ""
                     }</a>
                </p>`
              : ""
          }
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Backdrop click closes
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeSystemModal();
    });
    modal
      .querySelector(".system-modal-close")
      .addEventListener("click", closeSystemModal);

    // Focus close button for keyboard accessibility
    setTimeout(() => {
      const btn = modal.querySelector(".system-modal-close");
      if (btn) btn.focus();
    }, 50);
  }

  function closeSystemModal() {
    state.systemModalOpen = false;
    const modal = document.getElementById("system-modal");
    if (modal) modal.remove();
  }

  // ---------- Helpers ----------

  // Format groupset model as "family + series" (e.g. "GX Eagle", "X01 Eagle AXS").
  // Falls back to family alone if series is missing or already contained in family.
  function formatModel(g) {
    if (!g) return "";
    const family = g.family || "";
    const series = g.series || "";
    if (!series) return family;
    // Avoid duplication if family already contains series (e.g. family="XTR Di2" + series="Di2")
    if (family.toLowerCase().includes(series.toLowerCase())) return family;
    return `${family} ${series}`.trim();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function truncate(s, n) {
    if (!s) return "";
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  // For compatible findings — extract first sentence as a short label.
  // E.g. "All selected components are 12-speed." -> "All selected components are 12-speed"
  function stripFirstSentence(msg) {
    if (!msg) return "";
    const m = msg.match(/^[^.!?—]+/);
    return m ? m[0].trim() : msg;
  }

  function ruleLabelFallback(finding) {
    return finding.rule_id ? finding.rule_id.replace(/-/g, " ") : "Check";
  }
})();
