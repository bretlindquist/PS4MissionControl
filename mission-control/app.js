const DATA_VERSION = "20260222-1";
const AUTO_EXTRACT_SEEN_KEY = "ps4mc_auto_extract_seen_cusas_v1";
const AUTO_EXTRACT_MAX_PER_REFRESH = 3;
const SOURCES = {
  installed: `../GAMES_LIST.md?v=${DATA_VERSION}`,
  installedDlc: `../INSTALLED_DLC_LIST.md?v=${DATA_VERSION}`,
  updatesPending: `../UPDATES_PENDING_LIST.md?v=${DATA_VERSION}`,
  external: `../EXTERNAL_GAMES_LIST.md?v=${DATA_VERSION}`,
  externalUninstalled: `../EXTERNAL_UNINSTALLED_GAMES.md?v=${DATA_VERSION}`,
  dlc: `../EXTERNAL_DLC_LIST.md?v=${DATA_VERSION}`,
  themes: `../EXTERNAL_THEMES_LIST.md?v=${DATA_VERSION}`,
  nonGames: `../EXTERNAL_NON_GAMES_LIST.md?v=${DATA_VERSION}`,
  archiveReview: `../EXTERNAL_ARCHIVES_REVIEW.md?v=${DATA_VERSION}`,
};

const state = {
  data: {
    installed: [],
    installedDlc: [],
    updatesPending: [],
    externalGames: [],
    externalUninstalled: [],
    externalUninstalledManual: [],
    archives: [],
    dlc: [],
    themes: [],
    nonGames: [],
    archiveCleanup: [],
  },
  view: "external_uninstalled",
  sort: { key: null, asc: true },
  search: "",
  filters: new Set(),
  watch: [],
  ignore: [],
  hidden: [],
  apiEnabled: false,
  selectedRowKey: "",
  uninstalledCard: {
    search: "",
    sort: { key: null, asc: true },
    selectedRowKey: "",
  },
  extUninstalledCard: {
    selectedRowKey: "",
  },
  visualUninstalledCard: {
    selectedRowKey: "",
    menuRowKey: "",
    sortAsc: true,
  },
  ps4Status: {
    online: false,
    status: "offline",
    ip: "",
  },
  rpiStatus: {
    online: false,
    ip: "",
    port: 12800,
  },
  ftpConfig: {
    host: "",
    port: 2121,
  },
  ps4Storage: {
    available: false,
    internal: null,
    external: null,
  },
  thumbCache: {},
  localIcons: {},
  autoExtractSeen: new Set(),
  rpiTasks: [],
  sendJobs: [],
  rpiPollTimer: null,
};

const el = {
  kpiInstalled: document.getElementById("kpiInstalled"),
  kpiExternal: document.getElementById("kpiExternal"),
  kpiUninstalled: document.getElementById("kpiUninstalled"),
  kpiWatch: document.getElementById("kpiWatch"),
  kpiPs4Online: document.getElementById("kpiPs4Online"),
  kpiRpiOnline: document.getElementById("kpiRpiOnline"),
  headerFtpInfo: document.getElementById("headerFtpInfo"),
  kpiInternalFree: document.getElementById("kpiInternalFree"),
  kpiExternalFree: document.getElementById("kpiExternalFree"),
  chips: [...document.querySelectorAll("#viewChips .chip")],
  filterChips: [...document.querySelectorAll("#filterChips .chip")],
  clearFiltersChip: document.getElementById("clearFiltersChip"),
  mainTableLabel: document.getElementById("mainTableLabel"),
  mainThead: document.querySelector("#mainTable thead"),
  mainTbody: document.querySelector("#mainTable tbody"),
  extUninstalledSummary: document.getElementById("extUninstalledSummary"),
  extSendToPs4Btn: document.getElementById("extSendToPs4Btn"),
  extUninstalledThead: document.querySelector("#extUninstalledTable thead"),
  extUninstalledTbody: document.querySelector("#extUninstalledTable tbody"),
  visualUninstalledLabel: document.getElementById("visualUninstalledLabel"),
  visualUninstalledSummary: document.getElementById("visualUninstalledSummary"),
  visualSortBtn: document.getElementById("visualSortBtn"),
  visualUninstalledGrid: document.getElementById("visualUninstalledGrid"),
  visualDetailsBody: document.getElementById("visualDetailsBody"),
  visualSendToPs4Btn: document.getElementById("visualSendToPs4Btn"),
  uninstalledTableLabel: document.getElementById("uninstalledTableLabel"),
  uninstalledInlineFilter: document.getElementById("uninstalledInlineFilter"),
  sendToPs4Btn: document.getElementById("sendToPs4Btn"),
  uninstalledExportBtn: document.getElementById("uninstalledExportBtn"),
  uninstalledThead: document.querySelector("#uninstalledTable thead"),
  uninstalledTbody: document.querySelector("#uninstalledTable tbody"),
  rpiTasksLabel: document.getElementById("rpiTasksLabel"),
  rpiTasksThead: document.querySelector("#rpiTasksTable thead"),
  rpiTasksTbody: document.querySelector("#rpiTasksTable tbody"),
  refreshTasksBtn: document.getElementById("refreshTasksBtn"),
  clearTasksBtn: document.getElementById("clearTasksBtn"),
  inlineFilter: document.getElementById("inlineFilter"),
  exportBtn: document.getElementById("exportBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  refreshStorageBtn: document.getElementById("refreshStorageBtn"),
  watchForm: document.getElementById("watchForm"),
  watchItems: document.getElementById("watchItems"),
  clearWatchBtn: document.getElementById("clearWatchBtn"),
  clearIgnoreBtn: document.getElementById("clearIgnoreBtn"),
  clearHideBtn: document.getElementById("clearHideBtn"),
  listCounts: document.getElementById("listCounts"),
  inspector: document.getElementById("inspector"),
  inspectorBody: document.getElementById("inspectorBody"),
  closeInspector: document.getElementById("closeInspector"),
  settingsPanel: document.getElementById("settingsPanel"),
  settingsBtn: document.getElementById("settingsBtn"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  palette: document.getElementById("palette"),
  paletteInput: document.getElementById("paletteInput"),
  paletteList: document.getElementById("paletteList"),
  cmdBtn: document.getElementById("cmdBtn"),
  themeBtn: document.getElementById("themeBtn"),
  sources: document.getElementById("sources"),
};

init().catch((err) => {
  console.error(err);
  alert("Failed to load Mission Control data. Start server with: python3 ~/git/PS4/mission-control/server.py");
});

async function init() {
  loadAutoExtractSeen();
  await loadServerState();
  await loadMarkdownData();
  await loadThumbCache();
  await hydrateThumbsForExternalUninstalled();
  loadRpiTasks();
  await refreshSendJobs();
  bindEvents();
  renderSourceList();
  renderAll();
  renderPalette();
  startRpiPolling();
}

async function loadServerState() {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) throw new Error("no api");
    const payload = await res.json();
    state.watch = Array.isArray(payload.watch) ? payload.watch : [];
    state.ignore = Array.isArray(payload.ignore) ? payload.ignore : [];
    state.hidden = Array.isArray(payload.hide) ? payload.hide : [];
    state.localIcons = payload.localIcons && typeof payload.localIcons === "object" ? payload.localIcons : {};
    state.ftpConfig = payload.ftpConfig || state.ftpConfig;
    state.ps4Status = payload.ps4Status || state.ps4Status;
    state.rpiStatus = payload.rpiStatus || state.rpiStatus;
    state.ps4Storage = payload.ps4Storage || state.ps4Storage;
    state.apiEnabled = true;
  } catch {
    state.watch = JSON.parse(localStorage.getItem("ps4_watch_list") || "[]");
    state.ignore = JSON.parse(localStorage.getItem("ps4_ignore_list") || "[]");
    state.hidden = JSON.parse(localStorage.getItem("ps4_hidden_list") || "[]");
    state.apiEnabled = false;
  }
}

async function loadMarkdownData() {
  const [installedMd, installedDlcMd, updatesPendingMd, externalMd, externalUninstalledMd, dlcMd, themesMd, nonMd, archiveMd] = await Promise.all([
    fetchText(SOURCES.installed),
    fetchText(SOURCES.installedDlc, true),
    fetchText(SOURCES.updatesPending, true),
    fetchText(SOURCES.external),
    fetchText(SOURCES.externalUninstalled, true),
    fetchText(SOURCES.dlc, true),
    fetchText(SOURCES.themes, true),
    fetchText(SOURCES.nonGames, true),
    fetchText(SOURCES.archiveReview, true),
  ]);

  const installed = parseTablesBySection(installedMd)["root"] || [];
  const installedDlc = parseTablesBySection(installedDlcMd || "")["root"] || [];
  const updatesPending = parseTablesBySection(updatesPendingMd || "")["root"] || [];
  const externalTables = parseTablesBySection(externalMd);
  const externalUninstalledTables = parseTablesBySection(externalUninstalledMd || "");
  const dlcTables = parseTablesBySection(dlcMd || "");
  const themesTables = parseTablesBySection(themesMd || "");
  const nonTables = parseTablesBySection(nonMd || "");
  const archiveTables = parseTablesBySection(archiveMd || "");

  state.data.installed = installed;
  state.data.installedDlc = installedDlc;
  state.data.updatesPending = updatesPending;
  state.data.externalGames = enrichExternalRows(externalTables["Game PKGs"] || [], installed);
  state.data.externalUninstalled =
    externalUninstalledTables["Uninstalled Game Titles"] ||
    externalUninstalledTables["Uninstalled Game Titles (CUSA)"] ||
    [];
  state.data.externalUninstalledManual = externalUninstalledTables["Manual Review (No CUSA in Filename)"] || [];
  state.data.archives = externalTables["Game Archives (RAR/ZIP/7z/001)"] || [];
  state.data.dlc = dlcTables["DLC PKGs"] || [];
  state.data.themes = themesTables["Theme PKGs"] || [];
  state.data.nonGames = nonTables["Non-Game PKGs"] || [];
  state.data.archiveCleanup = archiveTables["Likely Safe To Delete (Already Extracted)"] || [];
}

async function loadThumbCache() {
  try {
    const res = await fetch(`../ps4-thumb-cache.json?v=${DATA_VERSION}`, { cache: "no-store" });
    if (!res.ok) throw new Error("thumb cache unavailable");
    const payload = await res.json();
    state.thumbCache = payload && typeof payload === "object" ? payload : {};
  } catch {
    state.thumbCache = {};
  }
}

async function hydrateThumbsForExternalUninstalled() {
  if (!state.apiEnabled) return;
  const ids = [...new Set((state.data.externalUninstalled || []).map((r) => String(r["Title ID"] || r.CUSA || "").toUpperCase().trim()))]
    .filter((id) => /^CUSA\d{5}$/.test(id));
  if (!ids.length) return;
  try {
    const res = await fetch("/api/thumb-cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return;
    const payload = await res.json();
    const items = payload.items && typeof payload.items === "object" ? payload.items : {};
    state.thumbCache = { ...state.thumbCache, ...items };
  } catch {
    // best-effort only
  }
}

function fetchText(url, allowFail = false) {
  return fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) {
      if (allowFail) return "";
      throw new Error(`Could not load ${url}`);
    }
    return r.text();
  });
}

function parseTablesBySection(md) {
  const out = {};
  const lines = md.split(/\r?\n/);
  let section = "root";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("## ")) section = line.replace(/^##\s+/, "").trim();
    if (line.startsWith("|") && (lines[i + 1] || "").trim().startsWith("|---")) {
      const headers = parseMdRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const vals = parseMdRow(lines[i]);
        if (vals.length === headers.length) {
          const row = {};
          headers.forEach((h, idx) => (row[h] = (vals[idx] || "").replace(/^`|`$/g, "")));
          rows.push(row);
        }
        i += 1;
      }
      out[section] = rows;
    }
  }
  return out;
}

function parseMdRow(line) {
  return line.split("|").slice(1, -1).map((x) => x.trim());
}

function enrichExternalRows(rows, installedRows) {
  const installedIds = new Set(installedRows.map((r) => (r["Title ID"] || "").toUpperCase()));
  const installedTitles = installedRows.map((r) => ({
    id: (r["Title ID"] || "").toUpperCase(),
    title: r.Title || "",
    norm: normalizeTitle(r.Title || ""),
  }));

  return rows.map((row) => {
    const cusa = (row.CUSA || "").toUpperCase();
    const rowNorm = normalizeTitle(row.Title || row.File || "");

    let check = "Unknown";
    let confidence = 25;
    let matched = "-";

    if (cusa && installedIds.has(cusa)) {
      check = "Verified Installed";
      confidence = 100;
      matched = cusa;
    } else {
      const hit = installedTitles.find((it) => isLikelySameGameTitle(it.norm, rowNorm));
      if (hit) {
        check = "Likely Installed (Title Match)";
        confidence = 76;
        matched = hit.id || "-";
      } else if (cusa) {
        check = "Not Installed (CUSA Mismatch)";
        confidence = 92;
        matched = "-";
      }
    }

    return {
      ...row,
      "Installed Check": check,
      Confidence: `${confidence}%`,
      "Matched Installed": matched,
    };
  });
}

function bindEvents() {
  el.chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.view = chip.dataset.view;
      el.chips.forEach((c) => c.classList.toggle("active", c === chip));
      renderMainTable();
    });
  });

  el.filterChips.forEach((chip) => {
    if (!chip.dataset.filter) return;
    chip.addEventListener("click", () => {
      const key = chip.dataset.filter;
      if (state.filters.has(key)) state.filters.delete(key);
      else state.filters.add(key);
      chip.classList.toggle("active", state.filters.has(key));
      renderMainTable();
    });
  });
  el.clearFiltersChip.addEventListener("click", () => {
    state.filters.clear();
    el.filterChips.forEach((c) => c.classList.remove("active"));
    renderMainTable();
  });

  const setSearch = (val) => {
    state.search = val.trim().toLowerCase();
    if (el.inlineFilter.value !== val) el.inlineFilter.value = val;
    renderMainTable();
  };
  el.inlineFilter.addEventListener("input", (e) => setSearch(e.target.value));
  el.uninstalledInlineFilter?.addEventListener("input", (e) => {
    state.uninstalledCard.search = (e.target.value || "").trim().toLowerCase();
    renderUninstalledCard();
  });

  el.watchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const item = {
      title: document.getElementById("watchTitle").value.trim(),
      cusa: document.getElementById("watchCusa").value.trim().toUpperCase(),
      note: document.getElementById("watchNote").value.trim(),
      addedAt: new Date().toISOString(),
    };
    if (!item.title) return;
    await listAdd("watch", item);
    el.watchForm.reset();
    renderWatchList();
    renderKpis();
  });

  el.clearWatchBtn.addEventListener("click", () => clearList("watch"));
  el.clearIgnoreBtn.addEventListener("click", () => clearList("ignore"));
  el.clearHideBtn.addEventListener("click", () => clearList("hidden"));
  el.exportBtn.addEventListener("click", exportCurrentView);
  el.uninstalledExportBtn?.addEventListener("click", exportUninstalledCard);
  el.sendToPs4Btn?.addEventListener("click", sendSelectedUninstalledToPs4);
  el.extSendToPs4Btn?.addEventListener("click", sendSelectedExtUninstalledToPs4);
  el.visualSendToPs4Btn?.addEventListener("click", sendSelectedVisualUninstalledToPs4);
  el.visualSortBtn?.addEventListener("click", () => {
    state.visualUninstalledCard.sortAsc = !state.visualUninstalledCard.sortAsc;
    renderVisualUninstalledCard();
  });
  el.refreshTasksBtn?.addEventListener("click", refreshRpiTasks);
  el.clearTasksBtn?.addEventListener("click", clearFinishedRpiTasks);
  el.refreshBtn.addEventListener("click", refreshData);
  el.refreshStorageBtn?.addEventListener("click", refreshStorageData);

  el.closeInspector.addEventListener("click", closeInspector);
  el.settingsBtn?.addEventListener("click", openSettings);
  el.closeSettingsBtn?.addEventListener("click", closeSettings);
  el.cmdBtn.addEventListener("click", openPalette);
  el.themeBtn.addEventListener("click", toggleTheme);

  const savedTheme = localStorage.getItem("ps4mc_theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
    if (e.key === "Escape") {
      closePalette();
      closeInspector();
      closeSettings();
    }
  });

  el.palette.addEventListener("click", (e) => {
    if (e.target === el.palette) closePalette();
  });
  el.paletteInput.addEventListener("input", renderPalette);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".visual-menu")) {
      if (state.visualUninstalledCard.menuRowKey) {
        state.visualUninstalledCard.menuRowKey = "";
        renderVisualUninstalledCard();
      }
    }
  });
}

function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem("ps4mc_theme", next);
}

async function refreshData() {
  setButtonBusy(el.refreshBtn, true);
  try {
    if (state.apiEnabled) {
      const res = await fetch("/api/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await res.json();
      if (!payload.ok) throw new Error(payload.stderr || "refresh failed");
    }
    await loadMarkdownData();
    await loadThumbCache();
    await hydrateThumbsForExternalUninstalled();
    const auto = await autoExtractMissingIcons();
    renderAll();
    if (auto.extracted > 0) {
      alert(`Data refreshed. Auto-extracted ${auto.extracted} new icon(s).`);
    } else {
      alert("Data refreshed.");
    }
  } catch (err) {
    alert(`Refresh failed: ${err.message}`);
  } finally {
    setButtonBusy(el.refreshBtn, false);
  }
}

function loadAutoExtractSeen() {
  try {
    const raw = localStorage.getItem(AUTO_EXTRACT_SEEN_KEY);
    const arr = JSON.parse(raw || "[]");
    state.autoExtractSeen = new Set(Array.isArray(arr) ? arr.map((x) => String(x).toUpperCase()) : []);
  } catch {
    state.autoExtractSeen = new Set();
  }
}

function saveAutoExtractSeen() {
  try {
    const arr = [...state.autoExtractSeen].slice(-3000);
    localStorage.setItem(AUTO_EXTRACT_SEEN_KEY, JSON.stringify(arr));
  } catch {
    // ignore local storage failures
  }
}

async function refreshStorageData() {
  if (!state.apiEnabled) {
    alert("Storage refresh requires API mode (start mission-control/server.py).");
    return;
  }
  setButtonBusy(el.refreshStorageBtn, true);
  try {
    const res = await fetch("/api/refresh-storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload?.send?.error || payload?.snapshot?.stderr || "storage refresh failed");
    await loadServerState();
    renderKpis();
    alert("Storage refreshed.");
  } catch (err) {
    alert(`Storage refresh failed: ${err.message}`);
  } finally {
    setButtonBusy(el.refreshStorageBtn, false);
  }
}

function renderAll() {
  renderWatchList();
  renderKpis();
  renderUninstalledCard();
  renderVisualUninstalledCard();
  renderRpiTasks();
  renderMainTable();
}

function uninstalledCardRows() {
  let rows = [...getUninstalledRows()];
  if (state.uninstalledCard.search) {
    rows = rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(state.uninstalledCard.search));
  }
  const sort = state.uninstalledCard.sort;
  if (sort.key) {
    rows.sort((a, b) => {
      const key = sort.key;
      const rawA = a[key];
      const rawB = b[key];
      if (isNumericCol(key)) {
        const numA = parseFloat(String(rawA ?? "").replace(/[^\d.-]/g, ""));
        const numB = parseFloat(String(rawB ?? "").replace(/[^\d.-]/g, ""));
        const av = Number.isFinite(numA) ? numA : Number.NEGATIVE_INFINITY;
        const bv = Number.isFinite(numB) ? numB : Number.NEGATIVE_INFINITY;
        if (av < bv) return sort.asc ? -1 : 1;
        if (av > bv) return sort.asc ? 1 : -1;
        return 0;
      }
      const av = `${rawA ?? ""}`.toLowerCase();
      const bv = `${rawB ?? ""}`.toLowerCase();
      if (av < bv) return sort.asc ? -1 : 1;
      if (av > bv) return sort.asc ? 1 : -1;
      return 0;
    });
  }
  return rows;
}

function currentDatasetRaw() {
  if (state.view === "installed") return state.data.installed;
  if (state.view === "installed_dlc") return state.data.installedDlc;
  if (state.view === "updates_pending") return state.data.updatesPending;
  if (state.view === "external_uninstalled") {
    return state.data.externalUninstalled.filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  }
  if (state.view === "external") return state.data.externalGames;
  if (state.view === "dlc") return state.data.dlc;
  if (state.view === "themes") return state.data.themes;
  if (state.view === "archives") return state.data.archives;
  if (state.view === "cleanup") return state.data.archiveCleanup;
  if (state.view === "nongames") return state.data.nonGames;
  return getUninstalledRows();
}

function getUninstalledRows() {
  return state.data.externalGames.filter((r) => {
    if (r["Installed Check"] === "Verified Installed") return false;
    if (matchesIgnore(r)) return false;
    if (matchesHidden(r)) return false;
    return true;
  });
}

function applyFilters(rows) {
  return rows.filter((row) => {
    if (matchesHidden(row)) return false;
    const text = [
      row.File || "",
      row.Archive || "",
      row.Title || "",
      row["DLC Title"] || "",
      row["Title ID"] || "",
      row.CUSA || "",
    ].join(" ").toLowerCase();
    const status = (row.Status || "").toLowerCase();
    const hasSizeField = Object.prototype.hasOwnProperty.call(row, "Size (GB)");
    const sizeGb = parseFloat(String(row["Size (GB)"] || "0")) || 0;

    if (state.filters.has("baseOnly")) {
      if (/update|patch|backport|optionalfix/.test(text)) return false;
      if (/-a01\d{2}-/.test(text) && !/-a0100-/.test(text)) return false;
    }
    if (state.filters.has("needsExtraction")) {
      if ("Status" in row) {
        if (!status.includes("needs")) return false;
      }
    }
    if (state.filters.has("installedMismatch")) {
      const c = row["Installed Check"] || "";
      if (!(c.includes("Mismatch") || c.includes("Likely Installed"))) return false;
    }
    if (state.filters.has("vr") && !isVrRow(row, text)) return false;
    if (state.filters.has("hugeOnly")) {
      if (hasSizeField && sizeGb <= 20) return false;
    }
    return true;
  });
}

function currentDataset() {
  let rows = [...currentDatasetRaw()];
  if (state.search) {
    rows = rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(state.search));
  }
  rows = applyFilters(rows);

  if (state.sort.key) {
    rows.sort((a, b) => {
      const key = state.sort.key;
      const rawA = a[key];
      const rawB = b[key];

      if (isNumericCol(key)) {
        const numA = parseFloat(String(rawA ?? "").replace(/[^\d.-]/g, ""));
        const numB = parseFloat(String(rawB ?? "").replace(/[^\d.-]/g, ""));
        const av = Number.isFinite(numA) ? numA : Number.NEGATIVE_INFINITY;
        const bv = Number.isFinite(numB) ? numB : Number.NEGATIVE_INFINITY;
        if (av < bv) return state.sort.asc ? -1 : 1;
        if (av > bv) return state.sort.asc ? 1 : -1;
        return 0;
      }

      const av = `${rawA ?? ""}`.toLowerCase();
      const bv = `${rawB ?? ""}`.toLowerCase();
      if (av < bv) return state.sort.asc ? -1 : 1;
      if (av > bv) return state.sort.asc ? 1 : -1;
      return 0;
    });
  }
  return rows;
}

function currentLabel() {
  return {
    uninstalled: "Uninstalled Games",
    external_uninstalled: "Drive Scan Uninstalled Games",
    installed: "Installed on PS4",
    installed_dlc: "Installed DLC on PS4",
    updates_pending: "Updates Pending",
    external: "External Game PKGs",
    dlc: "DLC PKGs",
    themes: "Themes",
    archives: "Game Archives",
    cleanup: "Archives Likely Safe To Delete",
    nongames: "Non-Game PKGs",
  }[state.view];
}

function renderKpis() {
  el.kpiInstalled.textContent = state.data.installed.length.toLocaleString();
  el.kpiExternal.textContent = state.data.externalGames.length.toLocaleString();
  el.kpiUninstalled.textContent = getUninstalledRows().length.toLocaleString();
  el.kpiWatch.textContent = state.watch.length.toLocaleString();
  if (el.kpiPs4Online) {
    const online = !!state.ps4Status?.online;
    el.kpiPs4Online.textContent = online ? "Online" : "Offline";
    el.kpiPs4Online.classList.toggle("online", online);
    el.kpiPs4Online.classList.toggle("offline", !online);
    const ip = state.ps4Status?.ip ? ` (${state.ps4Status.ip})` : "";
    el.kpiPs4Online.title = `GoldHEN status${ip}`;
  }
  if (el.headerFtpInfo) {
    const host = String(state.ftpConfig?.host || state.ps4Status?.ip || "").trim();
    const port = Number(state.ftpConfig?.port) || 2121;
    el.headerFtpInfo.textContent = host ? `FTP ${host}:${port}` : `FTP :${port}`;
  }
  if (el.kpiRpiOnline) {
    const online = !!state.rpiStatus?.online;
    const port = Number(state.rpiStatus?.port) || 12800;
    el.kpiRpiOnline.textContent = online ? "Online" : "Offline";
    el.kpiRpiOnline.classList.toggle("online", online);
    el.kpiRpiOnline.classList.toggle("offline", !online);
    const ip = state.rpiStatus?.ip ? ` (${state.rpiStatus.ip}:${port})` : "";
    const err = state.rpiStatus?.error ? `\n${state.rpiStatus.error}` : "";
    el.kpiRpiOnline.title = `RPI endpoint${ip}${err}`;
  }
  const internalFree = formatStorageFree(state.ps4Storage?.internal);
  const externalFree = formatStorageFree(state.ps4Storage?.external);
  if (el.kpiInternalFree) {
    el.kpiInternalFree.textContent = internalFree;
    el.kpiInternalFree.title = "Source: latest FTP snapshot /data/ps4-storage.json";
  }
  if (el.kpiExternalFree) {
    el.kpiExternalFree.textContent = externalFree;
    el.kpiExternalFree.title = "Source: latest FTP snapshot /data/ps4-storage.json";
  }
}

function formatStorageFree(node) {
  if (!node || typeof node !== "object") return "--";
  const free = Number(node.free_bytes);
  const total = Number(node.total_bytes);
  if (!Number.isFinite(free) || free < 0 || !Number.isFinite(total) || total <= 0) return "--";
  const gb = free / 1073741824;
  const pct = (free / total) * 100;
  const gbText = gb >= 100 ? `${Math.round(gb)} GB` : gb >= 10 ? `${gb.toFixed(1)} GB` : `${gb.toFixed(2)} GB`;
  return `${gbText} (${pct.toFixed(1)}%)`;
}

function renderExternalUninstalledCard() {
  const allRows = state.data.externalUninstalled || [];
  const rows = allRows.filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  const manualCount = (state.data.externalUninstalledManual || []).length;
  el.extUninstalledSummary.textContent = `${rows.length} not installed · ${allRows.length} candidates · ${manualCount} manual-review`;
  updateExtSendToPs4Button(rows);

  if (!rows.length) {
    el.extUninstalledThead.innerHTML = "";
    el.extUninstalledTbody.innerHTML = `<tr><td>No rows yet. Run refresh first.</td></tr>`;
    return;
  }

  const cols = ["Title", "Drive(s)", "Package Types Found", "Files Found", "Installed"];
  el.extUninstalledThead.innerHTML = `<tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  el.extUninstalledTbody.innerHTML = rows
    .slice(0, 12)
    .map((r, idx) => {
      const rowKey = makeRule(r).key || String(idx);
      const selectedClass = state.extUninstalledCard.selectedRowKey === rowKey ? "row-selected" : "";
      return `<tr class="row-clickable ${selectedClass}" data-idx="${idx}" data-key="${escapeHtml(rowKey)}">${cols
        .map((c) => `<td class="${isNumericCol(c) ? "cell-num" : ""}">${escapeHtml(r[c] || "")}</td>`)
        .join("")}</tr>`;
    })
    .join("");
  el.extUninstalledTbody.querySelectorAll("tr.row-clickable").forEach((tr) => {
    tr.addEventListener("click", async () => {
      const row = rows[Number(tr.dataset.idx)];
      state.extUninstalledCard.selectedRowKey = tr.dataset.key || "";
      const id = extractRowId(row);
      if (id) {
        try {
          await navigator.clipboard?.writeText(id);
        } catch {}
      }
      renderExternalUninstalledCard();
    });
    tr.addEventListener("dblclick", async () => {
      const row = rows[Number(tr.dataset.idx)];
      await openRowInFinder(row);
    });
  });
}

function getSelectedExtUninstalledRow(rows) {
  const data = rows || (state.data.externalUninstalled || []).filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  const key = state.extUninstalledCard.selectedRowKey;
  if (!key) return null;
  return data.find((r, idx) => (makeRule(r).key || String(idx)) === key) || null;
}

function updateExtSendToPs4Button(rows) {
  if (!el.extSendToPs4Btn) return;
  const selected = getSelectedExtUninstalledRow(rows);
  const path = selected ? extractRowPath(selected) : "";
  const ready = !!path && path.toLowerCase().endsWith(".pkg");
  el.extSendToPs4Btn.disabled = !ready;
  el.extSendToPs4Btn.title = ready ? `Send ${path}` : "Select a drive-scan uninstalled .pkg row first";
}

function getSelectedVisualUninstalledRow(rows) {
  const data = rows || (state.data.externalUninstalled || []).filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  const key = state.visualUninstalledCard.selectedRowKey;
  if (!key) return null;
  return data.find((r, idx) => (makeRule(r).key || String(idx)) === key) || null;
}

function updateVisualSendToPs4Button(rows) {
  if (!el.visualSendToPs4Btn) return;
  const selected = getSelectedVisualUninstalledRow(rows);
  const path = selected ? extractRowPath(selected) : "";
  const ready = !!path && path.toLowerCase().endsWith(".pkg");
  el.visualSendToPs4Btn.disabled = !ready;
  el.visualSendToPs4Btn.title = ready ? `Send ${path}` : "Select a visual tile with a .pkg first";
}

function thumbForRow(row) {
  const cusa = String(row.CUSA || row["Title ID"] || "").toUpperCase().trim();
  if (!cusa) return { primary: "", secondary: "" };
  const localMapped = state.localIcons?.[cusa];
  const localDirect = state.apiEnabled ? `/ftp-sync/latest/icons/${cusa}.png` : "";
  const item = state.thumbCache?.[cusa];
  const url = item && typeof item === "object" ? item.icon : "";
  let tmdb = "";
  if (url && typeof url === "string") {
    tmdb = url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
  }
  const primary = localMapped && typeof localMapped === "string" ? localMapped : localDirect;
  const secondary = tmdb || "";
  return { primary, secondary };
}

function hasThumbForRow(row) {
  const t = thumbForRow(row);
  return !!(t.primary || t.secondary);
}

function inferPackageType(file, path) {
  const s = `${file || ""} ${path || ""}`.toLowerCase();
  if (/(theme|dynamic[_\s-]?theme)/.test(s)) return "theme";
  if (/(dlc|addon|add[-\s]?on|ulc|season\s*pass|expansion|costume|pack)/.test(s)) return "dlc";
  if (/(backport|cyb1k|fix(?:ed)?)/.test(s)) return "backport";
  if (/(\[upd\]|_upd_|\.upd\.|\bupdate\b|patch|v\d+\.\d+)/.test(s)) return "update";
  if (/(\[base\]|fullgame|\bgame\b|a0100-v0100)/.test(s)) return "base";
  return "unknown";
}

function extractVersionHints(file, path) {
  const s = `${file || ""} ${path || ""}`;
  const out = [];
  const m1 = s.match(/v\d+(?:\.\d+){0,2}/gi) || [];
  const m2 = s.match(/\[\s*v?\d+(?:\.\d+){0,2}\s*\]/gi) || [];
  const m3 = s.match(/a\d{4}-v\d{4}/gi) || [];
  [...m1, ...m2, ...m3].forEach((x) => out.push(String(x).replace(/[\[\]\s]+/g, "")));
  return [...new Set(out)].slice(0, 6);
}

function visualPackagesForRow(row) {
  const cusa = String(row.CUSA || row["Title ID"] || "").toUpperCase().trim();
  const titleNorm = normalizeTitle(row.Title || row.File || "");
  const all = [
    ...(state.data.externalGames || []).map((r) => ({ ...r, __src: "game" })),
    ...(state.data.nonGames || []).map((r) => ({ ...r, __src: "non_game" })),
    ...(state.data.dlc || []).map((r) => ({ ...r, __src: "dlc" })),
    ...(state.data.themes || []).map((r) => ({ ...r, __src: "theme" })),
  ];
  let matches = [];
  if (cusa) matches = all.filter((r) => String(r.CUSA || "").toUpperCase().trim() === cusa);
  if (!matches.length && titleNorm) {
    matches = all.filter((r) => isLikelySameGameTitle(normalizeTitle(r.Title || r.File || ""), titleNorm));
  }
  const dedup = new Map();
  matches.forEach((r) => {
    const key = String(r.Path || r.File || "").trim().toLowerCase();
    if (!key) return;
    if (!dedup.has(key)) dedup.set(key, r);
  });
  return [...dedup.values()].map((r) => {
    const file = String(r.File || "");
    const path = String(r.Path || "");
    const sizeNum = parseFloat(String(r["Size (GB)"] || "").replace(/[^\d.-]/g, ""));
    const sizeGb = Number.isFinite(sizeNum) ? sizeNum : 0;
    const hints = extractVersionHints(file, path);
    return {
      drive: String(r.Drive || ""),
      file,
      path,
      cusa: String(r.CUSA || ""),
      sizeGb,
      type: inferPackageType(file, path),
      versionHint: hints.join(", ") || "-",
      source: String(r.__src || "unknown"),
    };
  });
}

function buildVisualDetailsHtml(row) {
  const packages = visualPackagesForRow(row);
  const drives = String(row["Drive(s)"] || row.Drive || "-");
  const examplePath = String(row["Example Path"] || row.Path || "-");
  const title = String(row.Title || row.File || "Unknown");
  const typeSummary = String(row["Package Types Found"] || "-");
  const biggest = packages.length ? Math.max(...packages.map((p) => Number(p.sizeGb) || 0)) : 0;
  const hints = [...new Set(packages.flatMap((p) => (p.versionHint && p.versionHint !== "-" ? p.versionHint.split(", ").map((x) => x.trim()) : [])))];
  const hintsText = hints.length ? hints.slice(0, 8).join(", ") : "-";
  const hasGameSource = packages.some((p) => p.source === "game");
  const hasNonGameSource = packages.some((p) => p.source === "non_game");
  const classState = hasGameSource ? "game-labeled" : (hasNonGameSource ? "? (non-game-labeled)" : "?");
  const sortedPkgs = [...packages].sort((a, b) => (b.sizeGb - a.sizeGb) || a.file.localeCompare(b.file));
  const pkgRows = sortedPkgs.length
    ? sortedPkgs.map((p) => `<tr>
        <td>${escapeHtml(p.type)}</td>
        <td class="cell-num">${Number(p.sizeGb).toFixed(2)}</td>
        <td title="${escapeHtml(p.file)}">${escapeHtml(p.file)}</td>
        <td>${escapeHtml(p.drive || "-")}</td>
        <td>${escapeHtml(p.versionHint)}</td>
      </tr>`).join("")
    : `<tr><td colspan="5">No package rows found for this title in external scan.</td></tr>`;
  return `<div class="visual-details">
    <div class="visual-details-grid">
      <div><span>Title</span><strong>${escapeHtml(title)}</strong></div>
      <div><span>Drive</span><strong>${escapeHtml(drives)}</strong></div>
      <div><span>Path</span><code title="${escapeHtml(examplePath)}">${escapeHtml(examplePath)}</code></div>
      <div><span>Size (GB)</span><strong>${biggest > 0 ? biggest.toFixed(2) : "-"}</strong></div>
      <div><span>Classification</span><strong>${escapeHtml(classState)}</strong></div>
      <div><span>Pkg Type Guess</span><strong>${escapeHtml(typeSummary)}</strong></div>
      <div><span>Version Hint(s)</span><strong>${escapeHtml(hintsText)}</strong></div>
    </div>
    <div class="visual-package-list">
      <p class="visual-package-title">Packages (${sortedPkgs.length})</p>
      <div class="visual-package-wrap">
        <table>
          <thead><tr><th>Type</th><th>Size (GB)</th><th>File</th><th>Drive</th><th>Version</th></tr></thead>
          <tbody>${pkgRows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function renderVisualDetailsPanel(row) {
  if (!el.visualDetailsBody) return;
  if (!row) {
    el.visualDetailsBody.innerHTML = `<div class="visual-empty">Select a tile to view details.</div>`;
    return;
  }
  el.visualDetailsBody.innerHTML = buildVisualDetailsHtml(row);
}

async function autoExtractMissingIcons() {
  if (!state.apiEnabled) return { extracted: 0, attempted: 0 };
  const rows = (state.data.externalUninstalled || []).filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  const queued = [];
  const seenThisRun = new Set();

  for (const row of rows) {
    const cusa = String(row.CUSA || row["Title ID"] || "").toUpperCase().trim();
    const path = extractRowPath(row);
    if (!/^CUSA\d{5}$/.test(cusa)) continue;
    if (!path || !path.toLowerCase().endsWith(".pkg")) continue;
    if (hasThumbForRow(row)) continue;
    if (state.autoExtractSeen.has(cusa)) continue;
    if (seenThisRun.has(cusa)) continue;
    seenThisRun.add(cusa);
    queued.push({ cusa, path });
    if (queued.length >= AUTO_EXTRACT_MAX_PER_REFRESH) break;
  }

  if (!queued.length) return { extracted: 0, attempted: 0 };

  let extracted = 0;
  for (const item of queued) {
    try {
      const res = await fetch("/api/extract-icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: item.path, cusa: item.cusa }),
      });
      const payload = await res.json();
      if (payload.ok && payload.cusa && payload.iconPath) {
        state.localIcons[payload.cusa] = payload.iconPath;
        extracted += 1;
      }
    } catch {
      // best-effort
    } finally {
      state.autoExtractSeen.add(item.cusa);
    }
  }
  saveAutoExtractSeen();
  return { extracted, attempted: queued.length };
}

function renderVisualUninstalledCard() {
  const rows = (state.data.externalUninstalled || [])
    .filter((r) => (r.Installed || "").toLowerCase() !== "installed")
    .sort((a, b) => {
      const at = String(a.Title || a.File || a.CUSA || a["Title ID"] || "").toLowerCase();
      const bt = String(b.Title || b.File || b.CUSA || b["Title ID"] || "").toLowerCase();
      if (at < bt) return state.visualUninstalledCard.sortAsc ? -1 : 1;
      if (at > bt) return state.visualUninstalledCard.sortAsc ? 1 : -1;
      return 0;
    });
  if (el.visualUninstalledLabel) el.visualUninstalledLabel.textContent = `Drive Scan Uninstalled (Visual) (${rows.length})`;
  if (el.visualUninstalledSummary) el.visualUninstalledSummary.textContent = `${rows.length} candidates`;
  if (el.visualSortBtn) {
    el.visualSortBtn.textContent = state.visualUninstalledCard.sortAsc ? "A-Z" : "Z-A";
    el.visualSortBtn.title = `Toggle visual tile sort (${state.visualUninstalledCard.sortAsc ? "A-Z" : "Z-A"})`;
  }
  updateVisualSendToPs4Button(rows);
  if (!el.visualUninstalledGrid) return;
  if (!rows.length) {
    el.visualUninstalledGrid.innerHTML = `<div class="visual-empty">No rows yet. Run refresh first.</div>`;
    renderVisualDetailsPanel(null);
    return;
  }
  el.visualUninstalledGrid.innerHTML = rows
    .slice(0, 120)
    .map((row, idx) => {
      const key = makeRule(row).key || String(idx);
      const selectedClass = state.visualUninstalledCard.selectedRowKey === key ? "selected" : "";
      const menuOpenClass = state.visualUninstalledCard.menuRowKey === key ? "menu-open" : "";
      const title = row.Title || row.File || "Unknown";
      const cusa = row.CUSA || row["Title ID"] || "-";
      const thumb = thumbForRow(row);
      const subtitle = (row["Drive(s)"] || row.Drive || "").trim();
      const hasThumbCandidate = !!(thumb.primary || thumb.secondary);
      const thumbHtml = hasThumbCandidate
        ? `<img src="${escapeHtml(thumb.primary || thumb.secondary)}" data-fallback="${escapeHtml(thumb.secondary || "")}" alt="${escapeHtml(title)}" loading="lazy" draggable="false" onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.onerror=null;this.style.display='none';this.parentElement.querySelector('.visual-thumb-fallback').style.display='flex';}" /><div class="visual-thumb-fallback" style="display:none">${escapeHtml(cusa)}</div>`
        : `<div class="visual-thumb-fallback">${escapeHtml(cusa)}</div>`;
      const menuHtml = !hasThumbCandidate
        ? `<div class="visual-menu">
            <button class="visual-menu-btn" type="button" data-action="toggle-extract-menu">⋯</button>
            <div class="visual-menu-popover ${menuOpenClass}" data-menu-for="${escapeHtml(key)}">
              <button type="button" data-action="extract-icon">Extract image</button>
            </div>
          </div>`
        : "";
      return `<button class="visual-tile ${selectedClass}" type="button" data-idx="${idx}" data-key="${escapeHtml(key)}" title="${escapeHtml(title)}">
        ${menuHtml}
        <div class="visual-thumb">${thumbHtml}</div>
        <div class="visual-meta">
          <div class="visual-title">${escapeHtml(title)}</div>
          <div class="visual-sub">${escapeHtml(cusa)}${subtitle ? ` · ${escapeHtml(subtitle)}` : ""}</div>
        </div>
      </button>`;
    })
    .join("");

  const selectedRow = getSelectedVisualUninstalledRow(rows);
  renderVisualDetailsPanel(selectedRow);

  el.visualUninstalledGrid.querySelectorAll(".visual-tile").forEach((tile) => {
    tile.addEventListener("click", async () => {
      if (tile.dataset.menuClick === "1") {
        tile.dataset.menuClick = "0";
        return;
      }
      const row = rows[Number(tile.dataset.idx)];
      const nextKey = tile.dataset.key || "";
      state.visualUninstalledCard.selectedRowKey = nextKey;
      el.visualUninstalledGrid.querySelectorAll(".visual-tile.selected").forEach((t) => t.classList.remove("selected"));
      tile.classList.add("selected");
      updateVisualSendToPs4Button(rows);
      renderVisualDetailsPanel(row);
      const id = extractRowId(row);
      if (id) {
        try {
          await navigator.clipboard?.writeText(id);
        } catch {}
      }
    });
    tile.addEventListener("dblclick", async () => {
      const row = rows[Number(tile.dataset.idx)];
      await openRowInFinder(row);
    });
  });

  el.visualUninstalledGrid.querySelectorAll("[data-action='toggle-extract-menu']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tile = e.currentTarget.closest(".visual-tile");
      if (!tile) return;
      tile.dataset.menuClick = "1";
      const rowKey = tile.dataset.key || "";
      state.visualUninstalledCard.menuRowKey = state.visualUninstalledCard.menuRowKey === rowKey ? "" : rowKey;
      renderVisualUninstalledCard();
    });
  });

  el.visualUninstalledGrid.querySelectorAll("[data-action='extract-icon']").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tile = e.currentTarget.closest(".visual-tile");
      if (!tile) return;
      tile.dataset.menuClick = "1";
      const row = rows[Number(tile.dataset.idx)];
      await extractIconForVisualRow(row);
      state.visualUninstalledCard.menuRowKey = "";
      renderVisualUninstalledCard();
    });
  });
}

async function extractIconForVisualRow(row) {
  const path = extractRowPath(row);
  const cusa = String(row.CUSA || row["Title ID"] || "").toUpperCase().trim();
  if (!path || !path.toLowerCase().endsWith(".pkg")) {
    alert("This row has no valid .pkg path to extract icon from.");
    return;
  }
  if (!state.apiEnabled) {
    alert("Icon extraction requires API mode (start mission-control/server.py).");
    return;
  }
  try {
    const res = await fetch("/api/extract-icon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, cusa }),
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || payload.stderr || "extract failed");
    if (payload.cusa && payload.iconPath) {
      state.localIcons[payload.cusa] = payload.iconPath;
    }
    alert(`Icon extracted for ${payload.cusa || cusa}.`);
  } catch (err) {
    alert(`Extract image failed: ${err.message}`);
  }
}

function renderUninstalledCard() {
  const rows = uninstalledCardRows();
  updateSendToPs4Button(rows);
  if (el.uninstalledTableLabel) el.uninstalledTableLabel.textContent = `Uninstalled Games (${rows.length})`;
  if (!rows.length) {
    if (el.uninstalledThead) el.uninstalledThead.innerHTML = "";
    if (el.uninstalledTbody) el.uninstalledTbody.innerHTML = `<tr><td>No rows for this view.</td></tr>`;
    return;
  }

  const keys = Object.keys(rows[0]);
  el.uninstalledThead.innerHTML = `<tr>${keys
    .map((k) => `<th data-key="${escapeHtml(k)}">${escapeHtml(k)} ${sortIndicatorFor(state.uninstalledCard.sort, k)}</th>`)
    .join("")}</tr>`;
  el.uninstalledThead.querySelectorAll("th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (state.uninstalledCard.sort.key === key) state.uninstalledCard.sort.asc = !state.uninstalledCard.sort.asc;
      else {
        state.uninstalledCard.sort.key = key;
        state.uninstalledCard.sort.asc = true;
      }
      renderUninstalledCard();
    });
  });

  el.uninstalledTbody.innerHTML = rows
    .map((row, idx) => {
      const rowKey = makeRule(row).key || String(idx);
      const cells = keys.map((k) => `<td class="${isNumericCol(k) ? "cell-num" : ""}">${renderCell(k, row[k])}</td>`).join("");
      const selectedClass = state.uninstalledCard.selectedRowKey === rowKey ? "row-selected" : "";
      return `<tr class="row-clickable ${selectedClass}" data-idx="${idx}" data-key="${escapeHtml(rowKey)}">${cells}</tr>`;
    })
    .join("");
  el.uninstalledTbody.querySelectorAll("tr.row-clickable").forEach((tr) => {
    tr.addEventListener("click", async () => {
      const row = rows[Number(tr.dataset.idx)];
      state.uninstalledCard.selectedRowKey = tr.dataset.key || "";
      const id = extractRowId(row);
      if (id) {
        try {
          await navigator.clipboard?.writeText(id);
        } catch {}
      }
      renderUninstalledCard();
    });
    tr.addEventListener("dblclick", async () => {
      const row = rows[Number(tr.dataset.idx)];
      await openRowInFinder(row);
    });
  });
}

function updateSendToPs4Button(rows) {
  if (!el.sendToPs4Btn) return;
  const selected = getSelectedUninstalledRow(rows || uninstalledCardRows());
  const path = selected ? extractRowPath(selected) : "";
  const ready = !!path && path.toLowerCase().endsWith(".pkg");
  el.sendToPs4Btn.disabled = !ready;
  el.sendToPs4Btn.title = ready ? `Send ${path}` : "Select an uninstalled .pkg row first";
}

function getSelectedUninstalledRow(rows) {
  const data = rows || uninstalledCardRows();
  const key = state.uninstalledCard.selectedRowKey;
  if (!key) return null;
  return data.find((r, idx) => (makeRule(r).key || String(idx)) === key) || null;
}

async function sendSelectedUninstalledToPs4() {
  const rows = uninstalledCardRows();
  const row = getSelectedUninstalledRow(rows);
  if (!row) {
    alert("Select a row in Uninstalled Games first.");
    return;
  }
  const path = extractRowPath(row);
  if (!path || !path.toLowerCase().endsWith(".pkg")) {
    alert("Selected row is not a .pkg file path.");
    return;
  }
  if (!state.apiEnabled) {
    alert("Send to PS4 requires API mode (start mission-control/server.py).");
    return;
  }
  const btn = el.sendToPs4Btn;
  const prev = btn?.textContent || "Send to PS4";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending...";
  }
  try {
    const res = await fetch("/api/send-to-ps4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || payload.body || "send failed");
    if (payload.queued) {
      await refreshSendJobs();
      alert(`Queued sender job ${payload.jobId} for PS4.`);
      return;
    }
    const taskId = Number(payload.taskId || 0);
    if (taskId > 0) {
      trackRpiTask({
        taskId,
        title: row.Title || row.File || "Unknown",
        cusa: row.CUSA || "",
        path,
        state: "queued",
        progressPct: 0,
        bytesTotal: Number(payload.bytes || 0),
        bytesDone: 0,
        lastMessage: "Queued on PS4",
      });
      await refreshRpiTasks();
    }
    const bodyInfo = payload.body ? `\n${payload.body}` : "";
    alert(`Sent to PS4 (${payload.bytes || 0} bytes).${bodyInfo}`);
  } catch (err) {
    alert(`Send to PS4 failed: ${err.message}`);
  } finally {
    if (btn) {
      btn.textContent = prev;
      updateSendToPs4Button(rows);
    }
  }
}

async function sendSelectedExtUninstalledToPs4() {
  const rows = (state.data.externalUninstalled || []).filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  const row = getSelectedExtUninstalledRow(rows);
  if (!row) {
    alert("Select a row in Drive Scan Uninstalled first.");
    return;
  }
  const path = extractRowPath(row);
  if (!path || !path.toLowerCase().endsWith(".pkg")) {
    alert("Selected row is not a .pkg file path.");
    return;
  }
  if (!state.apiEnabled) {
    alert("Send to PS4 requires API mode (start mission-control/server.py).");
    return;
  }
  const btn = el.extSendToPs4Btn;
  const prev = btn?.textContent || "Send to PS4";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending...";
  }
  try {
    const res = await fetch("/api/send-to-ps4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || payload.body || "send failed");
    if (payload.queued) {
      await refreshSendJobs();
      alert(`Queued sender job ${payload.jobId} for PS4.`);
      return;
    }
    const taskId = Number(payload.taskId || 0);
    if (taskId > 0) {
      trackRpiTask({
        taskId,
        title: row.Title || row.File || "Unknown",
        cusa: row.CUSA || "",
        path,
        state: "queued",
        progressPct: 0,
        bytesTotal: Number(payload.bytes || 0),
        bytesDone: 0,
        lastMessage: "Queued on PS4",
      });
      await refreshRpiTasks();
    }
    const bodyInfo = payload.body ? `\n${payload.body}` : "";
    alert(`Sent to PS4 (${payload.bytes || 0} bytes).${bodyInfo}`);
  } catch (err) {
    alert(`Send to PS4 failed: ${err.message}`);
  } finally {
    if (btn) {
      btn.textContent = prev;
      updateExtSendToPs4Button(rows);
    }
  }
}

async function sendSelectedVisualUninstalledToPs4() {
  const rows = (state.data.externalUninstalled || []).filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  const row = getSelectedVisualUninstalledRow(rows);
  if (!row) {
    alert("Select a tile in Drive Scan Uninstalled (Visual) first.");
    return;
  }
  const path = extractRowPath(row);
  if (!path || !path.toLowerCase().endsWith(".pkg")) {
    alert("Selected tile is not a .pkg file path.");
    return;
  }
  if (!state.apiEnabled) {
    alert("Send to PS4 requires API mode (start mission-control/server.py).");
    return;
  }
  const btn = el.visualSendToPs4Btn;
  const prev = btn?.textContent || "Send to PS4";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending...";
  }
  try {
    const res = await fetch("/api/send-to-ps4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || payload.body || "send failed");
    if (payload.queued) {
      await refreshSendJobs();
      alert(`Queued sender job ${payload.jobId} for PS4.`);
      return;
    }
    const taskId = Number(payload.taskId || 0);
    if (taskId > 0) {
      trackRpiTask({
        taskId,
        title: row.Title || row.File || "Unknown",
        cusa: row.CUSA || "",
        path,
        state: "queued",
        progressPct: 0,
        bytesTotal: Number(payload.bytes || 0),
        bytesDone: 0,
        lastMessage: "Queued on PS4",
      });
      await refreshRpiTasks();
    }
    const bodyInfo = payload.body ? `\n${payload.body}` : "";
    alert(`Sent to PS4 (${payload.bytes || 0} bytes).${bodyInfo}`);
  } catch (err) {
    alert(`Send to PS4 failed: ${err.message}`);
  } finally {
    if (btn) {
      btn.textContent = prev;
      updateVisualSendToPs4Button(rows);
    }
  }
}

function loadRpiTasks() {
  try {
    const raw = localStorage.getItem("ps4_rpi_tasks");
    const arr = JSON.parse(raw || "[]");
    state.rpiTasks = Array.isArray(arr) ? arr : [];
  } catch {
    state.rpiTasks = [];
  }
}

function persistRpiTasks() {
  localStorage.setItem("ps4_rpi_tasks", JSON.stringify(state.rpiTasks.slice(0, 80)));
}

function trackRpiTask(task) {
  const tid = Number(task.taskId || 0);
  if (!tid) return;
  const idx = state.rpiTasks.findIndex((t) => Number(t.taskId) === tid);
  const merged = {
    taskId: tid,
    title: task.title || "",
    cusa: task.cusa || "",
    path: task.path || "",
    state: task.state || "queued",
    progressPct: Number(task.progressPct || 0),
    bytesTotal: Number(task.bytesTotal || 0),
    bytesDone: Number(task.bytesDone || 0),
    errorCode: task.errorCode || "",
    lastMessage: task.lastMessage || "",
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) state.rpiTasks[idx] = { ...state.rpiTasks[idx], ...merged };
  else state.rpiTasks.unshift(merged);
  persistRpiTasks();
}

async function refreshRpiTasks() {
  await refreshSendJobs();
  if (!state.apiEnabled) return;
  const pending = state.rpiTasks.filter((t) => !["finished", "failed", "removed"].includes(String(t.state || "").toLowerCase()));
  if (!pending.length) {
    renderRpiTasks();
    return;
  }
  const ids = pending.map((t) => Number(t.taskId)).filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return;
  setButtonBusy(el.refreshTasksBtn, true);
  try {
    const res = await fetch("/api/rpi-task-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_ids: ids }),
    });
    const payload = await res.json();
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    tasks.forEach((t) => {
      const parsed = summarizeTaskProgress(t);
      trackRpiTask(parsed);
    });
    renderRpiTasks();
  } catch (err) {
    console.warn("Task refresh failed", err);
  } finally {
    setButtonBusy(el.refreshTasksBtn, false);
  }
}

async function refreshSendJobs() {
  if (!state.apiEnabled) return;
  try {
    const res = await fetch("/api/send-jobs", { cache: "no-store" });
    if (!res.ok) return;
    const payload = await res.json();
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    state.sendJobs = jobs;
    jobs.forEach((j) => {
      const tid = Number(j.taskId || 0);
      if (tid > 0) {
        trackRpiTask({
          taskId: tid,
          title: deriveTitleFromPathOrName(j.path || "", j.path || ""),
          path: j.path || "",
          state: j.state === "failed" ? "failed" : "queued",
          progressPct: 0,
          bytesTotal: Number(j.bytes || 0),
          bytesDone: 0,
          lastMessage: j.error || j.body || "",
        });
      }
    });
    renderRpiTasks();
  } catch {
    // no-op: async sender jobs are best-effort in UI
  }
}

function summarizeTaskProgress(raw) {
  const d = raw?.data && typeof raw.data === "object" ? raw.data : {};
  const tid = Number(raw?.taskId || d.task_id || 0);
  const statusText = String(d.status || d.state || d.task_status || "").toLowerCase();
  const total = pickNum(d.total, d.total_size, d.pkg_size, d.length, d.size);
  const done = pickNum(d.transferred, d.downloaded, d.received, d.written, d.current, d.done);
  let pct = pickNum(d.progress, d.percent, d.percentage);
  if (!Number.isFinite(pct) && Number.isFinite(total) && total > 0 && Number.isFinite(done)) pct = (done / total) * 100;
  pct = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  const errorCode = d.error_code || d.errorCode || "";
  let stateText = "queued";
  if (statusText.includes("fail") || errorCode) stateText = "failed";
  else if (statusText.includes("done") || statusText.includes("success") || statusText.includes("complete") || statusText.includes("installed")) stateText = "finished";
  else if (statusText.includes("pause")) stateText = "paused";
  else if (statusText.includes("download") || (Number.isFinite(done) && done > 0)) stateText = "downloading";
  const msg = String(d.error || d.message || d.msg || "").trim();
  return {
    taskId: tid,
    state: stateText,
    progressPct: pct,
    bytesTotal: Number.isFinite(total) ? total : 0,
    bytesDone: Number.isFinite(done) ? done : 0,
    errorCode: errorCode ? String(errorCode) : "",
    lastMessage: msg || (raw?.ok ? "" : raw?.error || ""),
  };
}

function pickNum(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return NaN;
}

function clearFinishedRpiTasks() {
  state.rpiTasks = state.rpiTasks.filter((t) => !["finished", "failed", "removed"].includes(String(t.state || "").toLowerCase()));
  persistRpiTasks();
  renderRpiTasks();
}

function renderRpiTasks() {
  const taskRows = [...state.rpiTasks];
  const pendingJobs = (state.sendJobs || [])
    .filter((j) => !Number(j.taskId || 0))
    .slice(0, 20)
    .map((j) => ({
      taskId: `job:${j.jobId}`,
      title: deriveTitleFromPathOrName(j.path || "", j.path || ""),
      state: j.state || "queued",
      progressPct: 0,
      bytesDone: 0,
      bytesTotal: Number(j.bytes || 0),
      updatedAt: j.updatedAt || j.createdAt || "",
      _isJob: true,
    }));
  const rows = [...pendingJobs, ...taskRows];
  if (el.rpiTasksLabel) el.rpiTasksLabel.textContent = `RPI Tasks (${rows.length})`;
  if (!el.rpiTasksThead || !el.rpiTasksTbody) return;
  const cols = ["Task", "Title", "State", "Progress", "Done", "Total", "Updated"];
  el.rpiTasksThead.innerHTML = `<tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  if (!rows.length) {
    el.rpiTasksTbody.innerHTML = `<tr><td colspan="7">No tracked tasks yet. Send a package to PS4 to start tracking.</td></tr>`;
    return;
  }
  el.rpiTasksTbody.innerHTML = rows
    .slice(0, 50)
    .map((t) => {
      const stateBadge = renderTaskStateBadge(t.state || "queued");
      return `<tr>
        <td class="cell-num">${escapeHtml(String(t.taskId || ""))}</td>
        <td>${escapeHtml(t.title || t.cusa || "-")}</td>
        <td>${stateBadge}</td>
        <td class="cell-num">${escapeHtml((Number(t.progressPct || 0)).toFixed(1))}%</td>
        <td class="cell-num">${formatBytesShort(Number(t.bytesDone || 0))}</td>
        <td class="cell-num">${formatBytesShort(Number(t.bytesTotal || 0))}</td>
        <td>${escapeHtml(formatDateTimeShort(t.updatedAt))}</td>
      </tr>`;
    })
    .join("");
}

function renderTaskStateBadge(stateText) {
  const s = String(stateText || "").toLowerCase();
  let cls = "warn";
  if (s.includes("finish")) cls = "good";
  else if (s.includes("fail")) cls = "bad";
  else if (s.includes("download")) cls = "warn";
  return `<span class="badge ${cls}">${escapeHtml(stateText)}</span>`;
}

function setButtonBusy(btn, busy) {
  if (!btn) return;
  if (busy) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent || "";
    const w = Math.max(btn.getBoundingClientRect().width, 88);
    btn.style.width = `${Math.ceil(w)}px`;
    btn.classList.add("is-busy");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>`;
  } else {
    btn.classList.remove("is-busy");
    btn.disabled = false;
    btn.textContent = btn.dataset.label || btn.textContent || "";
    btn.style.width = "";
  }
}

function formatBytesShort(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "-";
  const gb = n / 1073741824;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = n / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = n / 1024;
  return `${kb.toFixed(1)} KB`;
}

function formatDateTimeShort(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function deriveTitleFromPathOrName(path, fallback) {
  const p = String(path || "");
  const base = p.split("/").pop() || fallback || "";
  return base.replace(/\.pkg$/i, "").replace(/_/g, " ").trim();
}

function startRpiPolling() {
  if (state.rpiPollTimer) clearInterval(state.rpiPollTimer);
  state.rpiPollTimer = setInterval(() => {
    refreshRpiTasks().catch(() => {});
  }, 5000);
}

function renderMainTable() {
  const rows = currentDataset();
  el.mainTableLabel.textContent = `${currentLabel()} (${rows.length})`;
  if (!rows.length) {
    el.mainThead.innerHTML = "";
    el.mainTbody.innerHTML = `<tr><td>No rows for this view.</td></tr>`;
    return;
  }

  const keys = Object.keys(rows[0]);
  el.mainThead.innerHTML = `<tr>${keys
    .map((k) => `<th data-key="${escapeHtml(k)}">${escapeHtml(k)} ${sortIndicator(k)}</th>`)
    .join("")}</tr>`;

  el.mainThead.querySelectorAll("th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (state.sort.key === key) state.sort.asc = !state.sort.asc;
      else {
        state.sort.key = key;
        state.sort.asc = true;
      }
      renderMainTable();
    });
  });

  el.mainTbody.innerHTML = rows
    .map((row, idx) => {
      const rowKey = makeRule(row).key || String(idx);
      const cells = keys.map((k) => `<td class="${isNumericCol(k) ? "cell-num" : ""}">${renderCell(k, row[k])}</td>`).join("");
      const selectedClass = state.selectedRowKey === rowKey ? "row-selected" : "";
      return `<tr class="row-clickable ${selectedClass}" data-idx="${idx}" data-key="${escapeHtml(rowKey)}">${cells}</tr>`;
    })
    .join("");

  el.mainTbody.querySelectorAll("tr.row-clickable").forEach((tr) => {
    tr.addEventListener("click", async () => {
      const row = rows[Number(tr.dataset.idx)];
      state.selectedRowKey = tr.dataset.key || "";
      const id = extractRowId(row);
      if (id) {
        try {
          await navigator.clipboard?.writeText(id);
        } catch {}
      }
      closeInspector();
      renderMainTable();
    });
    tr.addEventListener("dblclick", async () => {
      const row = rows[Number(tr.dataset.idx)];
      await openRowInFinder(row);
    });
  });
}

function renderCell(key, val) {
  if (key === "Installed Check") {
    const cls = val.includes("Verified") ? "good" : val.includes("Mismatch") ? "bad" : "warn";
    return `<span class="badge ${cls}">${escapeHtml(val)}</span>`;
  }
  return escapeHtml(val || "");
}

function sortIndicator(key) {
  if (state.sort.key !== key) return "";
  return state.sort.asc ? "↑" : "↓";
}

function sortIndicatorFor(sortState, key) {
  if (sortState.key !== key) return "";
  return sortState.asc ? "↑" : "↓";
}

function isNumericCol(name) {
  return /size|count|confidence|gb/i.test(name);
}

function openInspector(row) {
  el.inspector.classList.add("open");
  el.inspector.setAttribute("aria-hidden", "false");
  const pairs = Object.entries(row)
    .map(([k, v]) => `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v || "-")}</div>`)
    .join("");
  el.inspectorBody.innerHTML = `
    <div class="label">Summary</div>
    ${pairs}
  `;
}

function closeInspector() {
  el.inspector.classList.remove("open");
  el.inspector.setAttribute("aria-hidden", "true");
}

function openSettings() {
  if (!el.settingsPanel) return;
  el.settingsPanel.classList.add("open");
  el.settingsPanel.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  if (!el.settingsPanel) return;
  el.settingsPanel.classList.remove("open");
  el.settingsPanel.setAttribute("aria-hidden", "true");
}

function renderWatchList() {
  el.watchItems.innerHTML = state.watch
    .map(
      (w, idx) => `<li>
        <div class="head">
          <span>${escapeHtml(w.title)}</span>
          <button class="btn ghost" data-rm="${idx}">Remove</button>
        </div>
        <small>${escapeHtml(w.cusa || "No CUSA")} · ${new Date(w.addedAt).toLocaleString()}</small>
        <div>${escapeHtml(w.note || "")}</div>
      </li>`
    )
    .join("");

  el.watchItems.querySelectorAll("button[data-rm]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await listRemove("watch", Number(btn.dataset.rm));
      renderAll();
    });
  });

  el.listCounts.textContent = `Ignore rules: ${state.ignore.length} · Hidden rows: ${state.hidden.length} · Storage: ${state.apiEnabled ? "file-backed" : "browser local"}`;
}

function makeRule(row) {
  const key = row.Path || row.File || row.Archive || `${row.CUSA || ""}|${row.Title || ""}`;
  return {
    key,
    cusa: row.CUSA || "",
    label: row.Title || row.File || row.Archive || row["Title ID"] || "entry",
    createdAt: new Date().toISOString(),
  };
}

function extractRowId(row) {
  const candidate =
    row.CUSA ||
    row["Title ID"] ||
    row["Base Title ID"] ||
    row["Content ID"] ||
    row.content_id ||
    "";
  const id = String(candidate).trim();
  if (!id || id === "-") return "";
  return id;
}

function extractRowPath(row) {
  const candidate = row.Path || row["Example Path"] || "";
  const path = String(candidate).trim();
  if (!path || path === "-") return "";
  return path;
}

async function openRowInFinder(row) {
  const path = extractRowPath(row);
  if (!path) return;
  try {
    const res = await fetch("/api/open-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "Could not open Finder");
  } catch (err) {
    alert(`Open in Finder failed: ${err.message}`);
  }
}

function matchesIgnore(row) {
  const key = makeRule(row).key;
  const cusa = (row.CUSA || "").toUpperCase();
  return state.ignore.some((r) => (r.key && r.key === key) || (r.cusa && r.cusa.toUpperCase() === cusa && cusa));
}

function matchesHidden(row) {
  const key = makeRule(row).key;
  return state.hidden.some((r) => r.key === key);
}

async function clearList(type) {
  const map = { watch: "watch", ignore: "ignore", hidden: "hide" };
  const arr = type === "watch" ? state.watch : type === "ignore" ? state.ignore : state.hidden;
  if (!confirm(`Clear ${arr.length} ${type} item(s)?`)) return;

  if (state.apiEnabled) {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      await fetch(`/api/${map[type]}/${i}`, { method: "DELETE" });
    }
    await loadServerState();
  } else {
    if (type === "watch") state.watch = [];
    if (type === "ignore") state.ignore = [];
    if (type === "hidden") state.hidden = [];
    persistLocalLists();
  }
  renderAll();
}

async function listAdd(type, item) {
  const map = { watch: "watch", ignore: "ignore", hidden: "hide" };
  if (state.apiEnabled) {
    await fetch(`/api/${map[type]}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    await loadServerState();
  } else {
    const target = type === "watch" ? state.watch : type === "ignore" ? state.ignore : state.hidden;
    if (!target.some((x) => x.key && item.key && x.key === item.key)) target.unshift(item);
    persistLocalLists();
  }
}

async function listRemove(type, idx) {
  const map = { watch: "watch", ignore: "ignore", hidden: "hide" };
  if (state.apiEnabled) {
    await fetch(`/api/${map[type]}/${idx}`, { method: "DELETE" });
    await loadServerState();
  } else {
    const target = type === "watch" ? state.watch : type === "ignore" ? state.ignore : state.hidden;
    target.splice(idx, 1);
    persistLocalLists();
  }
}

function persistLocalLists() {
  localStorage.setItem("ps4_watch_list", JSON.stringify(state.watch));
  localStorage.setItem("ps4_ignore_list", JSON.stringify(state.ignore));
  localStorage.setItem("ps4_hidden_list", JSON.stringify(state.hidden));
}

function exportCurrentView() {
  const rows = currentDataset();
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(",")]
    .concat(rows.map((r) => headers.map((h) => csvEscape(r[h] || "")).join(",")))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ps4-mission-control-${state.view}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportUninstalledCard() {
  const rows = uninstalledCardRows();
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(",")]
    .concat(rows.map((r) => headers.map((h) => csvEscape(r[h] || "")).join(",")))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ps4-mission-control-uninstalled-card.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v) {
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

function renderSourceList() {
  const items = [
    `Installed list: <code>${SOURCES.installed}</code>`,
    `Installed DLC list: <code>${SOURCES.installedDlc}</code>`,
    `Updates Pending list: <code>${SOURCES.updatesPending}</code>`,
    `External games list: <code>${SOURCES.external}</code>`,
    `External uninstalled list: <code>${SOURCES.externalUninstalled}</code>`,
    `DLC list: <code>${SOURCES.dlc}</code>`,
    `Themes list: <code>${SOURCES.themes}</code>`,
    `Non-games list: <code>${SOURCES.nonGames}</code>`,
    `Archive review: <code>${SOURCES.archiveReview}</code>`,
    `Lists backend: <code>${state.apiEnabled ? "file-backed via /api" : "localStorage fallback"}</code>`,
  ];
  el.sources.innerHTML = items.map((i) => `<li>${i}</li>`).join("");
}

function renderPalette() {
  const q = (el.paletteInput.value || "").toLowerCase().trim();
  const actions = [
    { label: "View Drive Scan Uninstalled", run: () => setView("external_uninstalled") },
    { label: "View External Games", run: () => setView("external") },
    { label: "View Installed DLC", run: () => setView("installed_dlc") },
    { label: "View Updates Pending", run: () => setView("updates_pending") },
    { label: "View DLC", run: () => setView("dlc") },
    { label: "View Themes", run: () => setView("themes") },
    { label: "View Installed", run: () => setView("installed") },
    { label: "View Archives", run: () => setView("archives") },
    { label: "View Archive Cleanup", run: () => setView("cleanup") },
    { label: "View Non-Games", run: () => setView("nongames") },
    { label: "Refresh Data", run: refreshData },
    { label: "Refresh Storage", run: refreshStorageData },
    { label: "Export Current View CSV", run: exportCurrentView },
    { label: "Focus Search", run: () => el.inlineFilter.focus() },
  ].filter((a) => a.label.toLowerCase().includes(q));

  el.paletteList.innerHTML = actions.map((a, idx) => `<li data-act="${idx}">${a.label}</li>`).join("");
  el.paletteList.querySelectorAll("li").forEach((item, idx) => {
    item.addEventListener("click", () => {
      actions[idx].run();
      closePalette();
    });
  });
}

function setView(v) {
  state.view = v;
  el.chips.forEach((c) => c.classList.toggle("active", c.dataset.view === v));
  renderMainTable();
}

function openPalette() {
  el.palette.classList.add("open");
  el.palette.setAttribute("aria-hidden", "false");
  el.paletteInput.value = "";
  renderPalette();
  el.paletteInput.focus();
}

function closePalette() {
  el.palette.classList.remove("open");
  el.palette.setAttribute("aria-hidden", "true");
}

function escapeHtml(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeTitle(v) {
  return String(v)
    .toLowerCase()
    .replace(/\.pkg$/i, "")
    .replace(/cusa\d{5}/gi, " ")
    .replace(/\b(v\d+(\.\d+)?)\b/gi, " ")
    .replace(/\b(a\d{4}|fw\d+|ps4|eur|usa|update|backport|fix|dlc|duplex|opoisso893)\b/gi, " ")
    .replace(/[\[\]\(\)_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VR_TITLE_HINTS = [
  "astro bot",
  "rescue mission",
  "battlezone",
  "blood & truth",
  "blood and truth",
  "borderlands 2 vr",
  "crisis brigade",
  "dirt rally",
  "everest vr",
  "farpoint",
  "gran turismo sport",
  "headmaster",
  "here they lie",
  "i expect you to die",
  "iron man vr",
  "keep talking and nobody explodes",
  "moss",
  "no man's sky",
  "playstation vr worlds",
  "resident evil 7",
  "rez infinite",
  "playstation vr worlds",
  "raw data",
  "superhot vr",
  "the persistence",
  "tetris effect",
  "thumper",
  "wipeout omega collection",
];

const VR_CUSA_HINTS = new Set([
  "CUSA04179", // Farpoint
  "CUSA04785", // Battlezone
  "CUSA05202", // PS VR Worlds
  "CUSA05344", // Here They Lie
  "CUSA06297", // Headmaster
  "CUSA06561", // Keep Talking and Nobody Explodes
  "CUSA07210", // Everest VR
  "CUSA08165", // SUPERHOT VR
  "CUSA09759", // Raw Data
  "CUSA09760", // Moss
  "CUSA11108", // Blood & Truth
  "CUSA12392", // ASTRO BOT Rescue Mission
  "CUSA13946", // Borderlands 2 VR
  "CUSA16206", // Marvel's Iron Man VR
  "CUSA18828", // Crisis Brigade 2
  "CUSA27601", // I Expect You To Die 2
  "CUSA03220", // Gran Turismo Sport (VR mode)
  "CUSA03648", // DiRT Rally (VR mode)
  "CUSA04841", // No Man's Sky (VR mode)
  "CUSA05670", // WipEout Omega Collection (VR mode)
  "CUSA09016", // Resident Evil 7 (VR mode)
  "CUSA05725", // Rez Infinite (VR mode)
  "CUSA13594", // Tetris Effect (VR mode)
  "CUSA03363", // Thumper (VR mode)
]);

function isVrRow(row, precomputedText = "") {
  const text =
    precomputedText ||
    [
      row.File || "",
      row.Archive || "",
      row.Title || "",
      row["DLC Title"] || "",
      row["Title ID"] || "",
      row["Content ID"] || "",
      row.CUSA || "",
      row.Path || "",
    ]
      .join(" ")
      .toLowerCase();
  if (/\bvr\b|psvr|playstation vr/.test(text)) return true;
  const cusa = String(row.CUSA || row["Title ID"] || "").toUpperCase().trim();
  if (cusa && VR_CUSA_HINTS.has(cusa)) return true;
  return VR_TITLE_HINTS.some((hint) => text.includes(hint));
}

function isLikelySameGameTitle(a, b) {
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const at = tokenSet(a);
  const bt = tokenSet(b);
  let overlap = 0;
  for (const t of at) if (bt.has(t)) overlap += 1;
  return overlap >= 2;
}

function tokenSet(s) {
  const stop = new Set(["the", "and", "of", "edition", "complete", "remastered", "vr"]);
  const out = new Set();
  s.split(/\s+/).forEach((tok) => {
    if (!tok || stop.has(tok) || tok.length < 3) return;
    out.add(tok);
    if (tok.endsWith("y") && tok.length > 4) out.add(tok.slice(0, -1));
  });
  return out;
}
