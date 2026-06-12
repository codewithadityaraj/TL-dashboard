/* ==========================================================================
   TL DASHBOARD — app.js
   Credential-based, per-TL data view. Shows the logged-in TL's own data
   + their BDEs. Powered by same Google Sheets CSVs as GM dashboard.
   ========================================================================== */

// ==========================================
// TL CREDENTIALS
// ==========================================
const TL_USERS = {
  abhishekmishra: { password: 'Abhishek@2432', displayName: 'Abhishek Mishra' },
  adnan: { password: 'Adnan@5672', displayName: 'Adnan' },
  aman: { password: 'Aman@4533', displayName: 'Aman' },
  ashish: { password: 'Ashish@4523', displayName: 'Ashish' },
  ashutosh: { password: 'Ashutosh@4562', displayName: 'Ashutosh' },
  bhavya: { password: 'Bhavya@3452', displayName: 'Bhavya' },
  ibrahim: { password: 'Ibrahim@3424', displayName: 'Ibrahim' },
  neetu: { password: 'Neetu@4324', displayName: 'Neetu' },
  numaan: { password: 'Numaan@2423', displayName: 'Numaan' },
  piyush: { password: 'Piyush@5323', displayName: 'Piyush' },
  shailendra: { password: 'Shailendra@4353', displayName: 'Shailendra' },
  simran: { password: 'Simran@5232', displayName: 'Simran' },
  sudhanshu: { password: 'Sudhanshu@5243', displayName: 'Sudhanshu' },
};

// ==========================================
// GLOBAL STATE
// ==========================================
let currentUser = null;       // username key
let currentTLName = null;     // display name from TL_USERS (used for sheet matching)

let activeView = 'overview';

let activeFilters = {
  program: 'ALL',
  bde: 'ALL',
  dateFrom: '',
  dateTo: ''
};

let charts = {};
let userSelectedDate = false;
let lastAppliedDateOption = 'custom';

// ==========================================
// SHEETS API ENDPOINTS
// ==========================================
const SHEETS_API = {
  productivity: '/api/sheets?sheet=productivity',
  revenueToken: '/api/sheets?sheet=revenue-token',
  revenueFull: '/api/sheets?sheet=revenue-full',
  bdTargets: '/api/sheets?sheet=bd-targets',
  tlTargets: '/api/sheets?sheet=tl-targets',
  cohortTargets: '/api/sheets?sheet=cohort-targets',
};

const DEFAULT_SHEET_URLS = {
  leads: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQe0m4OUvApuACPrN8jWN7twZuoGgZA3jj3ZU9Adp1C5LTe_8DZD7rseDmtxoaE7poMn7CMd4nVxyoZ/pub?gid=1770292739&single=true&output=csv',
  productivity: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT6_Ukl-_qTeyobt1Q3SpgXhR0921qgUWrz6WPnINvl3U2OXl1dcsjEyGgMafUmG_cb9rE6QNrWZkuX/pub?gid=948739317&single=true&output=csv',
  revenueToken: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=0&single=true&output=csv',
  revenueFull: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=1494867608&single=true&output=csv',
};

let sheetConfig = null;
let sheetConfigPromise = null;

async function loadSheetConfig() {
  if (sheetConfig) return sheetConfig;
  if (!sheetConfigPromise) {
    sheetConfigPromise = fetch('/api/config')
      .then(r => r.ok ? r.json() : { ...DEFAULT_SHEET_URLS })
      .catch(() => ({ ...DEFAULT_SHEET_URLS }))
      .then(cfg => { sheetConfig = { ...DEFAULT_SHEET_URLS, ...cfg }; return sheetConfig; });
  }
  return sheetConfigPromise;
}

// CSV data state
let laAllRows = [];
let laLoaded = false;
let laLoading = false;
const CSV_LEAD_VIEWS = ['lead-analysis', 'leads'];
const TOKEN_REVENUE_RATE = 5000;
let prodAllRows = [];
let prodLoaded = false;
let prodLoading = false;
let revTokenRows = [];
let revFullRows = [];
let revLoaded = false;
let revLoading = false;
let bdTargetRows = [];
let bdTargetLoaded = false;
let cohortTargetRows = [];
let cohortLoaded = false;
let tlTargetRows = [];
let tlTargetLoaded = false;

// ==========================================
// UTILITY HELPERS
// ==========================================
function isNonBlank(val) { return val != null && String(val).trim() !== ''; }

function normTeamName(name) { return (name || '').trim().toLowerCase(); }

function normTlMatch(a, b) {
  const na = normTeamName(a);
  const nb = normTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.startsWith(nb + ' ') || nb.startsWith(na + ' ')) return true;
  const stripDirect = s => s.replace(/\s+direct$/, '');
  return stripDirect(na) === stripDirect(nb);
}

function normEmail(email) { return (email || '').trim().toLowerCase(); }

function emailToDisplayName(email) {
  if (!email || !email.includes('@')) return email || '—';
  const local = (email.split('@')[0] || '').trim();
  const first = (local.split('.')[0] || local).trim();
  if (!first) return email;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function fCurrency(n) {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + ' K';
  return '₹' + n.toLocaleString('en-IN');
}

function fNum(n) { return n.toLocaleString('en-IN'); }

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function emptyRow(tbody, cols) {
  tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols}">No data for selected filters</td></tr>`;
}

function formatTalkHrs(minutes) { return `${(minutes / 60).toFixed(1)}h`; }

function formatTargetNum(n) { return Number.isInteger(n) ? fNum(n) : n.toFixed(1); }

function parseSheetDate(val) {
  if (!val || !String(val).trim()) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const parts = s.split('/');
  if (parts.length === 3) {
    const mm = parts[0].padStart(2, '0');
    const dd = parts[1].padStart(2, '0');
    let yy = parts[2].trim();
    if (yy.length === 2) yy = '20' + yy;
    return `${yy}-${mm}-${dd}`;
  }
  return '';
}

function parseNum(val) {
  const n = parseFloat(String(val ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function rateBadge(pct) {
  if (pct >= 38) return `<span class="badge badge-green">${pct}%</span>`;
  if (pct >= 25) return `<span class="badge badge-amber">${pct}%</span>`;
  return `<span class="badge badge-red">${pct}%</span>`;
}

function updateLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  if (currentUser && (prodLoading || revLoading || laLoading)) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function usesCSVLeadData() { return CSV_LEAD_VIEWS.includes(activeView) && laLoaded; }
function usesCSVProdData() { return activeView === 'productivity' && prodLoaded; }
function usesCSVRevData() { return (activeView === 'revenue' || activeView === 'overview') && revLoaded; }
function isCSVFilterView(viewId) {
  return CSV_LEAD_VIEWS.includes(viewId) || viewId === 'productivity' || viewId === 'revenue' || viewId === 'overview';
}
function viewUsesLeadCSV() { return CSV_LEAD_VIEWS.includes(activeView) || activeView === 'overview'; }

// ==========================================
// TL-SCOPED DATA MATCHING
// The logged-in TL's name is matched against
// Manager Name (productivity), TL Name (leads/revenue)
// ==========================================
function tlRowMatchesMe(managerOrTlField) {
  return normTlMatch(managerOrTlField, currentTLName);
}

// ==========================================
// AUTH
// ==========================================
const SESSION_KEY = 'tl_dashboard_user';

function saveSession(username) { localStorage.setItem(SESSION_KEY, username); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

function getSavedSession() {
  const username = localStorage.getItem(SESSION_KEY);
  if (!username) return null;
  const key = username.trim().toLowerCase();
  return TL_USERS[key] ? key : null;
}

function showDashboard() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app-layout').style.display = 'grid';
}

function showLoginScreen() {
  document.getElementById('app-layout').style.display = 'none';
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.style.display = 'flex';
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

function handleLogin() {
  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  if (TL_USERS[username] && TL_USERS[username].password === password) {
    errorEl.classList.remove('show');
    currentUser = username;
    currentTLName = TL_USERS[username].displayName;
    saveSession(username);
    initDashboard();
    showDashboard();
  } else {
    errorEl.classList.add('show');
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
  }
}

function handleLogout() {
  clearSession();
  window.location.reload();
}

function restoreSession() {
  const username = getSavedSession();
  if (!username) return false;
  currentUser = username;
  currentTLName = TL_USERS[username].displayName;
  initDashboard();
  showDashboard();
  return true;
}

// ==========================================
// DASHBOARD INIT
// ==========================================
function initDashboard() {
  const displayName = TL_USERS[currentUser]?.displayName || 'TL';

  // Sidebar + nav labels
  document.getElementById('tl-dashboard-label').textContent = displayName + "'s Dashboard";
  document.getElementById('sidebar-avatar').textContent = displayName.charAt(0).toUpperCase();
  document.getElementById('sidebar-username').textContent = displayName;

  // Reset filters
  activeFilters.program = 'ALL';
  activeFilters.bde = 'ALL';

  // Set today as default date
  userSelectedDate = true;
  lastAppliedDateOption = 'today';
  const toISODate = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  const todayStr = toISODate(new Date());
  activeFilters.dateFrom = todayStr;
  activeFilters.dateTo = todayStr;
  document.getElementById('date-from').value = todayStr;
  document.getElementById('date-to').value = todayStr;
  const filterDateEl = document.getElementById('filter-date');
  if (filterDateEl) filterDateEl.value = 'today';
  updateDateDisplayLabel();

  // Preload CSVs
  if (!prodLoaded && !prodLoading) fetchProductivityCSV();
  if (!revLoaded && !revLoading) fetchRevenueCSV();
  if (!laLoaded && !laLoading) fetchLeadCSV();

  switchView('overview');
}

// ==========================================
// SIDEBAR TEAM (BDEs under logged-in TL)
// ==========================================
function renderSidebarTeam() {
  const teamList = document.getElementById('sidebar-team-list');
  if (!teamList) return;
  teamList.innerHTML = '';

  const bdeSet = new Set();

  if (prodLoaded) {
    prodAllRows.forEach(r => {
      if (tlRowMatchesMe(r.manager) && r.owner) bdeSet.add(r.owner);
    });
  }
  if (laLoaded) {
    laAllRows.forEach(r => {
      if (tlRowMatchesMe(r.tl) && r.owner) bdeSet.add(r.owner);
    });
  }

  const bdes = [...bdeSet].sort();
  if (bdes.length === 0) {
    teamList.innerHTML = '<div class="team-empty">No team data loaded yet</div>';
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'team-bde-list';
  bdes.forEach(b => {
    const pill = document.createElement('span');
    pill.className = 'team-bde-pill';
    pill.title = b;
    pill.textContent = emailToDisplayName(b);
    wrap.appendChild(pill);
  });
  teamList.appendChild(wrap);
}

// ==========================================
// NAVIGATION
// ==========================================
const VIEW_TITLES = {
  overview: 'Overview',
  revenue: 'Revenue',
  productivity: 'Productivity',
  leads: 'Lead Report',
  'lead-analysis': 'Lead Analysis'
};

function switchView(viewId) {
  activeView = viewId;

  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById(`nav-${viewId}`);
  if (navEl) navEl.classList.add('active');

  document.querySelectorAll('.viewport-section').forEach(el => el.classList.remove('active'));
  const sectionEl = document.getElementById(`view-${viewId}`);
  if (sectionEl) sectionEl.classList.add('active');

  document.getElementById('page-title').textContent = VIEW_TITLES[viewId] || viewId;
  document.getElementById('sidebar').classList.remove('mobile-open');

  // Repopulate dropdowns for the view
  if (CSV_LEAD_VIEWS.includes(viewId) && laLoaded) populateLAGlobalFilters();
  if (viewId === 'productivity' && prodLoaded) populateProdGlobalFilters();
  if ((viewId === 'revenue' || viewId === 'overview') && revLoaded) populateRevGlobalFilters();

  renderActiveView();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
}

function renderActiveView() {
  switch (activeView) {
    case 'overview': renderOverview(); break;
    case 'revenue': renderRevenue(); break;
    case 'productivity': renderProductivity(); break;
    case 'leads': renderLeads(); break;
    case 'lead-analysis': renderLeadAnalysis(); break;
  }
}

// ==========================================
// FILTER APPLY — Program → BDE only
// ==========================================
function applyFilters() {
  const prevProgram = activeFilters.program;

  activeFilters.program = document.getElementById('filter-program').value;
  activeFilters.bde = document.getElementById('filter-bde').value;
  activeFilters.dateFrom = document.getElementById('date-from').value;
  activeFilters.dateTo = document.getElementById('date-to').value;

  // Cascade: program changed → reset BDE
  if (activeFilters.program !== prevProgram) {
    activeFilters.bde = 'ALL';
    document.getElementById('filter-bde').value = 'ALL';

    if (usesCSVProdData()) { populateProdBDEs(); }
    else if (usesCSVLeadData()) { populateLABDEs(); }
    else if (usesCSVRevData()) { populateRevBDEs(); }
  }

  renderSidebarTeam();
  renderActiveView();
}

// ==========================================
// REVENUE DATA HELPERS
// ==========================================
function mapTokenRow(obj) {
  return {
    gm: (obj['GM'] || obj['GM Name'] || '').trim(),
    type: (obj['Type'] || obj['Program'] || '').trim(),
    cohortName: (obj['Cohort Name'] || '').trim(),
    tl: (obj['TL Name '] || obj['TL Name'] || obj['TL'] || '').trim(),
    bdMail: (obj['BD Mail'] || obj['BD Email'] || obj['BD Mail '] || '').trim(),
    tokenDate: parseSheetDate(obj['Token date'] || obj['Token Date']),
    tokenAmount: parseNum(obj['Token Amount']),
    candidate: obj['Candidate name'] || obj['Candidate Name'] || '',
  };
}

function mapFullPayRow(obj) {
  return {
    gm: (obj['GM'] || obj['GM Name'] || '').trim(),
    type: (obj['Type'] || obj['Program'] || '').trim(),
    cohortName: (obj['Cohort Name'] || '').trim(),
    tl: (obj['TL Name '] || obj['TL Name'] || obj['TL'] || '').trim(),
    bdMail: (obj['BD Mail'] || obj['BD Email'] || obj['BD Mail '] || '').trim(),
    fullPayDate: parseSheetDate(obj['Full payment date'] || obj['Full Payment Date']),
    amountPaid: parseNum(obj['Amount Paid']),
    candidate: obj['Candidate name'] || obj['Candidate Name'] || '',
  };
}

function mapTlTargetRow(obj) {
  return {
    managerName: (obj['Manager Name'] || obj['TL Name'] || obj['TL'] || '').trim(),
    programName: (obj['Program Name'] || obj['Program'] || '').trim(),
    startDate: parseSheetDate(obj['Cohort Start Date'] || obj['Start Date']),
    endDate: parseSheetDate(obj['Cohort End Date'] || obj['End Date']),
    monthTokenTarget: parseNum(obj['Month Token Target'] || obj['Token Target']),
    monthEnrollmentTarget: parseNum(obj['Month Enrollment Target'] || obj['Enrollment Target']),
  };
}

function mapBdTargetRow(obj) {
  return {
    agentName: (obj['Agent Name'] || obj['BDA Name'] || obj['BD Name'] || '').trim(),
    agentEmail: (obj['Agent Email ID'] || obj['Agent Email'] || obj['BD Email'] || obj['BD Mail'] || '').trim().toLowerCase(),
    programName: (obj['Program Name'] || obj['Program'] || '').trim(),
    managerName: (obj['Manager Name'] || obj['TL Name'] || obj['TL'] || '').trim(),
    gmName: (obj['GM Name'] || obj['GM'] || '').trim(),
    startDate: parseSheetDate(obj['Cohort Start Date'] || obj['Start Date']),
    endDate: parseSheetDate(obj['Cohort End Date'] || obj['End Date']),
    monthTokenTarget: parseNum(obj['Month Token Target'] || obj['Token Target']),
    monthEnrollmentTarget: parseNum(obj['Month Enrollment Target'] || obj['Enrollment Target']),
  };
}

function mapCohortRow(obj) {
  return {
    programName: (obj['Program Name'] || '').trim(),
    cohortName: (obj['Cohort Name'] || '').trim(),
    startDate: parseSheetDate(obj['Cohort Start Date']),
    endDate: parseSheetDate(obj['Cohort End Date']),
    cohortTarget: parseNum(obj['Cohort Target']),
    gmTarget: parseNum(obj['GM Target']),
    gm: (obj['GM'] || '').trim(),
  };
}

// Match rows to logged-in TL
function revRowMatchesTL(row) { return tlRowMatchesMe(row.tl); }

function revMatchesFilters(row, dateField) {
  const dt = row[dateField];
  const inDate = (!activeFilters.dateFrom || dt >= activeFilters.dateFrom) &&
    (!activeFilters.dateTo || dt <= activeFilters.dateTo);
  const inTL = revRowMatchesTL(row);
  const inProgram = activeFilters.program === 'ALL' || row.type === activeFilters.program;
  const inBDE = activeFilters.bde === 'ALL' || row.bdMail === activeFilters.bde;
  return inDate && inTL && inProgram && inBDE;
}

function getRevTokenGlobalData() { return revTokenRows.filter(r => revMatchesFilters(r, 'tokenDate')); }
function getRevFullGlobalData() { return revFullRows.filter(r => revMatchesFilters(r, 'fullPayDate')); }
function getBaseRevTokens() { return getRevTokenGlobalData(); }
function getBaseRevFullPayments() { return getRevFullGlobalData(); }

function revAggTokens(rows) {
  return { count: rows.length, amount: rows.length * TOKEN_REVENUE_RATE };
}
function revAggFull(rows) {
  return { count: rows.length, amount: rows.reduce((s, r) => s + r.amountPaid, 0) };
}

function revGetFilterDateRange() {
  return { start: activeFilters.dateFrom || '', end: activeFilters.dateTo || activeFilters.dateFrom || '' };
}

function cohortDayCount(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate + 'T00:00:00');
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

function clampTargetDateStr(dateStr, minStr, maxStr) {
  if (!dateStr) return minStr || '';
  if (minStr && dateStr < minStr) return minStr;
  if (maxStr && dateStr > maxStr) return maxStr;
  return dateStr;
}

function oneDayBefore(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function calculateBdEnrollmentTarget(monthEnrollmentTarget, cohortStart, cohortEnd, filterStart, filterEnd) {
  if (!monthEnrollmentTarget || !cohortStart || !cohortEnd) return { target: 0, perDay: 0 };
  const perDay = monthEnrollmentTarget / 30;
  const fStart = filterStart || cohortStart;
  const fEnd = filterEnd || cohortEnd;
  if (fEnd < cohortStart || fStart > cohortEnd) return { target: 0, perDay };
  const effectiveStart = clampTargetDateStr(fStart, cohortStart, cohortEnd);
  const effectiveEnd = clampTargetDateStr(fEnd, cohortStart, cohortEnd);
  const elapsedDays = cohortDayCount(effectiveStart, effectiveEnd);
  return {
    target: Math.round(perDay * elapsedDays * 10) / 10,
    perDay: Math.round(perDay * 100) / 100,
  };
}

function calculateBdaPastDeficit(monthEnrollmentTarget, cohortStart, cohortEnd, filterStart, pastActual) {
  if (!monthEnrollmentTarget || !cohortStart || !cohortEnd || !filterStart) return 0;
  const basePerDay = monthEnrollmentTarget / 30;
  const pastEnd = oneDayBefore(filterStart);
  if (pastEnd < cohortStart) return 0;
  const effectivePastStart = clampTargetDateStr(cohortStart, cohortStart, cohortEnd);
  const effectivePastEnd = clampTargetDateStr(pastEnd, cohortStart, cohortEnd);
  const pastDays = cohortDayCount(effectivePastStart, effectivePastEnd);
  const pastTarget = basePerDay * pastDays;
  return Math.max(0, Math.round((pastTarget - (pastActual || 0)) * 10) / 10);
}

function bdTargetRowsForEmail(email) {
  const emailNorm = normEmail(email);
  if (!emailNorm) return [];
  return bdTargetRows.filter(r => r.agentEmail === emailNorm);
}

function bdaPastActualEnrollments(email, fromDate, toDate, progFilter) {
  if (!email || !fromDate || !toDate || toDate < fromDate) return 0;
  const emailNorm = normEmail(email);
  return revFullRows.filter(r => {
    if (!r.fullPayDate) return false;
    if (normEmail(r.bdMail) !== emailNorm) return false;
    if (r.fullPayDate < fromDate || r.fullPayDate > toDate) return false;
    if (progFilter && progFilter !== 'ALL' && r.type !== progFilter) return false;
    return true;
  }).length;
}

function tlPastActualEnrollments(tlName, fromDate, toDate, progFilter) {
  if (!tlName || !fromDate || !toDate || toDate < fromDate) return 0;
  return revFullRows.filter(r => {
    if (!r.fullPayDate) return false;
    if (!normTlMatch(r.tl, tlName)) return false;
    if (r.fullPayDate < fromDate || r.fullPayDate > toDate) return false;
    if (progFilter && progFilter !== 'ALL' && r.type !== progFilter) return false;
    return true;
  }).length;
}

// TL (logged-in) target from TL Targets sheet
function revTlSheetTarget(programName) {
  if (!tlTargetLoaded) return { total: 0, perDay: 0 };
  const { start, end } = revGetFilterDateRange();
  const progFilter = activeFilters.program !== 'ALL' ? activeFilters.program : '';
  let total = 0, perDay = 0;
  tlTargetRows.forEach(row => {
    if (!normTlMatch(row.managerName, currentTLName)) return;
    if (programName && row.programName !== programName) return;
    if (progFilter && row.programName !== progFilter) return;
    const r = calculateBdEnrollmentTarget(row.monthEnrollmentTarget, row.startDate, row.endDate, start, end);
    total += r.target;
    perDay += r.perDay;
  });
  return { total, perDay };
}

function revTlSheetTokenTarget(programName) {
  if (!tlTargetLoaded) return { total: 0, perDay: 0 };
  const { start, end } = revGetFilterDateRange();
  const progFilter = activeFilters.program !== 'ALL' ? activeFilters.program : '';
  let total = 0, perDay = 0;
  tlTargetRows.forEach(row => {
    if (!normTlMatch(row.managerName, currentTLName)) return;
    if (programName && row.programName !== programName) return;
    if (progFilter && row.programName !== progFilter) return;
    const r = calculateBdEnrollmentTarget(row.monthTokenTarget, row.startDate, row.endDate, start, end);
    total += r.target;
    perDay += r.perDay;
  });
  return { total, perDay };
}

function findTlTargetRow(programName) {
  if (!tlTargetLoaded || !programName) return null;
  const { start, end } = revGetFilterDateRange();
  const matches = tlTargetRows.filter(row => {
    if (!normTlMatch(row.managerName, currentTLName)) return false;
    if (row.programName !== programName) return false;
    if (!row.startDate || !row.endDate) return false;
    if (end < row.startDate || start > row.endDate) return false;
    return true;
  });
  return matches[0] || null;
}

function revTlCurrentDeficit() {
  if (!tlTargetLoaded) return { deficit: 0 };
  const progFilter = activeFilters.program !== 'ALL' ? activeFilters.program : '';
  const { start } = revGetFilterDateRange();
  let deficit = 0;
  tlTargetRows.forEach(row => {
    if (!normTlMatch(row.managerName, currentTLName)) return;
    if (progFilter && row.programName !== progFilter) return;
    const pastEnd = oneDayBefore(start);
    const pastActual = (pastEnd >= row.startDate)
      ? tlPastActualEnrollments(currentTLName, row.startDate, pastEnd, activeFilters.program)
      : 0;
    deficit += calculateBdaPastDeficit(
      row.monthEnrollmentTarget,
      row.startDate, row.endDate,
      start, pastActual
    );
  });
  return { deficit };
}

// BDA target from BD Targets sheet
function revBdSheetTarget(email, programName) {
  if (!bdTargetLoaded) return { total: 0, perDay: 0 };
  const { start, end } = revGetFilterDateRange();
  const progFilter = activeFilters.program !== 'ALL' ? activeFilters.program : '';
  const matches = bdTargetRowsForEmail(email);
  let total = 0, perDay = 0;
  matches.forEach(row => {
    if (programName && row.programName !== programName) return;
    if (progFilter && row.programName !== progFilter) return;
    const r = calculateBdEnrollmentTarget(row.monthEnrollmentTarget, row.startDate, row.endDate, start, end);
    total += r.target;
    perDay += r.perDay;
  });
  return { total, perDay };
}

function revBdSheetTokenTarget(email, programName) {
  if (!bdTargetLoaded) return { total: 0, perDay: 0 };
  const { start, end } = revGetFilterDateRange();
  const progFilter = activeFilters.program !== 'ALL' ? activeFilters.program : '';
  const matches = bdTargetRowsForEmail(email);
  let total = 0, perDay = 0;
  matches.forEach(row => {
    if (programName && row.programName !== programName) return;
    if (progFilter && row.programName !== progFilter) return;
    const r = calculateBdEnrollmentTarget(row.monthTokenTarget, row.startDate, row.endDate, start, end);
    total += r.target;
    perDay += r.perDay;
  });
  return { total, perDay };
}

function findBdTargetRow(email, programName) {
  if (!bdTargetLoaded || !email || !programName) return null;
  const { start, end } = revGetFilterDateRange();
  const matches = bdTargetRowsForEmail(email).filter(row => {
    if (row.programName !== programName) return false;
    if (!row.startDate || !row.endDate) return false;
    if (end < row.startDate || start > row.endDate) return false;
    return true;
  });
  return matches[0] || null;
}

function revBdCurrentDeficit(email) {
  if (!bdTargetLoaded) return { deficit: 0 };
  const progFilter = activeFilters.program !== 'ALL' ? activeFilters.program : '';
  const { start } = revGetFilterDateRange();
  const matches = bdTargetRowsForEmail(email);
  let deficit = 0;
  matches.forEach(row => {
    if (progFilter && row.programName !== progFilter) return;
    const pastEnd = oneDayBefore(start);
    const pastActual = (pastEnd >= row.startDate)
      ? bdaPastActualEnrollments(email, row.startDate, pastEnd, activeFilters.program)
      : 0;
    deficit += calculateBdaPastDeficit(
      row.monthEnrollmentTarget,
      row.startDate, row.endDate,
      start, pastActual
    );
  });
  return { deficit };
}

function revBdProgramsInScope(email) {
  if (!bdTargetLoaded || !email) return [];
  const { start, end } = revGetFilterDateRange();
  const progFilter = activeFilters.program !== 'ALL' ? activeFilters.program : '';
  const programs = new Set();
  bdTargetRowsForEmail(email).forEach(row => {
    if (progFilter && row.programName !== progFilter) return;
    if (!row.programName || !row.startDate || !row.endDate) return;
    if (end < row.startDate || start > row.endDate) return;
    programs.add(row.programName);
  });
  return [...programs].sort();
}

function targetCellHtml(value, perDay) {
  if (!value || value <= 0) return '<td class="col-num">—</td>';
  const title = perDay ? ` title="${formatTargetNum(perDay)}/day"` : '';
  return `<td class="col-num"${title}>${formatTargetNum(value)}</td>`;
}

// ==========================================
// REVENUE — Global filter population
// ==========================================
function populateRevGlobalFilters() {
  populateRevPrograms();
  populateRevBDEs();
}

function populateRevPrograms() {
  const sel = document.getElementById('filter-program');
  if (!sel) return;
  const tlTokenRows = revTokenRows.filter(r => tlRowMatchesMe(r.tl));
  const tlFullRows = revFullRows.filter(r => tlRowMatchesMe(r.tl));
  const types = [...new Set([
    ...tlTokenRows.map(r => r.type).filter(Boolean),
    ...tlFullRows.map(r => r.type).filter(Boolean),
    ...cohortTargetRows.map(r => r.programName).filter(Boolean),
  ])].sort();
  sel.innerHTML = '<option value="ALL">All Programs</option>';
  types.forEach(t => { const o = document.createElement('option'); o.value = o.textContent = t; sel.appendChild(o); });
  activeFilters.program = types.includes(activeFilters.program) ? activeFilters.program : 'ALL';
  sel.value = activeFilters.program;
}

function populateRevBDEs() {
  const sel = document.getElementById('filter-bde');
  if (!sel) return;
  let tokenPool = revTokenRows.filter(r => tlRowMatchesMe(r.tl));
  let fullPool = revFullRows.filter(r => tlRowMatchesMe(r.tl));
  if (activeFilters.program !== 'ALL') {
    tokenPool = tokenPool.filter(r => r.type === activeFilters.program);
    fullPool = fullPool.filter(r => r.type === activeFilters.program);
  }
  const bdes = [...new Set([
    ...tokenPool.map(r => r.bdMail),
    ...fullPool.map(r => r.bdMail),
  ].filter(Boolean))].sort();
  sel.innerHTML = '<option value="ALL">All BDEs</option>';
  bdes.forEach(b => {
    const o = document.createElement('option');
    o.value = b; o.textContent = emailToDisplayName(b);
    sel.appendChild(o);
  });
  activeFilters.bde = bdes.includes(activeFilters.bde) ? activeFilters.bde : 'ALL';
  sel.value = activeFilters.bde;
}

// ==========================================
// REVENUE CSV FETCH
// ==========================================
async function fetchRevenueCSV() {
  if (revLoading) return;
  revLoading = true;
  updateLoadingOverlay();
  setText('rev-total', '…');
  try {
    const [tokenResp, fullResp, bdTargetResp, tlTargetResp, cohortResp] = await Promise.all([
      fetch(SHEETS_API.revenueToken),
      fetch(SHEETS_API.revenueFull),
      fetch(SHEETS_API.bdTargets),
      fetch(SHEETS_API.tlTargets),
      fetch(SHEETS_API.cohortTargets),
    ]);

    if (!tokenResp.ok) throw new Error(`Token CSV HTTP ${tokenResp.status}`);
    if (!fullResp.ok) throw new Error(`Full Payment CSV HTTP ${fullResp.status}`);

    revTokenRows = parseCSV(await tokenResp.text()).map(mapTokenRow).filter(r => r.tokenDate);
    revFullRows = parseCSV(await fullResp.text()).map(mapFullPayRow).filter(r => r.fullPayDate);

    if (bdTargetResp.ok) {
      bdTargetRows = parseCSV(await bdTargetResp.text()).map(mapBdTargetRow).filter(r => (r.agentEmail || r.agentName) && r.startDate && r.endDate);
      bdTargetLoaded = true;
    } else {
      bdTargetRows = []; bdTargetLoaded = false;
    }

    if (tlTargetResp.ok) {
      tlTargetRows = parseCSV(await tlTargetResp.text()).map(mapTlTargetRow).filter(r => r.managerName && r.startDate && r.endDate);
      tlTargetLoaded = true;
    } else {
      tlTargetRows = []; tlTargetLoaded = false;
    }

    if (cohortResp.ok) {
      cohortTargetRows = parseCSV(await cohortResp.text()).map(mapCohortRow).filter(r => r.gm && r.startDate && r.endDate);
      cohortLoaded = true;
    } else {
      cohortTargetRows = []; cohortLoaded = false;
    }

    revLoaded = true;

    if (activeView === 'revenue' || activeView === 'overview') {
      if (!userSelectedDate) {
        const tlRevToken = revTokenRows.filter(r => tlRowMatchesMe(r.tl));
        const dates = tlRevToken.map(r => r.tokenDate).filter(Boolean).sort();
        if (dates.length) {
          activeFilters.dateFrom = dates[0];
          activeFilters.dateTo = dates[dates.length - 1];
          const dfEl = document.getElementById('date-from');
          const dtEl = document.getElementById('date-to');
          if (dfEl) dfEl.value = activeFilters.dateFrom;
          if (dtEl) dtEl.value = activeFilters.dateTo;
          const filterDateEl = document.getElementById('filter-date');
          if (filterDateEl) filterDateEl.value = 'custom';
          lastAppliedDateOption = 'custom';
          updateDateDisplayLabel();
        }
      }
      populateRevGlobalFilters();
      renderActiveView();
    }
  } catch (err) {
    console.error('Revenue CSV load error:', err);
    setText('rev-total', 'Error');
  } finally {
    revLoading = false;
    updateLoadingOverlay();
  }
}

// ==========================================
// REVENUE RENDER
// ==========================================
function renderRevenue() {
  if (!revLoaded) { fetchRevenueCSV(); return; }

  const tokenData = getBaseRevTokens();
  const fullData = getBaseRevFullPayments();
  const tokenAgg = revAggTokens(tokenData);
  const fullAgg = revAggFull(fullData);
  const totalRev = tokenAgg.amount + fullAgg.amount;

  setText('rev-total', fCurrency(totalRev));
  setText('rev-total-sub', 'collected');
  setText('rev-full', fNum(fullAgg.count));
  setText('rev-full-sub', fCurrency(fullAgg.amount));
  setText('rev-tokens', fNum(tokenAgg.count));
  setText('rev-tokens-sub', fCurrency(tokenAgg.amount));

  // Target achievement (vs TL targets)
  const { total: targetFull, perDay } = revTlSheetTarget();
  if (tlTargetLoaded && targetFull > 0) {
    const pct = Math.min(999, (fullAgg.count / targetFull) * 100);
    setText('rev-target-pct', `${pct.toFixed(1)}%`);
    setText('rev-target-sub', `${fNum(fullAgg.count)} of ${formatTargetNum(targetFull)} full${perDay ? ` · ${formatTargetNum(perDay)}/day` : ''}`);
  } else {
    setText('rev-target-pct', '—');
    setText('rev-target-sub', tlTargetLoaded ? 'No target for date range' : 'Loading targets…');
  }

  // Unit cards
  const tokenUnitsContainer = document.getElementById('rev-target-token-units');
  const enrollmentUnitsContainer = document.getElementById('rev-target-enrollment-units');
  if (tokenUnitsContainer) tokenUnitsContainer.innerHTML = '';
  if (enrollmentUnitsContainer) enrollmentUnitsContainer.innerHTML = '';

  const typeSet = new Set([
    ...tokenData.map(r => r.type).filter(Boolean),
    ...fullData.map(r => r.type).filter(Boolean),
  ]);
  if (activeFilters.bde !== 'ALL') {
    revBdProgramsInScope(activeFilters.bde).forEach(p => typeSet.add(p));
  }
  const types = [...typeSet].sort();

  types.forEach((type, idx) => {
    const tRows = tokenData.filter(r => r.type === type);
    const fRows = fullData.filter(r => r.type === type);
    const tAgg = revAggTokens(tRows);
    const fAgg = revAggFull(fRows);
    const bdTargetRow = activeFilters.bde !== 'ALL' ? findBdTargetRow(activeFilters.bde, type) : null;
    const tlTargetRow = findTlTargetRow(type);
    const cohort = bdTargetRow || tlTargetRow;

    let rawTokenTarget = 0, rawTokenPerDay = 0, rawEnrollTarget = 0, rawEnrollPerDay = 0;
    if (activeFilters.bde !== 'ALL') {
      ({ total: rawTokenTarget, perDay: rawTokenPerDay } = revBdSheetTokenTarget(activeFilters.bde, type));
      ({ total: rawEnrollTarget, perDay: rawEnrollPerDay } = revBdSheetTarget(activeFilters.bde, type));
    } else {
      ({ total: rawTokenTarget, perDay: rawTokenPerDay } = revTlSheetTokenTarget(type));
      ({ total: rawEnrollTarget, perDay: rawEnrollPerDay } = revTlSheetTarget(type));
    }

    const progTarget = Math.ceil(rawTokenTarget);
    const progPerDay = Math.ceil(rawTokenPerDay);
    const enrollTarget = Math.ceil(rawEnrollTarget);
    const enrollPerDay = Math.ceil(rawEnrollPerDay);
    const cohortDates = cohort ? `${cohort.startDate} → ${cohort.endDate}` : '';
    const accentClass = idx % 3 === 0 ? 'accent-indigo' : idx % 3 === 1 ? 'accent-emerald' : 'accent-purple';

    if (tokenUnitsContainer) {
      const tokenPct = progTarget ? Math.min(100, (tAgg.count / progTarget) * 100) : 0;
      const card = document.createElement('div');
      card.className = `target-card ${accentClass}`;
      card.innerHTML = `
        <div class="target-card-header">
          <span class="target-card-title">${type}</span>
          <span class="target-card-sub">Tokens Value: ${fCurrency(tAgg.amount)}${cohortDates ? ` · ${cohortDates}` : ''}</span>
        </div>
        <div class="target-progress-wrap">
          ${progTarget ? `<div class="target-progress-bar"><div class="target-progress-fill" style="width: ${tokenPct.toFixed(1)}%"></div></div>` : ''}
          <div class="target-progress-stats">
            <span>Achieved: ${tAgg.count} Tokens</span>
            <span>Target: ${formatTargetNum(progTarget)} (${formatTargetNum(progPerDay)}/day) · Progress: ${tokenPct.toFixed(1)}%</span>
          </div>
        </div>`;
      tokenUnitsContainer.appendChild(card);
    }

    if (enrollmentUnitsContainer) {
      const fullPct = enrollTarget ? Math.min(100, (fAgg.count / enrollTarget) * 100) : 0;
      const card = document.createElement('div');
      card.className = `target-card ${accentClass}`;
      card.innerHTML = `
        <div class="target-card-header">
          <span class="target-card-title">${type}</span>
          <span class="target-card-sub">Enrollments Value: ${fCurrency(fAgg.amount)}${cohortDates ? ` · ${cohortDates}` : ''}</span>
        </div>
        <div class="target-progress-wrap">
          ${enrollTarget ? `<div class="target-progress-bar"><div class="target-progress-fill" style="width: ${fullPct.toFixed(1)}%"></div></div>` : ''}
          <div class="target-progress-stats">
            <span>Achieved: ${fAgg.count} Full</span>
            <span>Target: ${formatTargetNum(enrollTarget)} (${formatTargetNum(enrollPerDay)}/day) · Progress: ${fullPct.toFixed(1)}%</span>
          </div>
        </div>`;
      enrollmentUnitsContainer.appendChild(card);
    }
  });

  if (types.length === 0) {
    if (tokenUnitsContainer) tokenUnitsContainer.innerHTML = '<div class="empty-row" style="grid-column: 1/-1;">No Token revenue data for selected filters</div>';
    if (enrollmentUnitsContainer) enrollmentUnitsContainer.innerHTML = '<div class="empty-row" style="grid-column: 1/-1;">No Full Enrollment revenue data for selected filters</div>';
  }

  // Top 3 BDAs podium
  const bdaPodiumContainer = document.getElementById('rev-podium-bdas');
  bdaPodiumContainer.innerHTML = '';
  const podiumBdeMap = {};
  tokenData.forEach(r => {
    if (!r.bdMail) return;
    if (!podiumBdeMap[r.bdMail]) podiumBdeMap[r.bdMail] = { tokens: [], type: r.type };
    podiumBdeMap[r.bdMail].tokens.push(r);
    if (r.type) podiumBdeMap[r.bdMail].type = r.type;
  });
  const bdaRankings = Object.keys(podiumBdeMap)
    .map(bd => ({ bd, tokenCount: podiumBdeMap[bd].tokens.length, type: podiumBdeMap[bd].type || '—' }))
    .sort((a, b) => b.tokenCount - a.tokenCount);
  const topBDAs = bdaRankings.filter(b => b.tokenCount > 0).slice(0, 3);
  if (topBDAs.length > 0) {
    topBDAs.forEach((bda, index) => {
      const card = document.createElement('div');
      card.className = `podium-card rank-${index + 1}`;
      card.innerHTML = `
        <div class="podium-card-head">
          <div class="podium-rank-badge">${index + 1}</div>
          <div class="podium-bda-name" title="${bda.bd}">${emailToDisplayName(bda.bd)}</div>
        </div>
        <div class="podium-bda-program">${bda.type}</div>
        <div class="podium-bda-rev">${fNum(bda.tokenCount)} Token${bda.tokenCount !== 1 ? 's' : ''}</div>`;
      bdaPodiumContainer.appendChild(card);
    });
  } else {
    bdaPodiumContainer.innerHTML = '<div class="empty-row" style="width: 100%">No token data for BDAs in this period</div>';
  }

  // TL (self) Performance row
  const tlTbody = document.getElementById('rev-tl-perf-table');
  tlTbody.innerHTML = '';
  {
    const tlTokens = revAggTokens(tokenData);
    const tlFull = revAggFull(fullData);
    const { total: rawTlTarget, perDay: tlTargetDay } = revTlSheetTarget();
    const tlTarget = Math.ceil(rawTlTarget);
    const { deficit: rawTlDeficit } = revTlCurrentDeficit();
    const tlDeficit = Math.ceil(rawTlDeficit);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-name bold">${currentTLName}</td>
      ${targetCellHtml(tlTarget, tlTargetDay)}
      <td class="col-num">${tlTokens.count > 0 ? fNum(tlTokens.count) : '—'}</td>
      <td class="col-num">${tlFull.count > 0 ? fNum(tlFull.count) : '—'}</td>
      <td class="col-num">${tlDeficit > 0 ? formatTargetNum(tlDeficit) : '—'}</td>`;
    tlTbody.appendChild(tr);
  }

  // BDA Performance
  const bdaTbody = document.getElementById('rev-bda-table');
  bdaTbody.innerHTML = '';
  const bdeMap = {};
  const bdeDisplayEmail = {};

  const ensureBdeEntry = email => {
    const key = normEmail(email);
    if (!key) return;
    if (!bdeMap[key]) { bdeMap[key] = { tokens: [], full: [] }; bdeDisplayEmail[key] = email; }
  };

  tokenData.forEach(r => { if (!r.bdMail) return; ensureBdeEntry(r.bdMail); bdeMap[normEmail(r.bdMail)].tokens.push(r); });
  fullData.forEach(r => { if (!r.bdMail) return; ensureBdeEntry(r.bdMail); bdeMap[normEmail(r.bdMail)].full.push(r); });

  if (bdTargetLoaded) {
    const { start: fStart, end: fEnd } = revGetFilterDateRange();
    const progFilter = activeFilters.program !== 'ALL' ? activeFilters.program : '';
    bdTargetRows.forEach(row => {
      const email = row.agentEmail;
      if (!email) return;
      if (!normTlMatch(row.managerName, currentTLName)) return;
      if (progFilter && row.programName !== progFilter) return;
      if (activeFilters.bde !== 'ALL' && normEmail(email) !== normEmail(activeFilters.bde)) return;
      if (!row.startDate || !row.endDate) return;
      if (fEnd < row.startDate || fStart > row.endDate) return;
      ensureBdeEntry(email);
    });
  }

  Object.keys(bdeMap).sort().forEach(key => {
    const bd = bdeDisplayEmail[key] || key;
    const tAgg = revAggTokens(bdeMap[key].tokens);
    const fAgg = revAggFull(bdeMap[key].full);
    const { total: rawBdeTarget, perDay: bdeTargetDay } = revBdSheetTarget(bd);
    const bdeTarget = Math.ceil(rawBdeTarget);
    const { deficit: rawBdeDeficit } = revBdCurrentDeficit(bd);
    const bdeDeficit = Math.ceil(rawBdeDeficit);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-name bold" title="${bd}">${bd}</td>
      ${targetCellHtml(bdeTarget, bdeTargetDay)}
      <td class="col-num">${tAgg.count > 0 ? fNum(tAgg.count) : '—'}</td>
      <td class="col-num">${fAgg.count > 0 ? fNum(fAgg.count) : '—'}</td>
      <td class="col-num">${bdeDeficit > 0 ? formatTargetNum(bdeDeficit) : '—'}</td>`;
    bdaTbody.appendChild(tr);
  });
  if (bdaTbody.innerHTML === '') emptyRow(bdaTbody, 5);

  // Date-wise table
  const dateTbody = document.getElementById('rev-date-table');
  dateTbody.innerHTML = '';
  const dateMap = {};
  let d = new Date(activeFilters.dateFrom);
  const endD = new Date(activeFilters.dateTo);
  while (d <= endD) {
    dateMap[d.toISOString().split('T')[0]] = { tokens: 0, enrolls: 0 };
    d.setDate(d.getDate() + 1);
  }
  tokenData.forEach(r => { if (dateMap[r.tokenDate]) dateMap[r.tokenDate].tokens++; });
  fullData.forEach(r => { if (dateMap[r.fullPayDate]) dateMap[r.fullPayDate].enrolls++; });

  let hasDateData = false;
  Object.keys(dateMap).sort((a, b) => b.localeCompare(a)).forEach(dateStr => {
    const info = dateMap[dateStr];
    if (info.tokens > 0 || info.enrolls > 0) {
      hasDateData = true;
      const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="col-name bold">${formattedDate}</td><td class="col-num">${fNum(info.tokens)}</td><td class="col-num">${fNum(info.enrolls)}</td>`;
      dateTbody.appendChild(tr);
    }
  });
  if (!hasDateData) emptyRow(dateTbody, 3);
}

// ==========================================
// PRODUCTIVITY DATA HELPERS
// ==========================================
function mapProdRow(obj) {
  return {
    owner: obj['Owner Name'] || '',
    date: (obj['Date'] || '').substring(0, 10),
    program: (obj['Program Name'] || '').trim(),
    calls: parseNum(obj['# Calls']),
    connected: parseNum(obj['# Calls Connected']),
    uniqueLeads: parseNum(obj['# Unique Leads']),
    talkTimeMin: parseNum(obj['Total Call Duration']),
    manager: (obj['Manager Name'] || '').trim(),
    gm: (obj['GM Name'] || '').trim(),
  };
}

// Returns rows for the logged-in TL, filtered by date+program
function getProdTLData() {
  return prodAllRows.filter(r => {
    const inDate = (!activeFilters.dateFrom || r.date >= activeFilters.dateFrom) &&
      (!activeFilters.dateTo || r.date <= activeFilters.dateTo);
    const inProgram = activeFilters.program === 'ALL' || r.program === activeFilters.program;
    const inTL = normTlMatch(r.manager, currentTLName);
    return inDate && inProgram && inTL && r.owner;
  });
}

function getBaseProdData() {
  let pool = getProdTLData();
  if (activeFilters.bde !== 'ALL') pool = pool.filter(r => r.owner === activeFilters.bde);
  return pool;
}

function populateProdGlobalFilters() {
  populateProdPrograms();
  populateProdBDEs();
}

function populateProdPrograms() {
  const sel = document.getElementById('filter-program');
  if (!sel) return;
  sel.innerHTML = '<option value="ALL">All Programs</option>';
  if (!prodLoaded) { sel.value = 'ALL'; activeFilters.program = 'ALL'; return; }
  const pool = prodAllRows.filter(r => normTlMatch(r.manager, currentTLName));
  const programs = [...new Set(pool.map(r => r.program).filter(Boolean))].sort();
  programs.forEach(p => { const o = document.createElement('option'); o.value = o.textContent = p; sel.appendChild(o); });
  activeFilters.program = programs.includes(activeFilters.program) ? activeFilters.program : 'ALL';
  sel.value = activeFilters.program;
}

function populateProdBDEs() {
  const sel = document.getElementById('filter-bde');
  if (!sel) return;
  // Use ALL TL rows (no date filter) so BDEs appear even when today has no data
  const pool = prodAllRows.filter(r => {
    const inProgram = activeFilters.program === 'ALL' || r.program === activeFilters.program;
    return normTlMatch(r.manager, currentTLName) && inProgram && r.owner;
  });
  const bdes = [...new Set(pool.map(r => r.owner).filter(Boolean))].sort();
  sel.innerHTML = '<option value="ALL">All BDEs</option>';
  bdes.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = emailToDisplayName(b); sel.appendChild(o); });
  activeFilters.bde = bdes.includes(activeFilters.bde) ? activeFilters.bde : 'ALL';
  sel.value = activeFilters.bde;
}

// ==========================================
// PRODUCTIVITY CSV FETCH
// ==========================================
async function fetchProductivityCSV() {
  if (prodLoading) return;
  prodLoading = true;
  updateLoadingOverlay();
  setText('prod-calls', '…');
  try {
    const resp = await fetch(SHEETS_API.productivity);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = parseCSV(await resp.text());
    prodAllRows = raw.map(mapProdRow).filter(r => r.owner && r.date);
    prodLoaded = true;

    if (activeView === 'productivity') {
      if (!userSelectedDate) {
        const tlRows = prodAllRows.filter(r => normTlMatch(r.manager, currentTLName));
        const dates = tlRows.map(r => r.date).filter(Boolean).sort();
        if (dates.length) {
          activeFilters.dateFrom = dates[0];
          activeFilters.dateTo = dates[dates.length - 1];
          const dfEl = document.getElementById('date-from');
          const dtEl = document.getElementById('date-to');
          if (dfEl) dfEl.value = activeFilters.dateFrom;
          if (dtEl) dtEl.value = activeFilters.dateTo;
          const filterDateEl = document.getElementById('filter-date');
          if (filterDateEl) filterDateEl.value = 'custom';
          lastAppliedDateOption = 'custom';
          updateDateDisplayLabel();
        }
      }
      populateProdGlobalFilters();
      renderActiveView();
    } else if (activeView === 'overview') {
      renderActiveView();
    } else {
      renderSidebarTeam();
    }

    if (!laLoaded && !laLoading) fetchLeadCSV();
  } catch (err) {
    console.error('Productivity CSV load error:', err);
    setText('prod-calls', 'Error');
  } finally {
    prodLoading = false;
    updateLoadingOverlay();
  }
}

// ==========================================
// PRODUCTIVITY RENDER
// ==========================================
function prodAggregate(rows) {
  const calls = rows.reduce((s, r) => s + r.calls, 0);
  const connects = rows.reduce((s, r) => s + r.connected, 0);
  const uniqueDialled = rows.reduce((s, r) => s + r.uniqueLeads, 0);
  const talk = rows.reduce((s, r) => s + r.talkTimeMin, 0);
  const activeBdes = new Set(rows.map(r => r.owner).filter(Boolean)).size;
  return { calls, connects, uniqueDialled, talk, activeBdes };
}

function prodCalendarWorkingDaysExclSunday(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return 0;
  const start = new Date(dateFrom + 'T00:00:00');
  const end = new Date(dateTo + 'T00:00:00');
  if (end < start) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= end) { if (d.getDay() !== 0) count++; d.setDate(d.getDate() + 1); }
  return count;
}

function prodWorkingDaysCount(rows) {
  const days = new Set();
  rows.forEach(r => { if (r.calls > 0 && r.date && r.owner) days.add(`${r.owner}|${r.date}`); });
  return days.size;
}

function prodTlBdeUnitCount(rows) {
  const units = new Set();
  rows.forEach(r => { if (!r.owner) return; units.add(`${r.manager || '—'}|${r.owner}`); });
  return Math.max(1, units.size);
}

function prodKpiDenominator(rows) {
  const workingDays = prodCalendarWorkingDaysExclSunday(activeFilters.dateFrom, activeFilters.dateTo);
  if (!workingDays) return 0;
  if (activeFilters.bde !== 'ALL') return workingDays;
  return workingDays * prodTlBdeUnitCount(rows);
}

function prodAvgDialledPerDay(rows) {
  const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
  const denom = prodKpiDenominator(rows);
  return denom ? (totalCalls / denom).toFixed(1) : '0.0';
}

function prodAvgTalktimePerDay(rows) {
  const totalTalkMin = rows.reduce((s, r) => s + r.talkTimeMin, 0);
  const denom = prodKpiDenominator(rows);
  return denom ? formatTalkHrs(totalTalkMin / denom) : '0.0h';
}

function prodAvgCall(rows) {
  const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
  const workingDays = prodWorkingDaysCount(rows);
  return workingDays ? (totalCalls / workingDays).toFixed(1) : '0.0';
}

function prodAvgCC(rows) {
  const totalConnects = rows.reduce((s, r) => s + r.connected, 0);
  const workingDays = prodWorkingDaysCount(rows);
  return workingDays ? (totalConnects / workingDays).toFixed(1) : '0.0';
}

function prodAvgTT(rows) {
  const totalTalkMin = rows.reduce((s, r) => s + r.talkTimeMin, 0);
  const workingDays = prodWorkingDaysCount(rows);
  return workingDays ? formatTalkHrs(totalTalkMin / workingDays) : '0.0h';
}

function prodCPL(totalCalls, uniqueDialled) {
  return uniqueDialled ? (totalCalls / uniqueDialled).toFixed(2) : '—';
}

function renderProductivity() {
  if (!prodLoaded) { fetchProductivityCSV(); return; }

  const cData = getBaseProdData();
  const { calls: totalCalls, connects: connected, talk: talkMins, activeBdes: activeBDEs } = prodAggregate(cData);
  const connectRate = totalCalls ? ((connected / totalCalls) * 100).toFixed(1) : 0;
  const talkHrs = (talkMins / 60).toFixed(1);

  // Team size: unique BDEs under this TL (no date filter)
  const allOwnersInScope = new Set(
    prodAllRows.filter(r => {
      const inProgram = activeFilters.program === 'ALL' || r.program === activeFilters.program;
      return normTlMatch(r.manager, currentTLName) && inProgram && r.owner;
    }).map(r => r.owner)
  );
  const totalTeamSize = allOwnersInScope.size;

  setText('prod-calls', prodAvgDialledPerDay(cData));
  setText('prod-calls-sub', `${fNum(totalCalls)} total dials`);
  setText('prod-connect', `${connectRate}%`);
  setText('prod-connect-sub', `${fNum(connected)} connected calls`);
  setText('prod-talk', prodAvgTalktimePerDay(cData));
  setText('prod-talk-sub', `${talkHrs}h total talk time`);
  setText('prod-active', fNum(totalTeamSize));
  setText('prod-active-sub', `${activeBDEs} active in period`);

  // Top 3 BDAs podium
  const bdaPodiumContainer = document.getElementById('prod-podium-bdas');
  bdaPodiumContainer.innerHTML = '';
  const bdeMapPodium = {};
  cData.forEach(r => {
    if (!bdeMapPodium[r.owner]) bdeMapPodium[r.owner] = [];
    bdeMapPodium[r.owner].push(r);
  });
  const bdaRankings = Object.keys(bdeMapPodium)
    .map(owner => {
      const agg = prodAggregate(bdeMapPodium[owner]);
      return { name: owner, talkTime: agg.talk, ...agg };
    })
    .sort((a, b) => b.talkTime - a.talkTime);
  const topBDAs = bdaRankings.filter(b => b.talkTime > 0).slice(0, 3);
  if (topBDAs.length > 0) {
    topBDAs.forEach((bda, index) => {
      const card = document.createElement('div');
      card.className = `podium-card rank-${index + 1}`;
      card.innerHTML = `
        <div class="podium-card-head">
          <div class="podium-rank-badge">${index + 1}</div>
          <div class="podium-bda-name" title="${bda.name}">${bda.name}</div>
        </div>
        <div class="podium-bda-program">TL ${currentTLName}</div>
        <div class="podium-bda-rev" style="color: var(--purple);">${formatTalkHrs(bda.talkTime)}</div>`;
      bdaPodiumContainer.appendChild(card);
    });
  } else {
    bdaPodiumContainer.innerHTML = '<div class="empty-row" style="width: 100%">No talk time data for BDAs in this period</div>';
  }

  // TL (self) Performance
  const tlTbody = document.getElementById('prod-tl-perf-table');
  tlTbody.innerHTML = '';
  {
    const tlRows = getProdTLData(); // All TL's rows (before BDE filter)
    const { calls: tlDials, connects: tlConnects, uniqueDialled: tlUnique, talk: tlTalk } = prodAggregate(tlRows);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-name bold">${currentTLName}</td>
      <td class="col-num">${fNum(tlDials)}</td>
      <td class="col-num">${fNum(tlConnects)}</td>
      <td class="col-num">${fNum(tlUnique)}</td>
      <td class="col-num">${prodCPL(tlDials, tlUnique)}</td>
      <td class="col-num">${formatTalkHrs(tlTalk)}</td>
      <td class="col-num">${prodAvgCall(tlRows)}</td>
      <td class="col-num">${prodAvgCC(tlRows)}</td>
      <td class="col-num">${prodAvgTT(tlRows)}</td>`;
    tlTbody.appendChild(tr);
  }

  // BDA Performance
  const bdaTbody = document.getElementById('prod-bda-perf-table');
  bdaTbody.innerHTML = '';

  const bdeMap = {};
  cData.forEach(r => {
    if (!bdeMap[r.owner]) bdeMap[r.owner] = [];
    bdeMap[r.owner].push(r);
  });

  Object.keys(bdeMap).sort().forEach(owner => {
    const bdeRows = bdeMap[owner];
    const { calls: dials, connects, uniqueDialled, talk } = prodAggregate(bdeRows);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-name bold">${owner}</td>
      <td class="col-num">${fNum(dials)}</td>
      <td class="col-num">${fNum(connects)}</td>
      <td class="col-num">${fNum(uniqueDialled)}</td>
      <td class="col-num">${prodCPL(dials, uniqueDialled)}</td>
      <td class="col-num">${formatTalkHrs(talk)}</td>
      <td class="col-num">${prodAvgCall(bdeRows)}</td>
      <td class="col-num">${prodAvgCC(bdeRows)}</td>
      <td class="col-num">${prodAvgTT(bdeRows)}</td>`;
    bdaTbody.appendChild(tr);
  });
  if (bdaTbody.innerHTML === '') emptyRow(bdaTbody, 9);
}

// ==========================================
// LEAD ANALYSIS CSV PARSING
// ==========================================
function parseCSV(text) {
  const matrix = [];
  let row = [], field = '', inQuotes = false;
  const input = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < input.length; i++) {
    const c = input[i], n = input[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') {
      row.push(field); field = '';
      if (row.some(cell => cell.trim() !== '')) matrix.push(row);
      row = [];
    } else { field += c; }
  }
  if (field.length || row.length) { row.push(field); if (row.some(cell => cell.trim() !== '')) matrix.push(row); }
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(h => h.trim());
  return matrix.slice(1).map(vals => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (vals[idx] !== undefined ? vals[idx] : '').trim(); });
    return obj;
  });
}

function mapCSVRow(obj) {
  return {
    email: obj['Email Address'] || '',
    source: obj['Lead Source'] || '',
    subSource: obj['Sub Source'] || '',
    createdOn: (obj['Created On'] || '').substring(0, 10),
    program: obj['Program'] || '',
    owner: obj['Owner (User Email)'] || '',
    status: obj['Status'] || '',
    stage: obj['Stage'] || '',
    campaign: obj['Campaign'] || '',
    tl: (obj['TL Name '] || obj['TL Name'] || '').trim(),
    gm: (obj['GM NAME'] || '').trim(),
    finalStage: obj['Final Stage'] || '',
    tokenDate: obj['Token Date'] || '',
    enrollmentDate: obj['Enrollment Date'] || '',
  };
}

function laCampaignLabel(campaign) {
  const c = (campaign || '').trim();
  return c || 'Unknown';
}

async function fetchLeadCSV() {
  if (laLoading) return;
  laLoading = true;
  updateLoadingOverlay();
  setText('la-kpi-leads', '…');
  setText('la-kpi-tokens', '…');
  setText('la-kpi-enrolled', '…');
  setText('la-kpi-cvr', '…');
  setText('lead-total', '…');
  try {
    const config = await loadSheetConfig();
    const resp = await fetch(config.leads);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    laAllRows = parseCSV(await resp.text()).map(mapCSVRow).filter(r => r.email || r.createdOn);
    laLoaded = true;

    if (CSV_LEAD_VIEWS.includes(activeView)) {
      if (!userSelectedDate) {
        const tlLARows = laAllRows.filter(r => tlRowMatchesMe(r.tl));
        const dates = tlLARows.map(r => r.createdOn).filter(Boolean).sort();
        if (dates.length) {
          activeFilters.dateFrom = dates[0];
          activeFilters.dateTo = dates[dates.length - 1];
          const dfEl = document.getElementById('date-from');
          const dtEl = document.getElementById('date-to');
          if (dfEl) dfEl.value = activeFilters.dateFrom;
          if (dtEl) dtEl.value = activeFilters.dateTo;
          const filterDateEl = document.getElementById('filter-date');
          if (filterDateEl) filterDateEl.value = 'custom';
          lastAppliedDateOption = 'custom';
          updateDateDisplayLabel();
        }
      }
      populateLAGlobalFilters();
    }
    if (viewUsesLeadCSV()) renderActiveView();
    renderSidebarTeam();
  } catch (err) {
    console.error('CSV load error:', err);
    setText('la-kpi-leads', 'Error');
    setText('la-kpi-tokens', '—');
    setText('la-kpi-enrolled', '—');
    setText('la-kpi-cvr', '—');
    setText('lead-total', 'Error');
  } finally {
    laLoading = false;
    updateLoadingOverlay();
  }
}

// ==========================================
// LEAD FILTER POPULATION (TL-scoped)
// ==========================================
function populateLAGlobalFilters() {
  populateLAPrograms();
  populateLABDEs();
}

function populateLAPrograms() {
  const sel = document.getElementById('filter-program');
  if (!sel) return;
  const pool = laAllRows.filter(r => tlRowMatchesMe(r.tl));
  const programs = [...new Set(pool.map(r => r.program).filter(Boolean))].sort();
  sel.innerHTML = '<option value="ALL">All Programs</option>';
  programs.forEach(p => { const o = document.createElement('option'); o.value = o.textContent = p; sel.appendChild(o); });
  activeFilters.program = programs.includes(activeFilters.program) ? activeFilters.program : 'ALL';
  sel.value = activeFilters.program;
}

function populateLABDEs() {
  const sel = document.getElementById('filter-bde');
  if (!sel) return;
  let pool = laAllRows.filter(r => tlRowMatchesMe(r.tl));
  if (activeFilters.program !== 'ALL') pool = pool.filter(r => r.program === activeFilters.program);
  const bdes = [...new Set(pool.map(r => r.owner).filter(Boolean))].sort();
  sel.innerHTML = '<option value="ALL">All BDEs</option>';
  bdes.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = emailToDisplayName(b); sel.appendChild(o); });
  activeFilters.bde = bdes.includes(activeFilters.bde) ? activeFilters.bde : 'ALL';
  sel.value = activeFilters.bde;
}

// Global filtered pool: TL-scoped + date + program
function getLAGlobalData() {
  return laAllRows.filter(r => {
    const inDate = (!activeFilters.dateFrom || r.createdOn >= activeFilters.dateFrom) &&
      (!activeFilters.dateTo || r.createdOn <= activeFilters.dateTo);
    const inTL = tlRowMatchesMe(r.tl);
    const inProgram = activeFilters.program === 'ALL' || r.program === activeFilters.program;
    return inDate && inTL && inProgram;
  });
}

function getBaseLAData() {
  return getLAGlobalData().filter(r => {
    const inBDE = activeFilters.bde === 'ALL' || r.owner === activeFilters.bde;
    return inBDE;
  });
}

// ==========================================
// LEAD REPORT RENDER
// ==========================================
function isNonBlankVal(val) { return val != null && String(val).trim() !== ''; }

function lrCountTokens(rows) { return rows.filter(r => isNonBlank(r.tokenDate)).length; }
function lrCountEnrolled(rows) { return rows.filter(r => isNonBlank(r.enrollmentDate)).length; }
function lrCountInterested(rows) { return rows.filter(r => /^Interested/i.test(r.finalStage || '')).length; }
function lrCountFollowUp(rows) {
  return rows.filter(r => { const fs = r.finalStage || ''; return fs === 'Follow_Up' || fs === 'Call_Back_Later'; }).length;
}
function lrConvPct(enrolled, total) { return total ? ((enrolled / total) * 100).toFixed(2) : '0.00'; }
function lrFormatStageLabel(stage) { return stage === '(blank)' ? '(blank)' : stage.replace(/_/g, ' '); }
function lrDominantProgram(rows) {
  const progMap = {};
  rows.forEach(r => { const p = (r.program || '').trim() || '(blank)'; progMap[p] = (progMap[p] || 0) + 1; });
  let top = '', max = 0;
  for (const [p, c] of Object.entries(progMap)) { if (c > max) { max = c; top = p; } }
  return top === '(blank)' ? '—' : top;
}

function lrGetUniqueStages(rows) {
  const stageMap = {};
  rows.forEach(r => { const stage = (r.finalStage || '').trim() || '(blank)'; stageMap[stage] = (stageMap[stage] || 0) + 1; });
  return Object.keys(stageMap).sort((a, b) => stageMap[b] - stageMap[a]);
}

function lrCountStages(rows) {
  const counts = {};
  rows.forEach(r => { const stage = (r.finalStage || '').trim() || '(blank)'; counts[stage] = (counts[stage] || 0) + 1; });
  return counts;
}

function lrStageCellsHtml(counts, stages) {
  return stages.map(s => `<td class="col-num">${fNum(counts[s] || 0)}</td>`).join('');
}

function renderLeads() {
  if (!laLoaded) { fetchLeadCSV(); return; }

  const lData = getBaseLAData();
  const uniqueStages = lrGetUniqueStages(lData);
  const stageColCount = uniqueStages.length;

  const total = lData.length;
  const interested = lrCountInterested(lData);
  const followup = lrCountFollowUp(lData);
  const enrolled = lrCountEnrolled(lData);
  const convRate = lrConvPct(enrolled, total);

  setText('lead-total', fNum(total));
  setText('lead-interested', fNum(interested));
  setText('lead-interested-sub', `${total ? ((interested / total) * 100).toFixed(0) : 0}% of total`);
  setText('lead-followup', fNum(followup));
  setText('lead-enrolled', fNum(enrolled));
  setText('lead-enrolled-sub', `${convRate}% conversion`);

  // Lead stage funnel
  const funnelContainer = document.getElementById('lead-stage-funnel');
  funnelContainer.innerHTML = '';
  const stageMap = {};
  lData.forEach(r => { const stage = (r.finalStage || '').trim() || '(blank)'; stageMap[stage] = (stageMap[stage] || 0) + 1; });
  const funnelColors = {
    'Full_Payment_Done': 'var(--emerald)', 'Token_Paid': 'var(--emerald)',
    'Interested': 'var(--indigo)', 'Interested-Test': 'var(--indigo)', 'Interested-Interview': 'var(--indigo)',
    'Follow_Up': 'var(--amber)', 'Call_Back_Later': 'var(--amber)',
    'Fresh_Lead': 'var(--cyan)', 'Not_Connected': 'var(--text-muted)',
    'Invalid': 'var(--danger)', 'Not_Interested': 'var(--danger)'
  };
  Object.keys(stageMap).map(name => ({ name, count: stageMap[name] }))
    .sort((a, b) => b.count - a.count)
    .forEach(s => {
      const pct = total ? ((s.count / total) * 100) : 0;
      const label = s.name.replace(/_/g, ' ');
      const color = funnelColors[s.name] || 'var(--purple)';
      const row = document.createElement('div');
      row.style = 'display: flex; flex-direction: column; gap: 4px;';
      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600;">
          <span style="color: var(--text);">${label}: ${fNum(s.count)}</span>
          <span style="color: var(--text-secondary);">${pct.toFixed(1)}%</span>
        </div>
        <div style="height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
          <div style="height: 100%; width: ${pct}%; background: ${color}; border-radius: 3px;"></div>
        </div>`;
      funnelContainer.appendChild(row);
    });
  if (Object.keys(stageMap).length === 0) funnelContainer.innerHTML = '<div class="empty-row">No final stage data available</div>';

  // Sub source mix
  const sourcesContainer = document.getElementById('lead-sources-list');
  sourcesContainer.innerHTML = '';
  const srcMap = {};
  lData.forEach(r => { const src = (r.subSource || '').trim() || '(blank)'; srcMap[src] = (srcMap[src] || 0) + 1; });
  const colors = ['var(--indigo)', 'var(--emerald)', 'var(--purple)', 'var(--amber)', 'var(--cyan)'];
  Object.keys(srcMap).map(src => ({ name: src, count: srcMap[src] }))
    .sort((a, b) => b.count - a.count)
    .forEach((src, idx) => {
      const pct = total ? ((src.count / total) * 100) : 0;
      const color = colors[idx % colors.length];
      const row = document.createElement('div');
      row.style = 'display: flex; flex-direction: column; gap: 4px;';
      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600;">
          <span style="color: var(--text);">${src.name}: ${fNum(src.count)}</span>
          <span style="color: var(--text-secondary);">${pct.toFixed(1)}%</span>
        </div>
        <div style="height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
          <div style="height: 100%; width: ${pct}%; background: ${color}; border-radius: 3px;"></div>
        </div>`;
      sourcesContainer.appendChild(row);
    });
  if (Object.keys(srcMap).length === 0) sourcesContainer.innerHTML = '<div class="empty-row">No sub source data available</div>';

  // TL (self) Summary row
  const tlTbody = document.getElementById('lead-tl-table');
  tlTbody.innerHTML = '';
  {
    const program = lrDominantProgram(lData);
    const tlTok = lrCountTokens(lData);
    const tlEnr = lrCountEnrolled(lData);
    const tokConv = lrConvPct(tlTok, total);
    const enrConv = lrConvPct(tlEnr, total);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-name bold">${currentTLName}</td>
      <td class="col-num">${fNum(total)}</td>
      <td class="col-text">${program || '—'}</td>
      <td class="col-num">${fNum(tlTok)}</td>
      <td class="col-num">${fNum(tlEnr)}</td>
      <td class="col-pct">${rateBadge(parseFloat(tokConv))}</td>
      <td class="col-pct">${rateBadge(parseFloat(enrConv))}</td>`;
    tlTbody.appendChild(tr);
  }

  // BDE-wise table
  const tbody = document.getElementById('lead-bde-table');
  tbody.innerHTML = '';
  const bdeMap = {};
  lData.forEach(r => {
    if (!r.owner) return;
    const key = r.owner + '||' + (r.tl || '');
    if (!bdeMap[key]) bdeMap[key] = { owner: r.owner, tl: r.tl, rows: [] };
    bdeMap[key].rows.push(r);
  });
  Object.values(bdeMap).sort((a, b) => a.owner.localeCompare(b.owner)).forEach(({ owner, tl, rows: bdeLeads }) => {
    const bTotal = bdeLeads.length;
    const bTok = lrCountTokens(bdeLeads);
    const bEnr = lrCountEnrolled(bdeLeads);
    const tokConv = lrConvPct(bTok, bTotal);
    const enrConv = lrConvPct(bEnr, bTotal);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-name bold">${owner}</td>
      <td class="col-num">${fNum(bTotal)}</td>
      <td class="col-text">${tl || '—'}</td>
      <td class="col-num">${fNum(bTok)}</td>
      <td class="col-num">${fNum(bEnr)}</td>
      <td class="col-pct">${rateBadge(parseFloat(tokConv))}</td>
      <td class="col-pct">${rateBadge(parseFloat(enrConv))}</td>`;
    tbody.appendChild(tr);
  });
  if (tbody.innerHTML === '') emptyRow(tbody, 7);
}

// ==========================================
// OVERVIEW RENDER
// ==========================================
function renderOverview() {
  if (!revLoaded && !revLoading) fetchRevenueCSV();
  if (!laLoaded && !laLoading) fetchLeadCSV();
  if (!prodLoaded && !prodLoading) fetchProductivityCSV();

  // Tokens & Enrollments
  if (revLoaded) {
    const currentTokens = revTokenRows.filter(r => revMatchesFilters(r, 'tokenDate'));
    const currentEnrollments = revFullRows.filter(r => revMatchesFilters(r, 'fullPayDate'));
    const totalTokens = revTokenRows.filter(r => tlRowMatchesMe(r.tl) && (activeFilters.program === 'ALL' || r.type === activeFilters.program) && (activeFilters.bde === 'ALL' || r.bdMail === activeFilters.bde));
    const totalEnrollments = revFullRows.filter(r => tlRowMatchesMe(r.tl) && (activeFilters.program === 'ALL' || r.type === activeFilters.program) && (activeFilters.bde === 'ALL' || r.bdMail === activeFilters.bde));
    setText('ov-total-tokens', fNum(totalTokens.length));
    setText('ov-current-tokens', fNum(currentTokens.length));
    setText('ov-total-enrollments', fNum(totalEnrollments.length));
    setText('ov-current-enrollments', fNum(currentEnrollments.length));
  } else {
    ['ov-total-tokens', 'ov-current-tokens', 'ov-total-enrollments', 'ov-current-enrollments'].forEach(id => setText(id, '…'));
  }

  // Productivity
  if (prodLoaded) {
    const cData = getBaseProdData();
    setText('ov-avg-dialled', prodAvgDialledPerDay(cData));
    setText('ov-avg-connected', prodAvgDialledPerDay(cData.map(r => ({ ...r, calls: r.connected }))));
    setText('ov-avg-talktime', prodAvgTalktimePerDay(cData));
  } else {
    ['ov-avg-dialled', 'ov-avg-connected', 'ov-avg-talktime'].forEach(id => setText(id, '…'));
  }

  // Leads CVR
  if (laLoaded) {
    const durationLeads = getBaseLAData();
    const durationLeadsCount = durationLeads.length;
    const durationEnrolled = durationLeads.filter(r => isNonBlank(r.enrollmentDate)).length;
    const durationCVR = durationLeadsCount ? ((durationEnrolled / durationLeadsCount) * 100).toFixed(2) : '0.00';

    const totalLeads = laAllRows.filter(r => {
      const inTL = tlRowMatchesMe(r.tl);
      const inProgram = activeFilters.program === 'ALL' || r.program === activeFilters.program;
      const inBDE = activeFilters.bde === 'ALL' || r.owner === activeFilters.bde;
      return inTL && inProgram && inBDE;
    });
    const totalLeadsCount = totalLeads.length;
    const totalEnrolledCnt = totalLeads.filter(r => isNonBlank(r.enrollmentDate)).length;
    const totalCVR = totalLeadsCount ? ((totalEnrolledCnt / totalLeadsCount) * 100).toFixed(2) : '0.00';

    setText('ov-total-leads', fNum(totalLeadsCount));
    setText('ov-total-leads-cvr', `${totalCVR}%`);
    setText('ov-duration-leads', fNum(durationLeadsCount));
    setText('ov-duration-leads-cvr', `${durationCVR}%`);
  } else {
    ['ov-total-leads', 'ov-total-leads-cvr', 'ov-duration-leads', 'ov-duration-leads-cvr'].forEach(id => setText(id, '…'));
  }
}

// ==========================================
// LEAD ANALYSIS RENDER
// ==========================================
function renderLeadAnalysis() {
  if (!laLoaded) { fetchLeadCSV(); return; }

  // Campaign table — shown to all TLs
  const campaignCard = document.getElementById('la-campaign-table-card');
  if (campaignCard) campaignCard.style.display = 'block';

  const base = getBaseLAData();
  populateT1Dropdowns();
  populateTableBDE('t2-filter-bde', base);
  populateTableBDE('t3-filter-bde', base);
  populateTableSourceDropdown('t2-filter-source', base, 'subSource');
  populateTableSourceDropdown('t3-filter-source', base, 'subSource');
  populateTableCampaignDropdown('t3-filter-campaign', base);

  const totalLeads = base.length;
  const totalTokens = base.filter(r => isNonBlank(r.tokenDate)).length;
  const totalEnrolled = base.filter(r => isNonBlank(r.enrollmentDate)).length;
  setText('la-kpi-leads', fNum(totalLeads));
  setText('la-kpi-tokens', fNum(totalTokens));
  setText('la-kpi-enrolled', fNum(totalEnrolled));
  setText('la-kpi-cvr', totalLeads ? ((totalEnrolled / totalLeads) * 100).toFixed(2) + '%' : '0.00%');

  renderTable1();
  renderTable2();
  renderTable3();
}

// BDE-only dropdown for LA tables (no TL in TL dashboard)
function populateTableBDE(bdeSelId, basePool) {
  const bdeSel = document.getElementById(bdeSelId);
  if (!bdeSel) return;
  const selectedBDE = bdeSel.value || 'ALL';
  const bdes = [...new Set(basePool.map(r => r.owner).filter(Boolean))].sort();
  bdeSel.innerHTML = '<option value="ALL">All BDEs</option>';
  bdes.forEach(name => { const o = document.createElement('option'); o.value = name; o.textContent = emailToDisplayName(name); bdeSel.appendChild(o); });
  bdeSel.value = bdes.includes(selectedBDE) ? selectedBDE : 'ALL';
}

function populateTableSourceDropdown(selId, basePool, field = 'source') {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const selected = sel.value || 'ALL';
  const sources = [...new Set(basePool.map(r => r[field]).filter(Boolean))].sort();
  const allLabel = field === 'subSource' ? 'All Sub Sources' : 'All Sources';
  sel.innerHTML = `<option value="ALL">${allLabel}</option>`;
  sources.forEach(s => { const o = document.createElement('option'); o.value = o.textContent = s; sel.appendChild(o); });
  sel.value = sources.includes(selected) ? selected : 'ALL';
}

function populateTableCampaignDropdown(selId, basePool) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const selected = sel.value || 'ALL';
  const campaigns = [...new Set(basePool.map(r => laCampaignLabel(r.campaign)))].sort();
  sel.innerHTML = '<option value="ALL">All Campaigns</option>';
  campaigns.forEach(c => { const o = document.createElement('option'); o.value = o.textContent = c; sel.appendChild(o); });
  sel.value = campaigns.includes(selected) ? selected : 'ALL';
}

function populateT1Dropdowns() {
  const bdeSel = document.getElementById('t1-filter-bde');
  if (!bdeSel) return;
  const pool = getLAGlobalData();
  const selectedBDE = bdeSel.value || 'ALL';
  const bdes = [...new Set(pool.map(r => r.owner).filter(Boolean))].sort();
  bdeSel.innerHTML = '<option value="ALL">All BDEs</option>';
  bdes.forEach(email => { const o = document.createElement('option'); o.value = email; o.textContent = emailToDisplayName(email); bdeSel.appendChild(o); });
  bdeSel.value = bdes.includes(selectedBDE) ? selectedBDE : 'ALL';
}

function renderTable1() {
  const bdeVal = document.getElementById('t1-filter-bde')?.value || 'ALL';
  const pool = getBaseLAData().filter(r => bdeVal === 'ALL' || r.owner === bdeVal);
  const tbody = document.getElementById('la-table1-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  const map = {};
  pool.forEach(r => {
    const dateKey = r.createdOn || '(unknown)';
    if (!map[dateKey]) map[dateKey] = { leads: 0, tokens: 0, enrolled: 0 };
    map[dateKey].leads++;
    if (isNonBlank(r.tokenDate)) map[dateKey].tokens++;
    if (isNonBlank(r.enrollmentDate)) map[dateKey].enrolled++;
  });
  let hasData = false;
  Object.keys(map).sort().forEach(date => {
    const row = map[date];
    if (row.leads === 0) return;
    hasData = true;
    const tokCvr = ((row.tokens / row.leads) * 100).toFixed(2);
    const enrCvr = ((row.enrolled / row.leads) * 100).toFixed(2);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="mono">${date}</td><td class="mono">${fNum(row.leads)}</td><td class="mono">${fNum(row.tokens)}</td><td class="mono">${fNum(row.enrolled)}</td><td class="mono">${tokCvr}%</td><td class="mono">${enrCvr}%</td>`;
    tbody.appendChild(tr);
  });
  if (!hasData) emptyRow(tbody, 6);
}

function resetT1() {
  const bdeSel = document.getElementById('t1-filter-bde');
  if (bdeSel) bdeSel.value = 'ALL';
  populateT1Dropdowns();
  renderTable1();
}

function renderTable2() {
  const base = getBaseLAData();
  const srcVal = document.getElementById('t2-filter-source')?.value || 'ALL';
  const bdeVal = document.getElementById('t2-filter-bde')?.value || 'ALL';
  const pool = base.filter(r => (srcVal === 'ALL' || r.subSource === srcVal) && (bdeVal === 'ALL' || r.owner === bdeVal));
  renderLATable('la-table2-body', pool, 'date');
}

function resetT2() {
  const srcSel = document.getElementById('t2-filter-source');
  const bdeSel = document.getElementById('t2-filter-bde');
  if (srcSel) srcSel.value = 'ALL';
  if (bdeSel) bdeSel.value = 'ALL';
  const base = getBaseLAData();
  populateTableSourceDropdown('t2-filter-source', base, 'subSource');
  populateTableBDE('t2-filter-bde', base);
  renderTable2();
}

function onT3SubSourceChange() {
  const base = getBaseLAData();
  const srcVal = document.getElementById('t3-filter-source')?.value || 'ALL';
  const pool = srcVal === 'ALL' ? base : base.filter(r => r.subSource === srcVal);
  populateTableCampaignDropdown('t3-filter-campaign', pool);
  renderTable3();
}

function renderTable3() {
  const base = getBaseLAData();
  const cmpVal = document.getElementById('t3-filter-campaign')?.value || 'ALL';
  const srcVal = document.getElementById('t3-filter-source')?.value || 'ALL';
  const bdeVal = document.getElementById('t3-filter-bde')?.value || 'ALL';
  const pool = base.filter(r =>
    (cmpVal === 'ALL' || laCampaignLabel(r.campaign) === cmpVal) &&
    (srcVal === 'ALL' || r.subSource === srcVal) &&
    (bdeVal === 'ALL' || r.owner === bdeVal)
  );
  renderLATable('la-table3-body', pool, 'date');
}

function resetT3() {
  const cmpSel = document.getElementById('t3-filter-campaign');
  const srcSel = document.getElementById('t3-filter-source');
  const bdeSel = document.getElementById('t3-filter-bde');
  if (cmpSel) cmpSel.value = 'ALL';
  if (srcSel) srcSel.value = 'ALL';
  if (bdeSel) bdeSel.value = 'ALL';
  const base = getBaseLAData();
  populateTableCampaignDropdown('t3-filter-campaign', base);
  populateTableSourceDropdown('t3-filter-source', base, 'subSource');
  populateTableBDE('t3-filter-bde', base);
  renderTable3();
}

function renderLATable(tbodyId, pool, groupBy) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';
  const map = {};
  pool.forEach(r => {
    let key;
    if (groupBy === 'source') key = r.source || '(unknown)';
    else if (groupBy === 'subSource') key = r.subSource || '(unknown)';
    else if (groupBy === 'campaign') key = laCampaignLabel(r.campaign);
    else key = r.createdOn || '(unknown)';
    if (!map[key]) map[key] = { leads: 0, tokens: 0, enrolled: 0 };
    map[key].leads++;
    if (isNonBlank(r.tokenDate)) map[key].tokens++;
    if (isNonBlank(r.enrollmentDate)) map[key].enrolled++;
  });
  let hasData = false;
  Object.keys(map).sort().forEach(key => {
    const row = map[key];
    if (row.leads === 0) return;
    hasData = true;
    const tokCvr = ((row.tokens / row.leads) * 100).toFixed(2);
    const enrCvr = ((row.enrolled / row.leads) * 100).toFixed(2);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="mono">${key}</td><td class="mono">${fNum(row.leads)}</td><td class="mono">${fNum(row.tokens)}</td><td class="mono">${fNum(row.enrolled)}</td><td class="mono">${tokCvr}%</td><td class="mono">${enrCvr}%</td>`;
    tbody.appendChild(tr);
  });
  if (!hasData) emptyRow(tbody, 6);
}

// ==========================================
// DATE FILTER HANDLERS
// ==========================================
function onDateOptionChange() {
  const opt = document.getElementById('filter-date').value;
  if (opt === 'custom') { showCustomDatePopup(); }
  else { applyDatePreset(opt); }
}

function applyDatePreset(opt) {
  const today = new Date();
  const toISODate = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  let fromDate = '', toDate = '';
  switch (opt) {
    case 'today': fromDate = toDate = toISODate(today); break;
    case 'yesterday': const yest = new Date(); yest.setDate(today.getDate() - 1); fromDate = toDate = toISODate(yest); break;
    case 'last7days': const s7 = new Date(); s7.setDate(today.getDate() - 6); fromDate = toISODate(s7); toDate = toISODate(today); break;
    case 'thismonth': fromDate = toISODate(new Date(today.getFullYear(), today.getMonth(), 1)); toDate = toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0)); break;
    case 'lastmonth': fromDate = toISODate(new Date(today.getFullYear(), today.getMonth() - 1, 1)); toDate = toISODate(new Date(today.getFullYear(), today.getMonth(), 0)); break;
    case 'last3months': fromDate = toISODate(new Date(today.getFullYear(), today.getMonth() - 3, 1)); toDate = toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0)); break;
    default: return;
  }
  const dfEl = document.getElementById('date-from');
  const dtEl = document.getElementById('date-to');
  if (dfEl) dfEl.value = fromDate;
  if (dtEl) dtEl.value = toDate;
  activeFilters.dateFrom = fromDate;
  activeFilters.dateTo = toDate;
  userSelectedDate = true;
  lastAppliedDateOption = opt;
  updateDateDisplayLabel();
  applyFilters();
}

function showCustomDatePopup() {
  const popup = document.getElementById('custom-date-popup');
  if (!popup) return;
  const dfEl = document.getElementById('date-from');
  const dtEl = document.getElementById('date-to');
  if (dfEl) dfEl.value = activeFilters.dateFrom;
  if (dtEl) dtEl.value = activeFilters.dateTo;
  popup.style.display = 'block';
}

function closeCustomDatePopup(apply) {
  const popup = document.getElementById('custom-date-popup');
  if (!popup) return;
  if (apply) {
    const fromVal = document.getElementById('date-from').value;
    const toVal = document.getElementById('date-to').value;
    if (!fromVal || !toVal) { alert('Please select both From and To dates.'); return; }
    activeFilters.dateFrom = fromVal;
    activeFilters.dateTo = toVal;
    userSelectedDate = true;
    lastAppliedDateOption = 'custom';
    updateDateDisplayLabel();
    applyFilters();
  } else {
    const filterDateEl = document.getElementById('filter-date');
    if (filterDateEl) filterDateEl.value = lastAppliedDateOption;
  }
  popup.style.display = 'none';
}

function updateDateDisplayLabel() {
  const label = document.getElementById('date-display-label');
  if (!label) return;
  const from = activeFilters.dateFrom;
  const to = activeFilters.dateTo;
  if (from && to) { label.textContent = `${from} to ${to}`; label.style.display = 'inline-block'; }
  else { label.textContent = ''; label.style.display = 'none'; }
}

document.addEventListener('click', event => {
  const wrapper = document.querySelector('.date-select-wrapper');
  const popup = document.getElementById('custom-date-popup');
  if (popup && popup.style.display === 'block' && wrapper && !wrapper.contains(event.target)) {
    closeCustomDatePopup(false);
  }
});

// ==========================================
// INIT
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  if (!restoreSession()) {
    showLoginScreen();
    const usernameInput = document.getElementById('login-username');
    if (usernameInput) usernameInput.focus();
  }
});
