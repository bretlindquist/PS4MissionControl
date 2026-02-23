const DATA_VERSION = "20260222-1";
const AUTO_EXTRACT_SEEN_KEY = "ps4mc_auto_extract_seen_cusas_v1";
const AUTO_EXTRACT_MAX_PER_REFRESH = 3;
const SETTINGS_KEY = "ps4mc_settings_v1";
const SEND_BUTTON_LABEL = "Send to PS4 (Beta)";
const DEFAULT_SETTINGS = Object.freeze({
  ps4Ip: "192.168.0.26",
  ftpPort: 2121,
  rpiPort: 12800,
  binloaderPort: 9090,
  watchRoots: "",
  maxDepth: 12,
  includeArchives: false,
  sendRetries: 1,
  sendBackoffMs: 900,
  requireOnlinePreflight: true,
  ambiguousPolicy: "unknown",
  defaultView: "uninstalled_games",
  defaultSortKey: "",
  defaultSortAsc: true,
  density: "comfortable",
  stickyVisualDetails: true,
  autoRefreshOnLoad: false,
  confirmBeforeSend: true,
  autoExtractMissingIcons: true,
  enableFinderDblClick: true,
  confirmBulkActions: true,
  exportProfile: "full",
});
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
  view: "uninstalled_games",
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
  settingsGroupFilter: "basic",
  settings: { ...DEFAULT_SETTINGS },
  settingsWatchRootsDraft: [],
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
  settingsGroupSwitch: document.getElementById("settingsGroupSwitch"),
  settingsGroupBtns: [...document.querySelectorAll("[data-settings-group-btn]")],
  settingsSections: [...document.querySelectorAll("[data-settings-group]")],
  settingsPs4Ip: document.getElementById("settingsPs4Ip"),
  settingsFtpPort: document.getElementById("settingsFtpPort"),
  settingsRpiPort: document.getElementById("settingsRpiPort"),
  settingsBinloaderPort: document.getElementById("settingsBinloaderPort"),
  settingsWatchRoots: document.getElementById("settingsWatchRoots"),
  settingsWatchRootChips: document.getElementById("settingsWatchRootChips"),
  settingsAddWatchRootBtn: document.getElementById("settingsAddWatchRootBtn"),
  settingsMaxDepth: document.getElementById("settingsMaxDepth"),
  settingsIncludeArchives: document.getElementById("settingsIncludeArchives"),
  settingsSendRetries: document.getElementById("settingsSendRetries"),
  settingsSendBackoffMs: document.getElementById("settingsSendBackoffMs"),
  settingsRequireOnlinePreflight: document.getElementById("settingsRequireOnlinePreflight"),
  settingsAmbiguousPolicy: document.getElementById("settingsAmbiguousPolicy"),
  settingsDefaultView: document.getElementById("settingsDefaultView"),
  settingsDefaultSortKey: document.getElementById("settingsDefaultSortKey"),
  settingsDefaultSortAsc: document.getElementById("settingsDefaultSortAsc"),
  settingsDensity: document.getElementById("settingsDensity"),
  settingsStickyVisualDetails: document.getElementById("settingsStickyVisualDetails"),
  settingsAutoRefreshOnLoad: document.getElementById("settingsAutoRefreshOnLoad"),
  settingsConfirmSend: document.getElementById("settingsConfirmSend"),
  settingsAutoExtractMissingIcons: document.getElementById("settingsAutoExtractMissingIcons"),
  settingsEnableFinderDblClick: document.getElementById("settingsEnableFinderDblClick"),
  settingsConfirmBulkActions: document.getElementById("settingsConfirmBulkActions"),
  settingsClearThumbCacheBtn: document.getElementById("settingsClearThumbCacheBtn"),
  settingsForceReindexBtn: document.getElementById("settingsForceReindexBtn"),
  settingsOpenReadmeBtn: document.getElementById("settingsOpenReadmeBtn"),
  settingsOpenInstallerSpecBtn: document.getElementById("settingsOpenInstallerSpecBtn"),
  settingsExportProfile: document.getElementById("settingsExportProfile"),
  settingsExportNowBtn: document.getElementById("settingsExportNowBtn"),
  settingsSaveBtn: document.getElementById("settingsSaveBtn"),
  settingsResetBtn: document.getElementById("settingsResetBtn"),
  palette: document.getElementById("palette"),
  paletteInput: document.getElementById("paletteInput"),
  paletteList: document.getElementById("paletteList"),
  cmdBtn: document.getElementById("cmdBtn"),
  themeBtn: document.getElementById("themeBtn"),
  sources: document.getElementById("sources"),
  namingConventions: document.getElementById("namingConventions"),
  selectionTitle: document.getElementById("selectionTitle"),
  selectionSub: document.getElementById("selectionSub"),
  selectionCopyBtn: document.getElementById("selectionCopyBtn"),
  selectionOpenBtn: document.getElementById("selectionOpenBtn"),
  selectionSendBtn: document.getElementById("selectionSendBtn"),
  toastStack: document.getElementById("toastStack"),
};

init().catch((err) => {
  console.error(err);
  notify("Failed to load Mission Control data. Start server with: python3 ~/git/PS4/mission-control/server.py", "error", 5000);
});

async function init() {
  loadSettings();
  applyUiSettings();
  state.view = normalizeViewId(state.settings.defaultView || state.view);
  state.sort.key = state.settings.defaultSortKey || null;
  state.sort.asc = !!state.settings.defaultSortAsc;
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
  renderSettingsForm();
  el.chips.forEach((c) => c.classList.toggle("active", c.dataset.view === state.view));
  renderPalette();
  startRpiPolling();
  if (state.settings.autoRefreshOnLoad && state.apiEnabled) {
    refreshData().catch(() => {});
  }
}

function normalizePort(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 1 || n > 65535) return fallback;
  return Math.trunc(n);
}

function normalizeInt(value, fallback, min = 0, max = 999999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min || i > max) return fallback;
  return i;
}

function normalizeViewId(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_SETTINGS.defaultView;
  const legacy = {
    external_uninstalled: "uninstalled_games",
    external: "all_packages",
  };
  const mapped = legacy[raw] || raw;
  const allowed = new Set([
    "uninstalled_games",
    "uninstalled_packages",
    "all_packages",
    "installed",
    "installed_dlc",
    "updates_pending",
    "dlc",
    "themes",
    "archives",
    "cleanup",
    "nongames",
  ]);
  return allowed.has(mapped) ? mapped : DEFAULT_SETTINGS.defaultView;
}

function normalizeRootPath(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (s === "/") return s;
  return s.replace(/\/+$/, "");
}

function parseWatchRoots(value) {
  const out = [];
  const seen = new Set();
  String(value || "")
    .split(",")
    .map((s) => normalizeRootPath(s))
    .filter(Boolean)
    .forEach((root) => {
      if (seen.has(root)) return;
      seen.add(root);
      out.push(root);
    });
  return out;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = {
      ps4Ip: String(parsed?.ps4Ip || DEFAULT_SETTINGS.ps4Ip).trim() || DEFAULT_SETTINGS.ps4Ip,
      ftpPort: normalizePort(parsed?.ftpPort, DEFAULT_SETTINGS.ftpPort),
      rpiPort: normalizePort(parsed?.rpiPort, DEFAULT_SETTINGS.rpiPort),
      binloaderPort: normalizePort(parsed?.binloaderPort, DEFAULT_SETTINGS.binloaderPort),
      watchRoots: String(parsed?.watchRoots || DEFAULT_SETTINGS.watchRoots).trim() || DEFAULT_SETTINGS.watchRoots,
      maxDepth: normalizeInt(parsed?.maxDepth, DEFAULT_SETTINGS.maxDepth, 1, 64),
      includeArchives: !!parsed?.includeArchives,
      sendRetries: normalizeInt(parsed?.sendRetries, DEFAULT_SETTINGS.sendRetries, 0, 5),
      sendBackoffMs: normalizeInt(parsed?.sendBackoffMs, DEFAULT_SETTINGS.sendBackoffMs, 100, 20000),
      requireOnlinePreflight: parsed?.requireOnlinePreflight !== false,
      ambiguousPolicy: ["unknown", "game", "non_game"].includes(String(parsed?.ambiguousPolicy || "")) ? String(parsed.ambiguousPolicy) : DEFAULT_SETTINGS.ambiguousPolicy,
      defaultView: normalizeViewId(parsed?.defaultView || DEFAULT_SETTINGS.defaultView),
      defaultSortKey: String(parsed?.defaultSortKey || DEFAULT_SETTINGS.defaultSortKey),
      defaultSortAsc: parsed?.defaultSortAsc !== false,
      density: String(parsed?.density || DEFAULT_SETTINGS.density) === "compact" ? "compact" : "comfortable",
      stickyVisualDetails: parsed?.stickyVisualDetails !== false,
      autoRefreshOnLoad: !!parsed?.autoRefreshOnLoad,
      confirmBeforeSend: parsed?.confirmBeforeSend !== false,
      autoExtractMissingIcons: parsed?.autoExtractMissingIcons !== false,
      enableFinderDblClick: parsed?.enableFinderDblClick !== false,
      confirmBulkActions: parsed?.confirmBulkActions !== false,
      exportProfile: String(parsed?.exportProfile || DEFAULT_SETTINGS.exportProfile) === "minimal" ? "minimal" : "full",
    };
    state.settings = next;
    state.settingsWatchRootsDraft = parseWatchRoots(next.watchRoots);
  } catch {
    state.settings = { ...DEFAULT_SETTINGS };
    state.settingsWatchRootsDraft = parseWatchRoots(DEFAULT_SETTINGS.watchRoots);
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function applySettingsFromForm() {
  const roots = [...state.settingsWatchRootsDraft];
  state.settings = {
    ps4Ip: String(el.settingsPs4Ip?.value || DEFAULT_SETTINGS.ps4Ip).trim() || DEFAULT_SETTINGS.ps4Ip,
    ftpPort: normalizePort(el.settingsFtpPort?.value, DEFAULT_SETTINGS.ftpPort),
    rpiPort: normalizePort(el.settingsRpiPort?.value, DEFAULT_SETTINGS.rpiPort),
    binloaderPort: normalizePort(el.settingsBinloaderPort?.value, DEFAULT_SETTINGS.binloaderPort),
    watchRoots: roots.join(",") || DEFAULT_SETTINGS.watchRoots,
    maxDepth: normalizeInt(el.settingsMaxDepth?.value, DEFAULT_SETTINGS.maxDepth, 1, 64),
    includeArchives: !!el.settingsIncludeArchives?.checked,
    sendRetries: normalizeInt(el.settingsSendRetries?.value, DEFAULT_SETTINGS.sendRetries, 0, 5),
    sendBackoffMs: normalizeInt(el.settingsSendBackoffMs?.value, DEFAULT_SETTINGS.sendBackoffMs, 100, 20000),
    requireOnlinePreflight: !!el.settingsRequireOnlinePreflight?.checked,
    ambiguousPolicy: String(el.settingsAmbiguousPolicy?.value || DEFAULT_SETTINGS.ambiguousPolicy),
    defaultView: normalizeViewId(el.settingsDefaultView?.value || DEFAULT_SETTINGS.defaultView),
    defaultSortKey: String(el.settingsDefaultSortKey?.value || DEFAULT_SETTINGS.defaultSortKey),
    defaultSortAsc: String(el.settingsDefaultSortAsc?.value || "asc") !== "desc",
    density: String(el.settingsDensity?.value || DEFAULT_SETTINGS.density) === "compact" ? "compact" : "comfortable",
    stickyVisualDetails: !!el.settingsStickyVisualDetails?.checked,
    autoRefreshOnLoad: !!el.settingsAutoRefreshOnLoad?.checked,
    confirmBeforeSend: !!el.settingsConfirmSend?.checked,
    autoExtractMissingIcons: !!el.settingsAutoExtractMissingIcons?.checked,
    enableFinderDblClick: !!el.settingsEnableFinderDblClick?.checked,
    confirmBulkActions: !!el.settingsConfirmBulkActions?.checked,
    exportProfile: String(el.settingsExportProfile?.value || "full") === "minimal" ? "minimal" : "full",
  };
  saveSettings();
  applyUiSettings();
}

function renderSettingsForm() {
  if (el.settingsPs4Ip) el.settingsPs4Ip.value = state.settings.ps4Ip || "";
  if (el.settingsFtpPort) el.settingsFtpPort.value = String(state.settings.ftpPort || DEFAULT_SETTINGS.ftpPort);
  if (el.settingsRpiPort) el.settingsRpiPort.value = String(state.settings.rpiPort || DEFAULT_SETTINGS.rpiPort);
  if (el.settingsBinloaderPort) el.settingsBinloaderPort.value = String(state.settings.binloaderPort || DEFAULT_SETTINGS.binloaderPort);
  state.settingsWatchRootsDraft = parseWatchRoots(state.settings.watchRoots || DEFAULT_SETTINGS.watchRoots);
  if (el.settingsWatchRoots) el.settingsWatchRoots.value = state.settingsWatchRootsDraft.join(",");
  renderWatchRootChips();
  if (el.settingsMaxDepth) el.settingsMaxDepth.value = String(state.settings.maxDepth || DEFAULT_SETTINGS.maxDepth);
  if (el.settingsIncludeArchives) el.settingsIncludeArchives.checked = !!state.settings.includeArchives;
  if (el.settingsSendRetries) el.settingsSendRetries.value = String(state.settings.sendRetries ?? DEFAULT_SETTINGS.sendRetries);
  if (el.settingsSendBackoffMs) el.settingsSendBackoffMs.value = String(state.settings.sendBackoffMs ?? DEFAULT_SETTINGS.sendBackoffMs);
  if (el.settingsRequireOnlinePreflight) el.settingsRequireOnlinePreflight.checked = !!state.settings.requireOnlinePreflight;
  if (el.settingsAmbiguousPolicy) el.settingsAmbiguousPolicy.value = state.settings.ambiguousPolicy || DEFAULT_SETTINGS.ambiguousPolicy;
  if (el.settingsDefaultView) el.settingsDefaultView.value = state.settings.defaultView || DEFAULT_SETTINGS.defaultView;
  if (el.settingsDefaultSortKey) el.settingsDefaultSortKey.value = state.settings.defaultSortKey || "";
  if (el.settingsDefaultSortAsc) el.settingsDefaultSortAsc.value = state.settings.defaultSortAsc ? "asc" : "desc";
  if (el.settingsDensity) el.settingsDensity.value = state.settings.density || DEFAULT_SETTINGS.density;
  if (el.settingsStickyVisualDetails) el.settingsStickyVisualDetails.checked = !!state.settings.stickyVisualDetails;
  if (el.settingsAutoRefreshOnLoad) el.settingsAutoRefreshOnLoad.checked = !!state.settings.autoRefreshOnLoad;
  if (el.settingsConfirmSend) el.settingsConfirmSend.checked = !!state.settings.confirmBeforeSend;
  if (el.settingsAutoExtractMissingIcons) el.settingsAutoExtractMissingIcons.checked = !!state.settings.autoExtractMissingIcons;
  if (el.settingsEnableFinderDblClick) el.settingsEnableFinderDblClick.checked = !!state.settings.enableFinderDblClick;
  if (el.settingsConfirmBulkActions) el.settingsConfirmBulkActions.checked = !!state.settings.confirmBulkActions;
  if (el.settingsExportProfile) el.settingsExportProfile.value = state.settings.exportProfile || "full";
  setSettingsGroupFilter(state.settingsGroupFilter || "basic");
}

function setSettingsGroupFilter(group) {
  const allowed = new Set(["basic", "advanced", "tools", "all"]);
  const next = allowed.has(group) ? group : "basic";
  state.settingsGroupFilter = next;
  if (el.settingsGroupBtns?.length) {
    el.settingsGroupBtns.forEach((btn) => {
      btn.classList.toggle("active", String(btn.dataset.settingsGroupBtn || "") === next);
    });
  }
  if (el.settingsSections?.length) {
    el.settingsSections.forEach((sec) => {
      const secGroup = String(sec.dataset.settingsGroup || "");
      const visible = next === "all" || secGroup === next;
      sec.classList.toggle("is-hidden", !visible);
    });
  }
}

function renderWatchRootChips() {
  if (!el.settingsWatchRootChips) return;
  const roots = state.settingsWatchRootsDraft || [];
  if (!roots.length) {
    el.settingsWatchRootChips.innerHTML = `<span class="settings-root-empty">No watch roots configured.</span>`;
    return;
  }
  el.settingsWatchRootChips.innerHTML = roots
    .map(
      (root, idx) => `<span class="settings-root-chip" title="${escapeHtml(root)}">
        <span class="settings-root-chip__text">${escapeHtml(root)}</span>
        <button class="settings-root-chip__remove" type="button" data-root-rm="${idx}" aria-label="Remove root">×</button>
      </span>`
    )
    .join("");
  el.settingsWatchRootChips.querySelectorAll("button[data-root-rm]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(btn.dataset.rootRm);
      if (!Number.isFinite(idx) || idx < 0) return;
      const root = state.settingsWatchRootsDraft[idx] || "";
      const ok = confirmAction("destructive", `Remove this watch root?\n\n${root}`);
      if (!ok) return;
      state.settingsWatchRootsDraft.splice(idx, 1);
      if (el.settingsWatchRoots) el.settingsWatchRoots.value = state.settingsWatchRootsDraft.join(",");
      renderWatchRootChips();
    });
  });
}

function applyUiSettings() {
  document.body.classList.toggle("density-compact", state.settings.density === "compact");
  document.body.classList.toggle("details-not-sticky", !state.settings.stickyVisualDetails);
}

function requestSettingsQuery() {
  const q = new URLSearchParams();
  q.set("ps4_ip", state.settings.ps4Ip || DEFAULT_SETTINGS.ps4Ip);
  q.set("ftp_port", String(state.settings.ftpPort || DEFAULT_SETTINGS.ftpPort));
  q.set("rpi_port", String(state.settings.rpiPort || DEFAULT_SETTINGS.rpiPort));
  q.set("binloader_port", String(state.settings.binloaderPort || DEFAULT_SETTINGS.binloaderPort));
  q.set("watch_roots", String(state.settings.watchRoots || ""));
  q.set("max_depth", String(state.settings.maxDepth || DEFAULT_SETTINGS.maxDepth));
  return q.toString();
}

function requestSettingsBody() {
  return {
    ps4_ip: state.settings.ps4Ip || DEFAULT_SETTINGS.ps4Ip,
    ftp_port: state.settings.ftpPort || DEFAULT_SETTINGS.ftpPort,
    rpi_port: state.settings.rpiPort || DEFAULT_SETTINGS.rpiPort,
    binloader_port: state.settings.binloaderPort || DEFAULT_SETTINGS.binloaderPort,
    watch_roots: String(state.settings.watchRoots || ""),
    max_depth: state.settings.maxDepth || DEFAULT_SETTINGS.maxDepth,
  };
}

async function loadServerState() {
  try {
    const res = await fetch(`/api/state?${requestSettingsQuery()}`, { cache: "no-store" });
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
    state.settings.ps4Ip = String(payload?.ftpConfig?.host || state.settings.ps4Ip || DEFAULT_SETTINGS.ps4Ip).trim() || DEFAULT_SETTINGS.ps4Ip;
    state.settings.ftpPort = normalizePort(payload?.ftpConfig?.port, state.settings.ftpPort);
    state.settings.rpiPort = normalizePort(payload?.rpiStatus?.port, state.settings.rpiPort);
    saveSettings();
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
  el.settingsSaveBtn?.addEventListener("click", async () => {
    applySettingsFromForm();
    await loadServerState();
    renderKpis();
    renderAll();
    closeSettings();
  });
  el.settingsGroupBtns?.forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = String(btn.dataset.settingsGroupBtn || "basic");
      setSettingsGroupFilter(group);
    });
  });
  el.selectionCopyBtn?.addEventListener("click", async () => {
    const row = getUnifiedSelectedUninstalledRow();
    const id = row ? extractRowId(row) : "";
    if (!id) return;
    try {
      await navigator.clipboard?.writeText(id);
    } catch {}
  });
  el.selectionOpenBtn?.addEventListener("click", async () => {
    const row = getUnifiedSelectedUninstalledRow();
    if (!row) return;
    await openRowInFinder(row);
  });
  el.selectionSendBtn?.addEventListener("click", async () => {
    const row = getUnifiedSelectedUninstalledRow();
    if (!row) return;
    const path = extractRowPath(row);
    if (!path || !path.toLowerCase().endsWith(".pkg")) return;
    if (!confirmAction("send", `Send this package to PS4?\n\n${path}`)) return;
    try {
      setButtonBusy(el.selectionSendBtn, true);
      const payload = await sendToPs4WithRetry(path);
      if (!payload.ok) throw new Error(payload.error || payload.body || "send failed");
      await refreshSendJobs();
      notify(`Queued sender job ${payload.jobId || ""} for PS4.`, "success");
    } catch (err) {
      notify(`Send to PS4 failed: ${err.message}`, "error", 4500);
    } finally {
      setButtonBusy(el.selectionSendBtn, false);
      renderSelectionActions();
    }
  });
  el.settingsAddWatchRootBtn?.addEventListener("click", async () => {
    await pickWatchRootFromServer();
  });
  el.settingsResetBtn?.addEventListener("click", async () => {
    if (!confirmAction("destructive", "Reset all settings to defaults?")) return;
    state.settings = { ...DEFAULT_SETTINGS };
    saveSettings();
    applyUiSettings();
    renderSettingsForm();
    await loadServerState();
    renderAll();
  });
  el.settingsClearThumbCacheBtn?.addEventListener("click", clearThumbCacheNow);
  el.settingsForceReindexBtn?.addEventListener("click", async () => {
    await refreshData();
  });
  el.settingsOpenReadmeBtn?.addEventListener("click", () => window.open("../README.md", "_blank", "noopener"));
  el.settingsOpenInstallerSpecBtn?.addEventListener("click", () => window.open("../PS4MISSIONCONTROL_INSTALLER_SPEC.md", "_blank", "noopener"));
  el.settingsExportNowBtn?.addEventListener("click", () => {
    const ok = exportCurrentView();
    if (!ok) notify("No rows in current view to export.", "warn");
    else notify("Export started for current view.", "success");
  });
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
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestSettingsBody()),
      });
      const payload = await res.json();
      if (!payload.ok) throw new Error(payload.stderr || "refresh failed");
    }
    await loadMarkdownData();
    await loadThumbCache();
    await hydrateThumbsForExternalUninstalled();
    const auto = state.settings.autoExtractMissingIcons ? await autoExtractMissingIcons() : { extracted: 0, attempted: 0 };
    renderAll();
    if (auto.extracted > 0) {
      notify(`Data refreshed. Auto-extracted ${auto.extracted} new icon(s).`, "success");
    } else {
      notify("Data refreshed.", "success");
    }
  } catch (err) {
    notify(`Refresh failed: ${err.message}`, "error", 4500);
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
    notify("Storage refresh requires API mode (start mission-control/server.py).", "warn", 4500);
    return;
  }
  setButtonBusy(el.refreshStorageBtn, true);
  try {
    const res = await fetch("/api/refresh-storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestSettingsBody()),
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload?.send?.error || payload?.snapshot?.stderr || "storage refresh failed");
    await loadServerState();
    renderKpis();
    notify("Storage refreshed.", "success");
  } catch (err) {
    notify(`Storage refresh failed: ${err.message}`, "error", 4500);
  } finally {
    setButtonBusy(el.refreshStorageBtn, false);
  }
}

async function clearThumbCacheNow() {
  const ok = confirmAction("destructive", "Clear thumbnail cache now?");
  if (!ok) return;
  if (!state.apiEnabled) {
    state.thumbCache = {};
    notify("Local thumb cache cleared in browser state.", "success");
    renderVisualUninstalledCard();
    return;
  }
  try {
    const res = await fetch("/api/thumb-cache-clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "clear failed");
    state.thumbCache = {};
    notify("Thumb cache cleared. Run Refresh Data to repopulate.", "success");
    renderVisualUninstalledCard();
  } catch (err) {
    notify(`Clear cache failed: ${err.message}`, "error", 4500);
  }
}

async function pickWatchRootFromServer() {
  if (!state.apiEnabled) {
    notify("Folder picker requires API mode (start mission-control/server.py).", "warn", 4500);
    return;
  }
  const btn = el.settingsAddWatchRootBtn;
  setButtonBusy(btn, true);
  try {
    const res = await fetch("/api/select-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const payload = await res.json();
    if (payload?.cancelled) return;
    if (!payload?.ok) throw new Error(payload?.error || "folder selection failed");
    const root = normalizeRootPath(payload.path);
    if (!root) return;
    if (!state.settingsWatchRootsDraft.includes(root)) {
      state.settingsWatchRootsDraft.push(root);
      state.settingsWatchRootsDraft.sort((a, b) => a.localeCompare(b));
    }
    if (el.settingsWatchRoots) el.settingsWatchRoots.value = state.settingsWatchRootsDraft.join(",");
    renderWatchRootChips();
  } catch (err) {
    notify(`Folder picker failed: ${err.message}`, "error", 4500);
  } finally {
    setButtonBusy(btn, false);
  }
}

function renderAll() {
  renderWatchList();
  renderKpis();
  renderUninstalledCard();
  renderVisualUninstalledCard();
  renderRpiTasks();
  renderMainTable();
  renderSelectionActions();
}

function setUnifiedUninstalledSelection(row, key) {
  const rowKey = key || (row ? makeRule(row).key : "");
  state.uninstalledCard.selectedRowKey = rowKey || "";
  state.extUninstalledCard.selectedRowKey = rowKey || "";
  state.visualUninstalledCard.selectedRowKey = rowKey || "";
}

function getUnifiedSelectedUninstalledRow() {
  const key = state.uninstalledCard.selectedRowKey || state.extUninstalledCard.selectedRowKey || state.visualUninstalledCard.selectedRowKey;
  if (!key) return null;
  const pools = [
    ...(state.data.externalUninstalled || []),
    ...(state.data.externalGames || []),
    ...getAllPackageRows(),
  ];
  return pools.find((r, idx) => (makeRule(r).key || String(idx)) === key) || null;
}

function renderSelectionActions() {
  const row = getUnifiedSelectedUninstalledRow();
  const id = row ? extractRowId(row) : "";
  const path = row ? extractRowPath(row) : "";
  const canSend = !!(path && path.toLowerCase().endsWith(".pkg") && state.apiEnabled);
  if (el.selectionTitle) el.selectionTitle.textContent = row ? (row.Title || row.File || "Selected item") : "No selection";
  if (el.selectionSub) el.selectionSub.textContent = row ? `${id || "-"} ${path ? "· " + path : ""}` : "Select a row or tile in an uninstalled package view.";
  if (el.selectionCopyBtn) {
    el.selectionCopyBtn.disabled = !id;
    el.selectionCopyBtn.title = id ? `Copy ${id}` : "No ID available";
  }
  if (el.selectionOpenBtn) {
    el.selectionOpenBtn.disabled = !path;
    el.selectionOpenBtn.title = path ? `Open ${path}` : "No path available";
  }
  if (el.selectionSendBtn) {
    el.selectionSendBtn.disabled = !canSend;
    el.selectionSendBtn.title = canSend ? `Send ${path}` : "Need a selected .pkg row";
  }
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

function mapPkgClassRows(rows, pkgClass) {
  return (rows || []).map((row) => {
    const path = String(row.Path || row["Example Path"] || "").trim();
    const file = String(row.File || "").trim();
    const check = String(row["Installed Check"] || "").trim();
    let status = "Unknown";
    if (/verified installed/i.test(check)) status = "Installed";
    else if (/not installed/i.test(check)) status = "Uninstalled";
    else if (/mismatch|likely installed/i.test(check)) status = "Mismatch";
    return {
      "Package Class": pkgClass,
      Title: String(row.Title || deriveTitleFromPathOrName(path, file)).trim(),
      Drive: row.Drive || "",
      File: file,
      CUSA: row.CUSA || row["Title ID"] || "",
      "Title ID": row["Title ID"] || row.CUSA || "",
      "Size (GB)": row["Size (GB)"] || "",
      Date: row.Date || "",
      Path: path,
      Status: status,
      "Installed Check": check || "-",
      Confidence: row.Confidence || "",
      "Matched Installed": row["Matched Installed"] || row["Matched Installed Title"] || "-",
    };
  });
}

function getAllPackageRows() {
  return [
    ...mapPkgClassRows(state.data.externalGames || [], "Game"),
    ...mapPkgClassRows(state.data.dlc || [], "DLC"),
    ...mapPkgClassRows(state.data.themes || [], "Theme"),
    ...mapPkgClassRows(state.data.nonGames || [], "Non-Game"),
  ];
}

function currentDatasetRaw() {
  if (state.view === "installed") return state.data.installed;
  if (state.view === "installed_dlc") return state.data.installedDlc;
  if (state.view === "updates_pending") return state.data.updatesPending;
  if (state.view === "uninstalled_games") {
    return state.data.externalUninstalled.filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  }
  if (state.view === "uninstalled_packages") return getUninstalledRows();
  if (state.view === "all_packages") return getAllPackageRows();
  if (state.view === "external_uninstalled") {
    return state.data.externalUninstalled.filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  }
  if (state.view === "external") return getAllPackageRows();
  if (state.view === "dlc") return state.data.dlc;
  if (state.view === "themes") return state.data.themes;
  if (state.view === "archives") return state.settings.includeArchives ? state.data.archives : [];
  if (state.view === "cleanup") return state.data.archiveCleanup;
  if (state.view === "nongames") return state.data.nonGames;
  return getUninstalledRows();
}

function getUninstalledRows() {
  return state.data.externalGames.filter((r) => {
    if (r["Installed Check"] === "Verified Installed") return false;
    if (matchesIgnore(r)) return false;
    if (matchesHidden(r)) return false;
    if (!rowAllowedByPathSettings(r)) return false;
    return true;
  });
}

function settingsWatchRootList() {
  return String(state.settings.watchRoots || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function rowAllowedByPathSettings(row) {
  const path = String(row.Path || row["Example Path"] || "").trim();
  if (!path) return true;
  const roots = settingsWatchRootList();
  if (roots.length > 0) {
    const okRoot = roots.some((root) => path.startsWith(root));
    if (!okRoot) return false;
  }
  const depth = Number(state.settings.maxDepth || DEFAULT_SETTINGS.maxDepth);
  if (Number.isFinite(depth) && depth > 0) {
    const d = path.split("/").filter(Boolean).length;
    if (d > depth) return false;
  }
  return true;
}

function applyFilters(rows) {
  return rows.filter((row) => {
    if (!rowAllowedByPathSettings(row)) return false;
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
    uninstalled_games: "Uninstalled Games",
    uninstalled_packages: "Uninstalled Packages",
    all_packages: "All Packages",
    external_uninstalled: "Uninstalled Games",
    installed: "Installed on PS4",
    installed_dlc: "Installed DLC on PS4",
    updates_pending: "Updates Pending",
    external: "All Packages",
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
      setUnifiedUninstalledSelection(row, tr.dataset.key || "");
      const id = extractRowId(row);
      if (id) {
        try {
          await navigator.clipboard?.writeText(id);
        } catch {}
      }
      renderExternalUninstalledCard();
      renderUninstalledCard();
      renderVisualUninstalledCard();
      renderSelectionActions();
    });
    tr.addEventListener("dblclick", async () => {
      const row = rows[Number(tr.dataset.idx)];
      await maybeOpenRowInFinder(row);
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
  if (/(backport|fix(?:ed)?)/.test(s)) return "backport";
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
  const cusa = String(row.CUSA || row["Title ID"] || "").toUpperCase().trim();
  const thumb = thumbForRow(row);
  const typeSummary = String(row["Package Types Found"] || "-");
  const biggest = packages.length ? Math.max(...packages.map((p) => Number(p.sizeGb) || 0)) : 0;
  const hints = [...new Set(packages.flatMap((p) => (p.versionHint && p.versionHint !== "-" ? p.versionHint.split(", ").map((x) => x.trim()) : [])))];
  const hintsText = hints.length ? hints.slice(0, 8).join(", ") : "-";
  const hasGameSource = packages.some((p) => p.source === "game");
  const hasNonGameSource = packages.some((p) => p.source === "non_game");
  let classState = hasGameSource ? "game-labeled" : (hasNonGameSource ? "? (non-game-labeled)" : "?");
  if (!hasGameSource) {
    if (state.settings.ambiguousPolicy === "game") classState = "game-labeled (forced)";
    if (state.settings.ambiguousPolicy === "non_game") classState = "non-game-labeled (forced)";
  }
  const sortedPkgs = [...packages].sort((a, b) => (b.sizeGb - a.sizeGb) || a.file.localeCompare(b.file));
  const pkgRows = sortedPkgs.length
    ? sortedPkgs.map((p) => `<tr class="visual-pkg-row" data-path="${encodeURIComponent(p.path || "")}" title="Open in Finder">
        <td>${escapeHtml(p.type)}</td>
        <td class="cell-num">${Number(p.sizeGb).toFixed(2)}</td>
        <td title="${escapeHtml(p.file)}">${escapeHtml(p.file)}</td>
        <td>${escapeHtml(p.drive || "-")}</td>
        <td>${escapeHtml(p.versionHint)}</td>
      </tr>`).join("")
    : `<tr><td colspan="5">No package rows found for this title in external scan.</td></tr>`;
  const miniThumbHtml = (thumb.primary || thumb.secondary)
    ? `<img class="visual-details-thumb-img" src="${escapeHtml(thumb.primary || thumb.secondary)}" data-fallback="${escapeHtml(thumb.secondary || "")}" alt="${escapeHtml(title)}" loading="lazy" onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.onerror=null;this.style.display='none';this.parentElement.querySelector('.visual-details-thumb-fallback').style.display='flex';}" />
       <div class="visual-details-thumb-fallback" style="display:none">${escapeHtml(cusa || "CUSA")}</div>`
    : `<div class="visual-details-thumb-fallback">${escapeHtml(cusa || "CUSA")}</div>`;
  return `<div class="visual-details">
    <div class="visual-details-top">
      <strong class="visual-details-title">${escapeHtml(title)}</strong>
      <div class="visual-details-thumb">${miniThumbHtml}</div>
    </div>
    <div class="visual-details-grid">
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
  el.visualDetailsBody.querySelectorAll("tr.visual-pkg-row").forEach((tr) => {
    tr.addEventListener("click", async () => {
      const raw = String(tr.dataset.path || "");
      const path = raw ? decodeURIComponent(raw) : "";
      if (!path) return;
      await openRowInFinder({ Path: path });
    });
  });
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
      setUnifiedUninstalledSelection(row, nextKey);
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
      renderUninstalledCard();
      renderSelectionActions();
    });
    tile.addEventListener("dblclick", async () => {
      const row = rows[Number(tile.dataset.idx)];
      await maybeOpenRowInFinder(row);
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
    notify("This row has no valid .pkg path to extract icon from.", "warn");
    return;
  }
  if (!state.apiEnabled) {
    notify("Icon extraction requires API mode (start mission-control/server.py).", "warn", 4500);
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
    notify(`Icon extracted for ${payload.cusa || cusa}.`, "success");
  } catch (err) {
    notify(`Extract image failed: ${err.message}`, "error", 4500);
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
      const cells = keys
        .map((k) => `<td class="${cellClassesForKey(k)}">${renderCell(k, row[k])}</td>`)
        .join("");
      const selectedClass = state.uninstalledCard.selectedRowKey === rowKey ? "row-selected" : "";
      return `<tr class="row-clickable ${selectedClass}" data-idx="${idx}" data-key="${escapeHtml(rowKey)}">${cells}</tr>`;
    })
    .join("");
  el.uninstalledTbody.querySelectorAll("tr.row-clickable").forEach((tr) => {
    tr.addEventListener("click", async () => {
      const row = rows[Number(tr.dataset.idx)];
      setUnifiedUninstalledSelection(row, tr.dataset.key || "");
      const id = extractRowId(row);
      if (id) {
        try {
          await navigator.clipboard?.writeText(id);
        } catch {}
      }
      renderUninstalledCard();
      renderVisualUninstalledCard();
      renderSelectionActions();
    });
    tr.addEventListener("dblclick", async () => {
      const row = rows[Number(tr.dataset.idx)];
      await maybeOpenRowInFinder(row);
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

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToPs4WithRetry(path) {
  if (state.settings.requireOnlinePreflight) {
    if (!state.ps4Status?.online) throw new Error("PS4 appears offline (GoldHEN status)");
    if (!state.rpiStatus?.online) throw new Error("RPI appears offline");
  }
  const attempts = Math.max(1, Number(state.settings.sendRetries || 0) + 1);
  const backoff = Math.max(100, Number(state.settings.sendBackoffMs || 900));
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch("/api/send-to-ps4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, ip: state.settings.ps4Ip, rpi_port: state.settings.rpiPort }),
      });
      const payload = await res.json();
      if (!payload.ok) throw new Error(payload.error || payload.body || "send failed");
      return payload;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleepMs(backoff * (i + 1));
    }
  }
  throw lastErr || new Error("send failed");
}

async function sendSelectedUninstalledToPs4() {
  const rows = uninstalledCardRows();
  const row = getSelectedUninstalledRow(rows);
  if (!row) {
    notify("Select a row in Uninstalled Games first.", "warn");
    return;
  }
  const path = extractRowPath(row);
  if (!path || !path.toLowerCase().endsWith(".pkg")) {
    notify("Selected row is not a .pkg file path.", "warn");
    return;
  }
  if (!state.apiEnabled) {
    notify("Send to PS4 requires API mode (start mission-control/server.py).", "warn", 4500);
    return;
  }
  if (state.settings.confirmBeforeSend) {
    const ok = confirmAction("send", `Send this package to PS4?\n\n${path}`);
    if (!ok) return;
  }
  const btn = el.sendToPs4Btn;
  const prev = btn?.textContent || SEND_BUTTON_LABEL;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending...";
  }
  try {
    const payload = await sendToPs4WithRetry(path);
    if (payload.queued) {
      await refreshSendJobs();
      notify(`Queued sender job ${payload.jobId} for PS4 (beta send path).`, "success");
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
    notify(`Sent to PS4 (Beta) (${payload.bytes || 0} bytes).${bodyInfo}`, "success", 3800);
  } catch (err) {
    notify(`Send to PS4 (Beta) failed: ${err.message}`, "error", 4500);
  } finally {
    if (btn) {
      btn.textContent = prev;
      updateSendToPs4Button(rows);
    }
    renderSelectionActions();
  }
}

async function sendSelectedExtUninstalledToPs4() {
  const rows = (state.data.externalUninstalled || []).filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  const row = getSelectedExtUninstalledRow(rows);
  if (!row) {
    notify("Select a row in Drive Scan Uninstalled first.", "warn");
    return;
  }
  const path = extractRowPath(row);
  if (!path || !path.toLowerCase().endsWith(".pkg")) {
    notify("Selected row is not a .pkg file path.", "warn");
    return;
  }
  if (!state.apiEnabled) {
    notify("Send to PS4 requires API mode (start mission-control/server.py).", "warn", 4500);
    return;
  }
  if (state.settings.confirmBeforeSend) {
    const ok = confirmAction("send", `Send this package to PS4?\n\n${path}`);
    if (!ok) return;
  }
  const btn = el.extSendToPs4Btn;
  const prev = btn?.textContent || SEND_BUTTON_LABEL;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending...";
  }
  try {
    const payload = await sendToPs4WithRetry(path);
    if (payload.queued) {
      await refreshSendJobs();
      notify(`Queued sender job ${payload.jobId} for PS4 (beta send path).`, "success");
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
    notify(`Sent to PS4 (Beta) (${payload.bytes || 0} bytes).${bodyInfo}`, "success", 3800);
  } catch (err) {
    notify(`Send to PS4 (Beta) failed: ${err.message}`, "error", 4500);
  } finally {
    if (btn) {
      btn.textContent = prev;
      updateExtSendToPs4Button(rows);
    }
    renderSelectionActions();
  }
}

async function sendSelectedVisualUninstalledToPs4() {
  const rows = (state.data.externalUninstalled || []).filter((r) => (r.Installed || "").toLowerCase() !== "installed");
  const row = getSelectedVisualUninstalledRow(rows);
  if (!row) {
    notify("Select a tile in Drive Scan Uninstalled (Visual) first.", "warn");
    return;
  }
  const path = extractRowPath(row);
  if (!path || !path.toLowerCase().endsWith(".pkg")) {
    notify("Selected tile is not a .pkg file path.", "warn");
    return;
  }
  if (!state.apiEnabled) {
    notify("Send to PS4 requires API mode (start mission-control/server.py).", "warn", 4500);
    return;
  }
  if (state.settings.confirmBeforeSend) {
    const ok = confirmAction("send", `Send this package to PS4?\n\n${path}`);
    if (!ok) return;
  }
  const btn = el.visualSendToPs4Btn;
  const prev = btn?.textContent || SEND_BUTTON_LABEL;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending...";
  }
  try {
    const payload = await sendToPs4WithRetry(path);
    if (payload.queued) {
      await refreshSendJobs();
      notify(`Queued sender job ${payload.jobId} for PS4 (beta send path).`, "success");
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
    notify(`Sent to PS4 (Beta) (${payload.bytes || 0} bytes).${bodyInfo}`, "success", 3800);
  } catch (err) {
    notify(`Send to PS4 (Beta) failed: ${err.message}`, "error", 4500);
  } finally {
    if (btn) {
      btn.textContent = prev;
      updateVisualSendToPs4Button(rows);
    }
    renderSelectionActions();
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
      body: JSON.stringify({ task_ids: ids, ip: state.settings.ps4Ip, rpi_port: state.settings.rpiPort }),
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

function confirmAction(kind, message) {
  if (kind === "send" && !state.settings.confirmBeforeSend) return true;
  if ((kind === "bulk" || kind === "destructive") && !state.settings.confirmBulkActions) return true;
  return window.confirm(message);
}

function notify(message, kind = "info", ttlMs = 3000) {
  const text = String(message || "").trim();
  if (!text) return;
  if (!el.toastStack) {
    alert(text);
    return;
  }
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.textContent = text;
  el.toastStack.appendChild(node);
  window.setTimeout(() => {
    node.remove();
  }, Math.max(1200, Number(ttlMs) || 3000));
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
      const cells = keys
        .map((k) => `<td class="${cellClassesForKey(k)}">${renderCell(k, row[k])}</td>`)
        .join("");
      const selectedClass = state.selectedRowKey === rowKey ? "row-selected" : "";
      return `<tr class="row-clickable ${selectedClass}" data-idx="${idx}" data-key="${escapeHtml(rowKey)}">${cells}</tr>`;
    })
    .join("");

  el.mainTbody.querySelectorAll("tr.row-clickable").forEach((tr) => {
    tr.addEventListener("click", async () => {
      const row = rows[Number(tr.dataset.idx)];
      state.selectedRowKey = tr.dataset.key || "";
      if (["uninstalled_games", "uninstalled_packages", "all_packages", "external_uninstalled", "external"].includes(state.view)) {
        setUnifiedUninstalledSelection(row, tr.dataset.key || "");
      }
      const id = extractRowId(row);
      if (id) {
        try {
          await navigator.clipboard?.writeText(id);
        } catch {}
      }
      closeInspector();
      renderMainTable();
      renderSelectionActions();
    });
    tr.addEventListener("dblclick", async () => {
      const row = rows[Number(tr.dataset.idx)];
      await maybeOpenRowInFinder(row);
    });
  });
}

function renderCell(key, val) {
  if (key === "Installed Check") {
    const raw = String(val || "");
    let cls = "warn";
    let label = "Check";
    const lower = raw.toLowerCase();
    if (lower.includes("verified installed")) {
      cls = "good";
      label = "Installed";
    } else if (lower.includes("likely installed")) {
      cls = "warn";
      label = "Likely Installed";
    } else if (lower.includes("not installed")) {
      cls = "bad";
      label = "Not Installed";
    } else if (lower.includes("mismatch")) {
      cls = "bad";
      label = "Mismatch";
    }
    return `<span class="status-chip ${cls}" title="${escapeHtml(raw)}">${escapeHtml(label)}</span>`;
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

function cellClassesForKey(key) {
  const classes = [];
  if (isNumericCol(key)) classes.push("cell-num");
  const lower = String(key || "").toLowerCase();
  if (lower.includes("path")) classes.push("cell-path");
  if (lower === "file") classes.push("cell-file");
  if (lower.includes("installed check")) classes.push("cell-installed-check");
  return classes.join(" ");
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
  renderSettingsForm();
  setSettingsGroupFilter(state.settingsGroupFilter || "basic");
  document.body.classList.add("settings-open");
  el.settingsPanel.classList.add("open");
  el.settingsPanel.setAttribute("aria-hidden", "false");
  window.setTimeout(() => {
    const firstInput = el.settingsPanel.querySelector("input, select, button");
    if (firstInput && typeof firstInput.focus === "function") firstInput.focus();
  }, 0);
}

function closeSettings() {
  if (!el.settingsPanel) return;
  el.settingsPanel.classList.remove("open");
  el.settingsPanel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("settings-open");
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
    notify(`Open in Finder failed: ${err.message}`, "error", 4200);
  }
}

async function maybeOpenRowInFinder(row) {
  if (!state.settings.enableFinderDblClick) return;
  await openRowInFinder(row);
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
  if (!confirmAction("bulk", `Clear ${arr.length} ${type} item(s)?`)) return;

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
  if (!rows.length) return false;
  const headers = pickExportHeaders(rows);
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
  return true;
}

function exportUninstalledCard() {
  const rows = uninstalledCardRows();
  if (!rows.length) return;
  const headers = pickExportHeaders(rows);
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

function pickExportHeaders(rows) {
  const headers = Object.keys(rows[0] || {});
  if (state.settings.exportProfile !== "minimal") return headers;
  const preferred = ["Title", "CUSA", "Title ID", "Size (GB)", "Installed Check", "Path", "Example Path", "Drive", "Drive(s)"];
  const presentPreferred = preferred.filter((h) => headers.includes(h));
  return presentPreferred.length ? presentPreferred : headers;
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
  if (!el.namingConventions) return;
  const conventions = [
    { type: "Base Game", hint: "a0100-v0100, [BASE], fullgame, game" },
    { type: "Update/Patch", hint: "update, patch, [UPD], _upd_, .upd., v1.xx" },
    { type: "Backport/Fix", hint: "backport, fix, fixed" },
    { type: "DLC/Add-on", hint: "dlc, addon/add-on, ulc, expansion, season pass, costume, pack" },
    { type: "Theme", hint: "theme, dynamic_theme, dynamic theme" },
    { type: "CUSA Match", hint: "CUSA##### in filename/path is strongest ID signal" },
    { type: "VR Signal", hint: "PSVR/VR/title hints are used for VR tagging (plus title DB hints)" },
    { type: "Unknown", hint: "If no strong signals: stays unknown or ? based on policy" },
  ];
  el.namingConventions.innerHTML = `
    <table class="naming-table">
      <thead><tr><th>Type</th><th>Filename Signals</th></tr></thead>
      <tbody>
        ${conventions.map((r) => `<tr><td>${escapeHtml(r.type)}</td><td><code>${escapeHtml(r.hint)}</code></td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderPalette() {
  const q = (el.paletteInput.value || "").toLowerCase().trim();
  const actions = [
    { label: "View Uninstalled Games", run: () => setView("uninstalled_games") },
    { label: "View Uninstalled Packages", run: () => setView("uninstalled_packages") },
    { label: "View All Packages", run: () => setView("all_packages") },
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
  state.view = normalizeViewId(v);
  el.chips.forEach((c) => c.classList.toggle("active", c.dataset.view === state.view));
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
