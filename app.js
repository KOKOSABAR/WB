/* ==========================================================================
   LOGIKA APLIKASI - RESTEASE BREAK SYSTEM
   ========================================================================== */

// Global default shift configuration
const defaultShiftHours = {
    "1": { name: "Shift Pagi", start: "07:45:00", end: "19:45:00" },
    "2": { name: "Shift Malam", start: "19:45:00", end: "07:45:00" },
    "1/2": { name: "Shift Setengah Hari", start: "07:45:00", end: "13:00:00" }
};
window.defaultShiftHours = defaultShiftHours;

const ALLOWED_ROLE_OPTIONS = [
    "CS LINE",
    "CS LC",
    "KAPTEN KASIR",
    "KASIR"
];

// 1. STATE GLOBAL APLIKASI
let supabaseClient = null;
const SUPABASE_URL = "https://uvytxtnkjrjzrkyxxyxe.supabase.co";
const DEFAULT_ANON_KEY = "sb_publishable_AM4hZNhm32BTX7jEpSX7yw_oXEcQOGb";

let state = {
    settings: {
        default_duration: "00:20:00", // format default HH:MM:SS
        daily_quota: 4,
        admin_passcode: "wdbos88",
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)"
    },
    staff: [],
    rolesConfig: [],
    activeBreaks: [],
    logs: [],
    currentStaff: null, // staff yang sedang login di konsol
    staffBackgroundAnimationEnabled: true,
    reportMode: "daily", // "daily" atau "monthly"
    absensiShifts: [],
    absensiLogs: [],
    absensiActiveTab: "daily",
    absensiSelectedDay: new Date().getDate(),
    absensiSelectedMonth: new Date().toLocaleDateString('sv-SE').substring(0, 7), // YYYY-MM
    absensiUseLocalFallback: false,
    
    // Paspor State
    passportHandovers: [],
    pasporSelectedDate: new Date().toLocaleDateString('sv-SE'),
    pasporSearchQuery: "",
    pasporRoleFilter: "all",
    pasporStatusFilter: "all"
};

function syncGlobalAppRefs() {
    window.state = state;
    window.supabaseClient = supabaseClient;
}

syncGlobalAppRefs();

// Interval penampung timer
let activeTimers = {};
let consoleTimerInterval = null;
let activeBreakTickerInterval = null;
let scheduledRenderFrame = null;
const scheduledRenderJobs = new Map();

function debounce(fn, delay = 120) {
    let timeoutId = null;
    return (...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

function scheduleRender(key, job) {
    scheduledRenderJobs.set(key, job);
    if (scheduledRenderFrame !== null) return;
    
    scheduledRenderFrame = requestAnimationFrame(() => {
        const jobs = Array.from(scheduledRenderJobs.values());
        scheduledRenderJobs.clear();
        scheduledRenderFrame = null;
        
        jobs.forEach(runJob => {
            try {
                runJob();
            } catch (err) {
                console.error("Gagal menjalankan render terjadwal:", err);
            }
        });
    });
}

function isSectionActive(sectionId) {
    const section = document.getElementById(sectionId);
    return !!section && section.classList.contains("active");
}

function getActiveIzinTabId() {
    const activeBtn = document.querySelector("#izinTabMenu .btn-tab.active");
    return activeBtn ? activeBtn.getAttribute("data-izin-target") : "monitorView";
}

function renderMonitorSection() {
    renderRoleSlots();
    renderActiveBreaks();
    updateStatsSummary();
}

function renderCurrentMainView() {
    if (isSectionActive("izinView")) {
        const activeIzinTabId = getActiveIzinTabId();
        if (activeIzinTabId === "monitorView") {
            renderMonitorSection();
        } else if (activeIzinTabId === "reportsView") {
            renderReports();
        }
    }
    
    if (isSectionActive("adminView")) {
        renderAdminStaff();
        renderAdminRoles();
    }
    
    if (isSectionActive("absensiView")) {
        renderAbsensi();
    }
    
    if (isSectionActive("pasporView") && typeof renderPasporView === "function") {
        renderPasporView();
    }
    
    if (isSectionActive("bandingView") && typeof renderBandingView === "function") {
        renderBandingView();
    }
}

function clearActiveBreakTicker() {
    if (activeBreakTickerInterval) {
        clearInterval(activeBreakTickerInterval);
        activeBreakTickerInterval = null;
    }
}

function updateActiveBreakCards() {
    state.activeBreaks.forEach(ab => {
        const card = document.getElementById(`activeCard_${ab.staff_id}`);
        if (!card) return;
        
        const timerContainer = card.querySelector(".active-card-timer");
        const timerVal = card.querySelector(".timer-val");
        const progressBar = card.querySelector(".timer-progress-bar");
        const elapsedInfo = card.querySelector(".elapsed-info");
        if (!timerContainer || !timerVal || !progressBar || !elapsedInfo) return;
        
        const start = new Date(ab.start_time).getTime();
        const now = new Date().getTime();
        const elapsed = Math.floor((now - start) / 1000);
        const totalAllowedSeconds = ab.allowed_duration;
        const remaining = totalAllowedSeconds - elapsed;
        
        timerVal.textContent = formatDurationSeconds(remaining);
        
        if (remaining < 0) {
            card.classList.add("late");
            timerContainer.className = "active-card-timer late";
            elapsedInfo.textContent = `Terlambat: ${formatDurationSeconds(elapsed - totalAllowedSeconds)}`;
            progressBar.style.width = "100%";
            progressBar.style.backgroundColor = "var(--danger)";
        } else {
            card.classList.remove("late");
            const pct = Math.min((elapsed / totalAllowedSeconds) * 100, 100);
            progressBar.style.width = `${pct}%`;
            
            if (remaining < 180) {
                timerContainer.className = "active-card-timer warning";
                elapsedInfo.textContent = "Sisa < 3 menit";
                progressBar.style.backgroundColor = "var(--warning)";
            } else {
                timerContainer.className = "active-card-timer safe";
                elapsedInfo.textContent = "Istirahat";
                progressBar.style.backgroundColor = "var(--accent)";
            }
        }
    });
}

function startActiveBreakTicker() {
    if (state.activeBreaks.length === 0) {
        clearActiveBreakTicker();
        return;
    }
    updateActiveBreakCards();
    if (!activeBreakTickerInterval) {
        activeBreakTickerInterval = setInterval(updateActiveBreakCards, 1000);
    }
}

// Helper: Konversi format HH:MM:SS atau MM ke Detik
function getDurationSeconds(duration) {
    if (typeof duration === 'number') {
        return duration * 60; // Jika berupa angka menit
    }
    if (typeof duration === 'string') {
        if (duration.includes(':')) {
            const parts = duration.split(':');
            if (parts.length === 3) {
                const hrs = parseInt(parts[0], 10) || 0;
                const mins = parseInt(parts[1], 10) || 0;
                const secs = parseInt(parts[2], 10) || 0;
                return hrs * 3600 + mins * 60 + secs;
            } else if (parts.length === 2) {
                const mins = parseInt(parts[0], 10) || 0;
                const secs = parseInt(parts[1], 10) || 0;
                return mins * 60 + secs;
            }
        }
        const parsed = parseInt(duration, 10);
        if (!isNaN(parsed)) return parsed * 60;
    }
    return 20 * 60; // default 20 menit (1200 detik)
}

// Helper: Menampilkan format HH:MM:SS untuk kolom input
function getDurationString(duration) {
    if (typeof duration === 'number') {
        return formatDurationSeconds(duration * 60);
    }
    if (typeof duration === 'string') {
        if (duration.includes(':')) {
            const parts = duration.split(':');
            if (parts.length === 3) return duration;
            if (parts.length === 2) return `00:${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        }
        const parsed = parseInt(duration, 10);
        if (!isNaN(parsed)) return formatDurationSeconds(parsed * 60);
    }
    return "00:20:00";
}

function formatRoleNameUpper(role) {
    if (!role) return "";
    let r = String(role).trim().toUpperCase();
    if (r === "CS") return "CS LC";
    return r;
}
window.formatRoleNameUpper = formatRoleNameUpper;

const ROLE_ORDER_MAP = {
    "CS LINE": 1,
    "CS LC": 2,
    "KAPTEN KASIR": 3,
    "KASIR": 4
};

const RBAC_MENUS = [
    { id: 'chatView', label: 'Team Chat' },
    { id: 'izinView', label: 'Izin Istirahat / Console' },
    { id: 'clockInView', label: 'Clock In' },
    { id: 'absensiView', label: 'Absensi WDBOS' },
    { id: 'pasporView', label: 'Serah Terima Paspor' },
    { id: 'buktiView', label: 'Doc Bukti' },
    { id: 'dataRekeningView', label: 'Data Rekening' },
    { id: 'bandingView', label: 'Banding Kesalahan CS' },
    { id: 'qrisView', label: 'Cek QRIS' },
    { id: 'serahTerimaCSLineView', label: 'Serah Terima CS LINE' },
    { id: 'serahTerimaKaptenView', label: 'Serah Terima Kapten' },
    { id: 'serahTerimaKasirView', label: 'Serah Terima Kasir' },
    { id: 'adminView', label: 'Admin Panel' }
];

const DEFAULT_ROLE_ACCESS = {
    chatView: ['CS LINE', 'CS LC', 'KAPTEN KASIR', 'KASIR'],
    izinView: ['CS LINE', 'CS LC', 'KAPTEN KASIR', 'KASIR'],
    clockInView: ['CS LINE', 'CS LC', 'KAPTEN KASIR', 'KASIR'],
    absensiView: ['CS LINE', 'KAPTEN KASIR'],
    pasporView: ['CS LINE', 'KAPTEN KASIR'],
    dataRekeningView: ['CS LINE', 'KAPTEN KASIR'],
    serahTerimaCSLineView: ['CS LINE', 'KAPTEN KASIR'],
    serahTerimaKaptenView: ['CS LINE', 'KAPTEN KASIR'],
    adminView: ['CS LINE', 'KAPTEN KASIR'],
    serahTerimaKasirView: ['KASIR', 'KAPTEN KASIR'],
    bandingView: ['CS LC', 'CS LINE', 'KAPTEN KASIR'],
    qrisView: ['CS LC', 'CS LINE', 'KAPTEN KASIR'],
    buktiView: ['CS LC', 'CS LINE', 'KAPTEN KASIR', 'KASIR']
};

function getRoleOrderScore(role) {
    const r = formatRoleNameUpper(role);
    return ROLE_ORDER_MAP[r] || 99;
}
window.getRoleOrderScore = getRoleOrderScore;

function normalizeRoleName(role) {
    return formatRoleNameUpper(role);
}

function getAllowedRoles() {
    return [...ALLOWED_ROLE_OPTIONS];
}

function isSameRole(roleA, roleB) {
    const normalizedA = normalizeRoleName(roleA);
    const normalizedB = normalizeRoleName(roleB);
    return normalizedA !== "" && normalizedA === normalizedB;
}

function isAllowedRole(roleName) {
    return getAllowedRoles().some(role => isSameRole(role, roleName));
}

function getRoleConfigByName(roleName) {
    return state.rolesConfig.find(rc => isSameRole(rc.role, roleName)) || null;
}

function getCanonicalRoleName(roleName) {
    const matchedConfig = getRoleConfigByName(roleName);
    if (matchedConfig) return formatRoleNameUpper(matchedConfig.role);
    
    const allowedRole = getAllowedRoles().find(role => isSameRole(role, roleName));
    if (allowedRole) return allowedRole;
    
    return formatRoleNameUpper(roleName);
}

function getActiveBreakRoleName(activeBreak) {
    if (!activeBreak) return "";
    
    const linkedStaff = activeBreak.staff_id
        ? state.staff.find(staff => staff.id === activeBreak.staff_id)
        : null;
    
    return getCanonicalRoleName(linkedStaff?.role || activeBreak.role);
}

function getActiveBreaksByRole(roleName) {
    return state.activeBreaks.filter(activeBreak => isSameRole(getActiveBreakRoleName(activeBreak), roleName));
}

function getManagedRolesConfig() {
    return getAllowedRoles().map(roleName => {
        const existingConfig = getRoleConfigByName(roleName);
        return existingConfig || { role: roleName, max_slots: 1 };
    });
}

// Custom Confirm Modal System (Lebih Mewah & Glassmorphism)
function showCustomConfirm(message, title = "Konfirmasi Tindakan", isDanger = true) {
    return new Promise((resolve) => {
        const modal = document.getElementById("customConfirmModal");
        const titleEl = document.getElementById("confirmTitle");
        const messageEl = document.getElementById("confirmMessage");
        const btnCancel = document.getElementById("btnConfirmCancel");
        const btnOk = document.getElementById("btnConfirmOk");
        const iconEl = modal.querySelector(".modal-icon i");
        const cardEl = modal.querySelector(".modal-card");
        
        titleEl.textContent = title;
        messageEl.textContent = message;
        
        // Atur tampilan ikon dan border berdasarkan level bahaya
        if (isDanger) {
            btnOk.className = "btn btn-danger";
            btnOk.textContent = "Hapus / Lanjutkan";
            iconEl.className = "fa-solid fa-triangle-exclamation";
            cardEl.style.border = "1px solid rgba(239, 68, 68, 0.35)";
            modal.querySelector(".modal-icon").style.color = "var(--danger)";
            modal.querySelector(".modal-icon").style.background = "rgba(239, 68, 68, 0.15)";
        } else {
            btnOk.className = "btn btn-primary";
            btnOk.textContent = "Ya, Lanjutkan";
            iconEl.className = "fa-solid fa-circle-question";
            cardEl.style.border = "1px solid rgba(99, 102, 241, 0.35)";
            modal.querySelector(".modal-icon").style.color = "var(--primary)";
            modal.querySelector(".modal-icon").style.background = "rgba(99, 102, 241, 0.15)";
        }
        
        modal.classList.remove("hide");
        
        const onCancel = () => {
            modal.classList.add("hide");
            cleanup();
            resolve(false);
        };
        
        const onOk = () => {
            modal.classList.add("hide");
            cleanup();
            resolve(true);
        };
        
        const cleanup = () => {
            btnCancel.removeEventListener("click", onCancel);
            btnOk.removeEventListener("click", onOk);
        };
        
        btnCancel.addEventListener("click", onCancel);
        btnOk.addEventListener("click", onOk);
    });
}

function showCustomPrompt(message, title = "Otorisasi Admin") {
    return new Promise((resolve) => {
        const modal = document.getElementById("customPromptModal");
        const titleEl = document.getElementById("promptTitle");
        const messageEl = document.getElementById("promptMessage");
        const inputEl = document.getElementById("promptInput");
        const btnCancel = document.getElementById("btnPromptCancel");
        const btnOk = document.getElementById("btnPromptOk");
        
        if (!modal || !titleEl || !messageEl || !inputEl || !btnCancel || !btnOk) {
            console.error("Elemen modal prompt kustom tidak ditemukan.");
            const val = prompt(message);
            resolve(val);
            return;
        }
        
        titleEl.textContent = title;
        messageEl.textContent = message;
        inputEl.value = "";
        
        modal.classList.remove("hide");
        setTimeout(() => inputEl.focus(), 50);
        
        const onCancel = () => {
            modal.classList.add("hide");
            cleanup();
            resolve(null);
        };
        
        const onOk = () => {
            const val = inputEl.value;
            modal.classList.add("hide");
            cleanup();
            resolve(val);
        };
        
        const onKeyDown = (e) => {
            if (e.key === "Enter") {
                onOk();
            } else if (e.key === "Escape") {
                onCancel();
            }
        };
        
        const cleanup = () => {
            btnCancel.removeEventListener("click", onCancel);
            btnOk.removeEventListener("click", onOk);
            inputEl.removeEventListener("keydown", onKeyDown);
        };
        
        btnCancel.addEventListener("click", onCancel);
        btnOk.addEventListener("click", onOk);
        inputEl.addEventListener("keydown", onKeyDown);
    });
}

function normalizeDetachedViewSections() {
    const appContent = document.querySelector(".app-content");
    if (!appContent) return;

    const detachedViewIds = [
        "pasporView",
        "buktiView",
        "bandingView",
        "qrisView",
        "serahTerimaCSLineView",
        "serahTerimaKaptenView",
        "serahTerimaKasirView",
        "chatView",
        "dataRekeningView"
    ];

    detachedViewIds.forEach(viewId => {
        const section = document.getElementById(viewId);
        if (!section || section.parentElement === appContent) return;
        appContent.appendChild(section);
    });
}
window.normalizeDetachedViewSections = normalizeDetachedViewSections;

// 2. INITIALIZATION & KONEKSI SUPABASE
document.addEventListener("DOMContentLoaded", () => {
    normalizeDetachedViewSections();
    initApp();
    setupEventListeners();
    initStaffConsoleMotion();
    startClock();
    
    // Initialize background customizer
    if (typeof initBackgroundCustomizer === 'function') {
        initBackgroundCustomizer();
    }

    // Initialize theme preset — load per-staff jika ada session tersimpan, fallback ke global
    const savedStaffIdForTheme = localStorage.getItem('restease_current_staff_id');
    if (savedStaffIdForTheme) {
        // Staff tersimpan — tema akan di-load saat loadAllData selesai (auto-login flow)
        // Terapkan sementara tema staff agar tidak flash default sebelum data load
        const staffThemeKey = `restease_theme_preset_${savedStaffIdForTheme}`;
        const earlyTheme = localStorage.getItem(staffThemeKey);
        if (earlyTheme) applyThemePreset(earlyTheme, null, true);
    } else {
        // Tidak ada staff login — tidak terapkan tema apapun (default)
    }
});

// ============================================================
// THEME PRESET SYSTEM
// ============================================================
const ALL_THEME_CLASSES = [
    'theme-gx-classic','theme-ultraviolet','theme-sub-zero','theme-frutti-di-mare',
    'theme-purple-haze','theme-vaporwave','theme-rose-quartz','theme-coming-soon',
    'theme-hackerman','theme-lambda','theme-after-eight','theme-pay-to-win','theme-white-wolf',
    'theme-glass'
];

// CSS variables + overlay gradient per tema
// overlay  = background utama #bgOverlay (gelap + warna kuat)
// orb1/orb2 = ambient glow orbs (body::before / body::after) via dynamic style
// glassTint = warna tint semi-transparan untuk glass card borders
const THEME_DATA = {
    'gx-classic': {
        primary:'#e91e63', primaryHover:'#c2185b', primaryGlow:'rgba(233,30,99,0.45)',
        accent:'#ff5252',  accentGlow:'rgba(255,82,82,0.4)',  focusBorder:'rgba(233,30,99,0.6)',
        bgDark:'#0d0307',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(233,30,99,0.32) 0%, rgba(233,30,99,0.08) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(255,82,82,0.22) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(176,0,60,0.18) 0%, transparent 50%), linear-gradient(160deg, #1a0308 0%, #1e0510 40%, #180306 70%, #1a0408 100%)',
        orb1:'rgba(233,30,99,0.22)', orb2:'rgba(255,82,82,0.16)',
        glassTint:'rgba(233,30,99,0.08)', cardBorder:'rgba(233,30,99,0.2)'
    },
    'ultraviolet': {
        primary:'#7c3aed', primaryHover:'#6d28d9', primaryGlow:'rgba(124,58,237,0.5)',
        accent:'#a855f7',  accentGlow:'rgba(168,85,247,0.4)',  focusBorder:'rgba(124,58,237,0.6)',
        bgDark:'#060310',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(124,58,237,0.30) 0%, rgba(124,58,237,0.08) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(168,85,247,0.22) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(109,40,217,0.18) 0%, transparent 50%), linear-gradient(160deg, #0c0518 0%, #0e0620 40%, #0b0416 70%, #0d051c 100%)',
        orb1:'rgba(124,58,237,0.22)', orb2:'rgba(168,85,247,0.18)',
        glassTint:'rgba(124,58,237,0.09)', cardBorder:'rgba(124,58,237,0.22)'
    },
    'sub-zero': {
        primary:'#2563eb', primaryHover:'#1d4ed8', primaryGlow:'rgba(37,99,235,0.5)',
        accent:'#38bdf8',  accentGlow:'rgba(56,189,248,0.4)',  focusBorder:'rgba(37,99,235,0.6)',
        bgDark:'#020610',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(37,99,235,0.30) 0%, rgba(37,99,235,0.08) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(56,189,248,0.22) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(29,78,216,0.18) 0%, transparent 50%), linear-gradient(160deg, #030816 0%, #04091c 40%, #030818 70%, #030918 100%)',
        orb1:'rgba(37,99,235,0.22)', orb2:'rgba(56,189,248,0.18)',
        glassTint:'rgba(37,99,235,0.09)', cardBorder:'rgba(37,99,235,0.22)'
    },
    'frutti-di-mare': {
        primary:'#f43f5e', primaryHover:'#e11d48', primaryGlow:'rgba(244,63,94,0.45)',
        accent:'#fb7185',  accentGlow:'rgba(251,113,133,0.4)', focusBorder:'rgba(244,63,94,0.6)',
        bgDark:'#0f0407',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(244,63,94,0.30) 0%, rgba(244,63,94,0.08) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(251,113,133,0.22) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(225,29,72,0.18) 0%, transparent 50%), linear-gradient(160deg, #1a0408 0%, #1e050a 40%, #190408 70%, #1b0408 100%)',
        orb1:'rgba(244,63,94,0.22)', orb2:'rgba(251,113,133,0.18)',
        glassTint:'rgba(244,63,94,0.08)', cardBorder:'rgba(244,63,94,0.22)'
    },
    'purple-haze': {
        primary:'#84cc16', primaryHover:'#65a30d', primaryGlow:'rgba(132,204,22,0.45)',
        accent:'#a3e635',  accentGlow:'rgba(163,230,53,0.4)',  focusBorder:'rgba(132,204,22,0.6)',
        bgDark:'#040e03',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(132,204,22,0.28) 0%, rgba(132,204,22,0.07) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(163,230,53,0.20) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(101,163,13,0.16) 0%, transparent 50%), linear-gradient(160deg, #071404 0%, #081606 40%, #061304 70%, #071404 100%)',
        orb1:'rgba(132,204,22,0.20)', orb2:'rgba(163,230,53,0.16)',
        glassTint:'rgba(132,204,22,0.08)', cardBorder:'rgba(132,204,22,0.20)'
    },
    'vaporwave': {
        primary:'#06b6d4', primaryHover:'#0891b2', primaryGlow:'rgba(6,182,212,0.45)',
        accent:'#2dd4bf',  accentGlow:'rgba(45,212,191,0.4)',  focusBorder:'rgba(6,182,212,0.6)',
        bgDark:'#020c0f',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(6,182,212,0.28) 0%, rgba(6,182,212,0.07) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(45,212,191,0.22) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(8,145,178,0.18) 0%, transparent 50%), linear-gradient(160deg, #031214 0%, #041614 40%, #031113 70%, #031314 100%)',
        orb1:'rgba(6,182,212,0.22)', orb2:'rgba(45,212,191,0.18)',
        glassTint:'rgba(6,182,212,0.09)', cardBorder:'rgba(6,182,212,0.22)'
    },
    'rose-quartz': {
        primary:'#d946ef', primaryHover:'#c026d3', primaryGlow:'rgba(217,70,239,0.45)',
        accent:'#f0abfc',  accentGlow:'rgba(240,171,252,0.4)', focusBorder:'rgba(217,70,239,0.6)',
        bgDark:'#0e030f',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(217,70,239,0.30) 0%, rgba(217,70,239,0.08) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(240,171,252,0.22) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(192,38,211,0.18) 0%, transparent 50%), linear-gradient(160deg, #1a0418 0%, #1e051c 40%, #190418 70%, #1a0418 100%)',
        orb1:'rgba(217,70,239,0.22)', orb2:'rgba(240,171,252,0.18)',
        glassTint:'rgba(217,70,239,0.09)', cardBorder:'rgba(217,70,239,0.22)'
    },
    'coming-soon': {
        primary:'#eab308', primaryHover:'#ca8a04', primaryGlow:'rgba(234,179,8,0.45)',
        accent:'#86efac',  accentGlow:'rgba(134,239,172,0.4)', focusBorder:'rgba(234,179,8,0.6)',
        bgDark:'#0e0c03',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(234,179,8,0.28) 0%, rgba(234,179,8,0.07) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(134,239,172,0.20) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(202,138,4,0.18) 0%, transparent 50%), linear-gradient(160deg, #151205 0%, #181405 40%, #141105 70%, #161205 100%)',
        orb1:'rgba(234,179,8,0.20)', orb2:'rgba(134,239,172,0.16)',
        glassTint:'rgba(234,179,8,0.08)', cardBorder:'rgba(234,179,8,0.20)'
    },
    'hackerman': {
        primary:'#22c55e', primaryHover:'#16a34a', primaryGlow:'rgba(34,197,94,0.45)',
        accent:'#4ade80',  accentGlow:'rgba(74,222,128,0.4)',  focusBorder:'rgba(34,197,94,0.6)',
        bgDark:'#030e05',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(34,197,94,0.28) 0%, rgba(34,197,94,0.07) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(74,222,128,0.22) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(22,163,74,0.18) 0%, transparent 50%), linear-gradient(160deg, #041408 0%, #05160a 40%, #041407 70%, #051609 100%)',
        orb1:'rgba(34,197,94,0.22)', orb2:'rgba(74,222,128,0.18)',
        glassTint:'rgba(34,197,94,0.09)', cardBorder:'rgba(34,197,94,0.22)'
    },
    'lambda': {
        primary:'#f97316', primaryHover:'#ea580c', primaryGlow:'rgba(249,115,22,0.45)',
        accent:'#fbbf24',  accentGlow:'rgba(251,191,36,0.4)',  focusBorder:'rgba(249,115,22,0.6)',
        bgDark:'#0f0803',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(249,115,22,0.28) 0%, rgba(249,115,22,0.07) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(251,191,36,0.22) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(234,88,12,0.18) 0%, transparent 50%), linear-gradient(160deg, #160a03 0%, #180c04 40%, #150a03 70%, #170b03 100%)',
        orb1:'rgba(249,115,22,0.22)', orb2:'rgba(251,191,36,0.18)',
        glassTint:'rgba(249,115,22,0.09)', cardBorder:'rgba(249,115,22,0.22)'
    },
    'after-eight': {
        primary:'#14b8a6', primaryHover:'#0f9688', primaryGlow:'rgba(20,184,166,0.45)',
        accent:'#5eead4',  accentGlow:'rgba(94,234,212,0.4)',  focusBorder:'rgba(20,184,166,0.6)',
        bgDark:'#030e0d',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(20,184,166,0.28) 0%, rgba(20,184,166,0.07) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(94,234,212,0.20) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(15,150,136,0.18) 0%, transparent 50%), linear-gradient(160deg, #041412 0%, #05160f 40%, #041311 70%, #051412 100%)',
        orb1:'rgba(20,184,166,0.22)', orb2:'rgba(94,234,212,0.18)',
        glassTint:'rgba(20,184,166,0.09)', cardBorder:'rgba(20,184,166,0.22)'
    },
    'pay-to-win': {
        primary:'#f59e0b', primaryHover:'#d97706', primaryGlow:'rgba(245,158,11,0.45)',
        accent:'#d9f99d',  accentGlow:'rgba(217,249,157,0.4)', focusBorder:'rgba(245,158,11,0.6)',
        bgDark:'#0e0b02',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(245,158,11,0.28) 0%, rgba(245,158,11,0.07) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(217,249,157,0.20) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(217,119,6,0.18) 0%, transparent 50%), linear-gradient(160deg, #161004 0%, #181204 40%, #151004 70%, #171104 100%)',
        orb1:'rgba(245,158,11,0.22)', orb2:'rgba(217,249,157,0.16)',
        glassTint:'rgba(245,158,11,0.09)', cardBorder:'rgba(245,158,11,0.22)'
    },
    'white-wolf': {
        primary:'#94a3b8', primaryHover:'#64748b', primaryGlow:'rgba(148,163,184,0.35)',
        accent:'#e2e8f0',  accentGlow:'rgba(226,232,240,0.25)', focusBorder:'rgba(148,163,184,0.5)',
        bgDark:'#060708',
        overlay:'radial-gradient(ellipse at 15% 15%, rgba(148,163,184,0.18) 0%, rgba(148,163,184,0.05) 40%, transparent 65%), radial-gradient(ellipse at 85% 85%, rgba(226,232,240,0.14) 0%, transparent 55%), radial-gradient(ellipse at 50% 0%, rgba(100,116,139,0.12) 0%, transparent 50%), linear-gradient(160deg, #0a0b0d 0%, #0c0d0f 40%, #0a0b0d 70%, #0b0c0e 100%)',
        orb1:'rgba(148,163,184,0.14)', orb2:'rgba(226,232,240,0.10)',
        glassTint:'rgba(148,163,184,0.06)', cardBorder:'rgba(148,163,184,0.18)'
    },

    // ── Glass — iPhone Liquid Glass / Frosted Premium ─────────────────────
    'glass': {
        primary:'#a8c8ff', primaryHover:'#7fb3ff', primaryGlow:'rgba(168,200,255,0.55)',
        accent:'#d4c8ff',  accentGlow:'rgba(212,200,255,0.45)', focusBorder:'rgba(168,200,255,0.75)',
        bgDark:'#060a14',
        overlay:[
            'radial-gradient(ellipse at 18% 12%, rgba(100,160,255,0.36) 0%, rgba(70,110,220,0.12) 42%, transparent 68%)',
            'radial-gradient(ellipse at 82% 88%, rgba(190,130,255,0.30) 0%, rgba(140,90,220,0.10) 42%, transparent 65%)',
            'radial-gradient(ellipse at 55% 45%, rgba(80,200,220,0.14) 0%, transparent 55%)',
            'radial-gradient(ellipse at 28% 78%, rgba(210,160,255,0.14) 0%, transparent 50%)',
            'radial-gradient(ellipse at 70% 20%, rgba(140,200,255,0.10) 0%, transparent 45%)',
            'linear-gradient(160deg, #060a14 0%, #090f26 40%, #080d1e 70%, #070b18 100%)'
        ].join(', '),
        orb1:'rgba(100,165,255,0.36)', orb2:'rgba(190,135,255,0.28)',
        glassTint:'rgba(140,190,255,0.06)', cardBorder:'rgba(160,210,255,0.18)'
    },
};

// Helper: ambil localStorage key tema berdasarkan staff yang sedang login
function getThemeStorageKey() {
    const staffId = state.currentStaff?.id || localStorage.getItem('restease_current_staff_id') || 'guest';
    return `restease_theme_preset_${staffId}`;
}

// Helper: load dan terapkan tema tersimpan untuk staff tertentu
function loadAndApplyStaffTheme(staffId, silent = true) {
    const key = `restease_theme_preset_${staffId}`;
    const savedTheme = localStorage.getItem(key) || 'default';
    applyThemePreset(savedTheme, null, silent);
}
window.loadAndApplyStaffTheme = loadAndApplyStaffTheme;

function applyThemePreset(themeName, clickedCard, silent) {
    const root = document.documentElement;
    const themeInfo = THEME_DATA[themeName];

    // ── 1. Hapus semua theme class dari body ──────────────────────────────
    ALL_THEME_CLASSES.forEach(cls => document.body.classList.remove(cls));

    // ── 2. Terapkan theme class baru ──────────────────────────────────────
    if (themeInfo) {
        document.body.classList.add('theme-' + themeName);
    }

    // ── 3. CSS variables di :root (override stylesheet) ───────────────────
    if (themeInfo) {
        root.style.setProperty('--primary',            themeInfo.primary);
        root.style.setProperty('--primary-hover',      themeInfo.primaryHover);
        root.style.setProperty('--primary-glow',       themeInfo.primaryGlow);
        root.style.setProperty('--accent',             themeInfo.accent);
        root.style.setProperty('--accent-glow',        themeInfo.accentGlow);
        root.style.setProperty('--glass-border-focus', themeInfo.focusBorder);
        root.style.setProperty('--bg-dark',            themeInfo.bgDark);
        root.style.setProperty('--glass-tint',         themeInfo.glassTint);
        root.style.setProperty('--card-border-theme',  themeInfo.cardBorder);
    } else {
        ['--primary','--primary-hover','--primary-glow','--accent','--accent-glow',
         '--glass-border-focus','--bg-dark','--glass-tint','--card-border-theme'
        ].forEach(v => root.style.removeProperty(v));
    }

    // ── 4. Background overlay (hanya kalau tidak ada wallpaper gambar) ────
    const bgOverlay = document.getElementById('bgOverlay');
    if (bgOverlay) {
        const hasBgImage = (bgOverlay.style.backgroundImage || '').includes('url(');
        if (!hasBgImage) {
            if (themeInfo) {
                bgOverlay.style.background      = themeInfo.overlay;
                bgOverlay.style.backgroundImage = 'none';
                bgOverlay.style.backgroundColor = themeInfo.bgDark;
            } else {
                const defaultBg = state.settings?.background ||
                    'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #31104b 100%)';
                bgOverlay.style.background      = defaultBg;
                bgOverlay.style.backgroundImage = 'none';
                bgOverlay.style.backgroundColor = '';
            }
        }
    }

    // ── 5. Ambient orb colors via dynamic <style> tag ─────────────────────
    let orbStyle = document.getElementById('themeOrbStyle');
    if (!orbStyle) {
        orbStyle = document.createElement('style');
        orbStyle.id = 'themeOrbStyle';
        document.head.appendChild(orbStyle);
    }
    if (themeInfo) {
        orbStyle.textContent = `
            body::before {
                background: radial-gradient(circle, ${themeInfo.orb1} 0%, transparent 70%) !important;
            }
            body::after {
                background: radial-gradient(circle, ${themeInfo.orb2} 0%, transparent 70%) !important;
            }
            body.theme-${themeName} .glass-card {
                background: linear-gradient(145deg, color-mix(in srgb, ${themeInfo.glassTint} 100%, rgba(14,20,40,0.85)) 0%, rgba(10,15,30,0.80) 100%) !important;
                border-color: ${themeInfo.cardBorder} !important;
            }
        `;
    } else {
        orbStyle.textContent = `
            body::before {
                background: radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%) !important;
            }
            body::after {
                background: radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%) !important;
            }
        `;
    }

    // ── 6. Simpan ke localStorage per-staff ───────────────────────────────
    const key = getThemeStorageKey();
    localStorage.setItem(key, themeName || 'default');

    // ── 7. Update radio button galeri ─────────────────────────────────────
    document.querySelectorAll('.theme-preset-card').forEach(card => {
        const radio    = card.querySelector('.theme-radio');
        const isActive = card.getAttribute('data-theme') === themeName;
        if (isActive) {
            card.style.border     = `2px solid ${themeInfo ? themeInfo.primary : '#8b5cf6'}`;
            card.style.boxShadow  = `0 0 18px ${themeInfo ? themeInfo.primaryGlow : 'rgba(139,92,246,0.3)'}`;
            if (radio) {
                radio.style.background  = themeInfo ? themeInfo.primary : '#8b5cf6';
                radio.style.borderColor = themeInfo ? themeInfo.primary : '#8b5cf6';
                radio.innerHTML = '<div style="width:6px;height:6px;border-radius:50%;background:white;"></div>';
            }
        } else {
            card.style.border    = '2px solid rgba(255,255,255,0.08)';
            card.style.boxShadow = '';
            if (radio) {
                radio.style.background  = '';
                radio.style.borderColor = 'rgba(255,255,255,0.3)';
                radio.innerHTML         = '';
            }
        }
    });

    // ── 8. Toast notifikasi ───────────────────────────────────────────────
    if (!silent && themeInfo) {
        const names = {
            'gx-classic':'GX Classic','ultraviolet':'Ultraviolet','sub-zero':'Sub Zero',
            'frutti-di-mare':'Frutti Di Mare','purple-haze':'Purple Haze','vaporwave':'Vaporwave',
            'rose-quartz':'Rose Quartz','coming-soon':'Coming Soon','hackerman':'Hackerman',
            'lambda':'Lambda','after-eight':'After Eight','pay-to-win':'Pay-To-Win',
            'white-wolf':'White Wolf','glass':'Glass'
        };
        const displayName = names[themeName] || themeName;
        let toast = document.getElementById('themeToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'themeToast';
            toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(10,12,25,0.95);border-radius:10px;padding:9px 20px;color:#f1f5f9;font-size:0.78rem;font-weight:700;z-index:99999;opacity:0;transition:all 0.3s;pointer-events:none;backdrop-filter:blur(12px);white-space:nowrap;';
            document.body.appendChild(toast);
        }
        toast.style.borderColor = themeInfo.primary;
        toast.style.border      = `1px solid ${themeInfo.cardBorder}`;
        toast.innerHTML = `<i class="fa-solid fa-swatchbook" style="margin-right:7px;color:${themeInfo.primary}"></i>Tema <span style="color:${themeInfo.primary}">${displayName}</span> diterapkan`;
        toast.style.opacity   = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.style.opacity   = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
        }, 2500);
    }
}
window.applyThemePreset = applyThemePreset;

// Helper Tampilan Setup & App Shell
function showSetupView() {
    document.getElementById("setupView").classList.remove("hide");
    document.getElementById("setupView").classList.add("active");
    document.getElementById("appShell").classList.add("hide");
}

function showAppShell() {
    normalizeDetachedViewSections();
    document.getElementById("setupView").classList.remove("active");
    document.getElementById("setupView").classList.add("hide");
    
    // Cek status login staff untuk akses dashboard
    const savedStaffId = localStorage.getItem("restease_current_staff_id");
    if (savedStaffId) {
        document.getElementById("appShell").classList.remove("hide");
        document.getElementById("dashboardAuthScreen").classList.add("hide");
    } else {
        document.getElementById("appShell").classList.add("hide");
        document.getElementById("dashboardAuthScreen").classList.remove("hide");
    }
}

// Mengecek konfigurasi Supabase di localStorage
function initApp() {
    const savedKey = localStorage.getItem("restease_supabase_key") || DEFAULT_ANON_KEY;
    
    // Muat background kustom lokal sesegera mungkin saat startup
    const localBg = localStorage.getItem("restease_local_bg");
    if (localBg) {
        state.settings.background = localBg;
        applyBackground(localBg);
    } else {
        applyBackground(state.settings.background);
    }
    
    // Set nilai form input setup agar sinkron
    const anonInput = document.getElementById("setupAnonKey");
    if (anonInput) {
        anonInput.value = savedKey;
    }
    
    if (savedKey) {
        // Coba koneksi dengan key yang tersimpan secara asinkron
        connectToSupabase(savedKey).then(success => {
            if (!success) {
                // Jika koneksi gagal, hapus key salah dan tampilkan form setup
                localStorage.removeItem("restease_supabase_key");
                showSetupView();
                showToast("Koneksi database gagal. Periksa kembali koneksi internet atau Anon Key Anda.", "error");
            }
        });
    } else {
        showSetupView();
    }
}

// Menghubungkan ke Supabase Client
async function connectToSupabase(anonKey) {
    try {
        const { createClient } = supabase;
        supabaseClient = createClient(SUPABASE_URL, anonKey);
        syncGlobalAppRefs();
        
        // Verifikasi koneksi dengan melakukan query ringan (membaca settings)
        const { data, error } = await supabaseClient
            .from('settings')
            .select('*')
            .limit(1);
            
        if (error) throw error;
        
        // Simpan key ke localStorage jika berhasil
        localStorage.setItem("restease_supabase_key", anonKey);
        
        // Ganti status indikator di UI
        const btnStatusDb = document.getElementById("btnStatusDb");
        if (btnStatusDb) {
            btnStatusDb.className = "status-indicator connected";
            btnStatusDb.querySelector(".indicator-text").textContent = "Online";
        }
        
        showAppShell();
        
        // Memuat seluruh data awal dari database
        await loadAllData();
        
        // Aktifkan Realtime subscriptions
        setupRealtimeSubscriptions();
        
        // Pulihkan tab aktif terakhir
        let savedTab = localStorage.getItem("restease_active_tab") || "izinView";
        if (["monitorView", "staffView", "reportsView"].includes(savedTab)) {
            savedTab = "izinView";
        }
        showView(savedTab);
        const activeNavBtn = document.querySelector(`.nav-item-main[data-target="${savedTab}"]`);
        if (activeNavBtn) setActiveNav(activeNavBtn);
        
        return true;
    } catch (err) {
        console.error("Koneksi Supabase Gagal:", err);
        supabaseClient = null;
        syncGlobalAppRefs();
        const btnStatusDb = document.getElementById("btnStatusDb");
        if (btnStatusDb) {
            btnStatusDb.className = "status-indicator disconnected";
            btnStatusDb.querySelector(".indicator-text").textContent = "Offline";
        }
        return false;
    }
}

// Memuat data dari tabel Supabase
async function loadAllData() {
    try {
        const dateFilter = new Date();
        dateFilter.setMonth(dateFilter.getMonth() - 1);
        dateFilter.setDate(1); // 1st day of the previous month
        dateFilter.setHours(0, 0, 0, 0);

        const [
            { data: settingsData, error: sErr },
            { data: staffData,    error: stErr },
            { data: rolesData,    error: rErr },
            { data: activeData,   error: aErr },
            { data: logsData,     error: lErr }
        ] = await Promise.all([
            supabaseClient.from('settings').select('*'),
            supabaseClient.from('staff').select('*').order('name'),
            supabaseClient.from('roles_config').select('*').order('role'),
            supabaseClient.from('active_breaks').select('*'),
            supabaseClient.from('break_logs')
                .select('*')
                .gte('start_time', dateFilter.toISOString())
                .order('end_time', { ascending: false })
        ]);

        if (sErr)  throw sErr;
        if (stErr) throw stErr;
        if (rErr)  throw rErr;
        if (aErr)  throw aErr;
        if (lErr)  throw lErr;

        // A. Settings
        const generalSetting = settingsData.find(item => item.key === 'general');
        if (generalSetting) {
            state.settings = generalSetting.value;
            if (state.settings && state.settings.background) {
                applyBackground(state.settings.background);
                localStorage.setItem("restease_local_bg", state.settings.background);
            }
            if (!state.settings.role_access) {
                state.settings.role_access = { ...DEFAULT_ROLE_ACCESS };
            }
        }

        // B-E. State dasar
        state.staff       = staffData;
        state.rolesConfig = rolesData;
        state.activeBreaks = dedupeActiveBreaks(activeData);
        state.logs         = logsData;

        // ── B. Render UI dasar segera (tidak perlu tunggu data sekunder) ─────
        renderAll({ forceFull: true });

        // Terapkan fitur toggle SETELAH render (agar tidak di-override)
        let chatOn = state.settings.chat_enabled;
        if (chatOn === undefined) {
            const cached = localStorage.getItem('chat_feature_enabled');
            chatOn = cached !== null ? JSON.parse(cached) : true;
        }
        applyChatEnabled(chatOn);
        applyRulesCardSettings();

        // Pulihkan sesi login staff dari localStorage jika ada
        const savedStaffId = localStorage.getItem("restease_current_staff_id");
        if (savedStaffId) {
            const matched = state.staff.find(s => s.id === savedStaffId);
            if (matched) {
                state.currentStaff = matched;
                updateStaffConsoleUI();
                
                // Load and apply staff's background preference after auto-login
                if (typeof loadAndApplyStaffBackground === 'function') {
                    try {
                        await loadAndApplyStaffBackground(matched.id);
                    } catch (err) {
                        console.warn("Failed to load background on auto-login:", err);
                    }
                }
                // Load and apply staff's saved theme preset after auto-login
                loadAndApplyStaffTheme(matched.id, true);
            }
        } else if (state.currentStaff) {
            const updatedStaff = state.staff.find(s => s.id === state.currentStaff.id);
            if (updatedStaff) {
                state.currentStaff = updatedStaff;
                updateStaffConsoleUI();
                
                // Load and apply staff's background preference
                if (typeof loadAndApplyStaffBackground === 'function') {
                    try {
                        await loadAndApplyStaffBackground(updatedStaff.id);
                    } catch (err) {
                        console.warn("Failed to load background:", err);
                    }
                }
                // Load and apply staff's saved theme preset
                loadAndApplyStaffTheme(updatedStaff.id, true);
            } else {
                logoutStaff();
            }
        }

        // ── C. Load data sekunder secara paralel di background ───────────────
        //       (absensi, paspor, banding, chat tidak blokir render utama)
        const secondaryTasks = [
            { name: 'absensi', run: () => fetchAbsensiData() },
            { name: 'paspor', run: () => typeof fetchPassportData === 'function' ? fetchPassportData() : Promise.resolve() },
            { name: 'banding', run: () => typeof fetchBandingData === 'function' ? fetchBandingData() : Promise.resolve() },
            { name: 'chat', run: () => typeof initChat === 'function' ? initChat() : Promise.resolve() },
            { name: 'serah-terima', run: () => typeof initSerahTerima === 'function' ? initSerahTerima() : Promise.resolve() },
            { name: 'data-rekening', run: () => typeof fetchRekeningData === 'function' ? fetchRekeningData() : Promise.resolve() }
        ];

        const secondaryResults = await Promise.allSettled(
            secondaryTasks.map(task => Promise.resolve().then(task.run))
        );

        secondaryResults.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.warn(`[loadAllData] Modul ${secondaryTasks[index].name} gagal dimuat:`, result.reason);
            }
        });
        
    } catch (err) {
        console.error("Gagal memuat data:", err);
        showToast("Gagal menyinkronkan data dari database.", "error");
    }
}

// 3. LOGIKA REALTIME SUPABASE
let appDbChangesChannel = null;

function setupRealtimeSubscriptions() {
    // Berhenti jika client belum diinisialisasi
    if (!supabaseClient) return;

    // Bersihkan subscription sebelumnya jika ada
    if (appDbChangesChannel) {
        try {
            supabaseClient.removeChannel(appDbChangesChannel);
        } catch (e) {}
        appDbChangesChannel = null;
    }

    appDbChangesChannel = supabaseClient
        .channel('db_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'active_breaks' }, payload => {
            handleActiveBreaksRealtime(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'break_logs' }, payload => {
            handleLogsRealtime(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, payload => {
            handleSettingsRealtime(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, payload => {
            handleStaffRealtime(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'roles_config' }, payload => {
            handleRolesRealtime(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'absensi_shifts' }, payload => {
            handleAbsensiShiftsRealtime(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'absensi_logs' }, payload => {
            handleAbsensiLogsRealtime(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bukti_banding_kesalahan' }, payload => {
            if (typeof handleBandingRealtime === 'function') {
                handleBandingRealtime(payload);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'qris_transactions' }, payload => {
            if (typeof handleQrisRealtime === 'function') {
                handleQrisRealtime(payload);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'data_rekening' }, payload => {
            if (typeof handleRekeningRealtime === 'function') {
                handleRekeningRealtime(payload);
            }
        });

    appDbChangesChannel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
            console.log('[Realtime] Connected to Supabase Realtime channel (db_changes)');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn('[Realtime] Connection lost, attempting auto-reconnect in 3s...', err);
            setTimeout(() => {
                setupRealtimeSubscriptions();
            }, 3000);
        }
    });
}

function dedupeActiveBreaks(activeBreaks = []) {
    const byStaffId = new Map();
    
    activeBreaks.forEach(item => {
        if (!item || !item.staff_id) return;
        
        const existing = byStaffId.get(item.staff_id);
        if (!existing) {
            byStaffId.set(item.staff_id, item);
            return;
        }
        
        const existingStart = existing.start_time ? new Date(existing.start_time).getTime() : 0;
        const currentStart = item.start_time ? new Date(item.start_time).getTime() : 0;
        byStaffId.set(item.staff_id, currentStart >= existingStart ? item : existing);
    });
    
    return Array.from(byStaffId.values());
}

// Handler Perubahan Realtime
function handleActiveBreaksRealtime(payload) {
    const myStaffId = state.currentStaff?.id;
    const isMyAction = payload.new?.staff_id === myStaffId || payload.old?.staff_id === myStaffId;

    if (payload.eventType === 'INSERT') {
        const idx = state.activeBreaks.findIndex(b => b.staff_id === payload.new.staff_id);
        if (idx !== -1) {
            state.activeBreaks[idx] = payload.new;
        } else {
            state.activeBreaks.push(payload.new);
        }
        state.activeBreaks = dedupeActiveBreaks(state.activeBreaks);
        
        if (!isMyAction) {
            playSound("success");
            const staffName = payload.new.staff_name;
            showToast(`${staffName} mulai izin istirahat.`, "warning");
        }
    } else if (payload.eventType === 'DELETE') {
        state.activeBreaks = state.activeBreaks.filter(b => b.staff_id !== payload.old.staff_id);
        if (!isMyAction) playSound("success");
    } else if (payload.eventType === 'UPDATE') {
        const idx = state.activeBreaks.findIndex(b => b.staff_id === payload.new.staff_id);
        if (idx !== -1) {
            state.activeBreaks[idx] = payload.new;
        } else {
            state.activeBreaks.push(payload.new);
        }
        state.activeBreaks = dedupeActiveBreaks(state.activeBreaks);
    }
    
    // Hanya perbarui monitor view jika izin monitor aktif
    if (isSectionActive("izinView") && getActiveIzinTabId() === "monitorView") {
        scheduleRender("izin-monitor", () => renderMonitorSection());
    }
    // Update staff console only if currentStaff exists
    if (state.currentStaff) {
        scheduleRender("staff-console", () => updateStaffConsoleUI());
    }
}

function handleLogsRealtime(payload) {
    const myStaffId = state.currentStaff?.id;
    const isMyAction = payload.new?.staff_id === myStaffId || payload.old?.staff_id === myStaffId;

    if (payload.eventType === 'INSERT') {
        const exist = state.logs.some(l => l.id === payload.new.id);
        if (!exist) {
            state.logs.unshift(payload.new);
            const log = payload.new;
            if (!isMyAction) {
                if (log.status === 'Terlambat') {
                    if (typeof playSound === 'function') playSound("alert");
                    showToast(`${log.staff_name} kembali terlambat ${formatDurationSeconds(log.overtime_seconds)}!`, "error");
                } else {
                    showToast(`${log.staff_name} kembali tepat waktu.`, "success");
                }
            }
        }
    } else if (payload.eventType === 'DELETE') {
        const deletedId = payload.old ? (payload.old.id || payload.old.uuid) : null;
        if (deletedId) {
            state.logs = state.logs.filter(l => l.id !== deletedId);
            const rowEl = document.querySelector(`tr[data-id="${deletedId}"]`);
            if (rowEl) {
                rowEl.remove();
            }
        }
    }
    
    // Only render if izin view is active
    if (isSectionActive("izinView")) {
        const activeIzinTabId = getActiveIzinTabId();
        if (activeIzinTabId === "reportsView") {
            scheduleRender("izin-reports", () => renderReports());
        }
        if (activeIzinTabId === "monitorView") {
            scheduleRender("izin-monitor-stats", () => updateStatsSummary());
        }
    }
    // Update staff console only if currentStaff exists
    if (state.currentStaff) {
        scheduleRender("staff-console", () => updateStaffConsoleUI());
    }
}

function handleSettingsRealtime(payload) {
    if (payload.eventType === 'UPDATE' && payload.new.key === 'general') {
        state.settings = payload.new.value;
        if (state.settings && state.settings.background) {
            applyBackground(state.settings.background);
            localStorage.setItem("restease_local_bg", state.settings.background);
        }
        // Kalau staff punya tema aktif, pastikan tema tidak ditimpa oleh settings update
        if (state.currentStaff) {
            const staffThemeKey = `restease_theme_preset_${state.currentStaff.id}`;
            const savedTheme = localStorage.getItem(staffThemeKey);
            if (savedTheme && savedTheme !== 'default') {
                applyThemePreset(savedTheme, null, true);
            }
        }
        showToast("Pengaturan sistem diperbarui secara realtime.", "success");

        // Terapkan chat toggle saat settings berubah (realtime)
        let chatOn = state.settings.chat_enabled;
        if (chatOn === undefined) {
            const cached = localStorage.getItem('chat_feature_enabled');
            chatOn = cached !== null ? JSON.parse(cached) : true;
        }
        applyChatEnabled(chatOn);
        applyRulesCardSettings();
        // Sync toggle di admin panel jika sedang terbuka
        const toggleChat = document.getElementById("toggleChatEnabled");
        if (toggleChat) toggleChat.checked = chatOn;
        
        // Sync input admin jika sedang terbuka
        document.getElementById("inputDefaultDuration").value = getDurationString(state.settings.default_duration);
        document.getElementById("inputDailyQuota").value = state.settings.daily_quota;
        
        if (state.currentStaff) {
            scheduleRender("staff-console", () => updateStaffConsoleUI());
        }
        if (isSectionActive("izinView") && getActiveIzinTabId() === "monitorView") {
            scheduleRender("izin-monitor-active-breaks", () => renderActiveBreaks());
        }
    }
}

function handleStaffRealtime(payload) {
    if (payload.eventType === 'INSERT') {
        state.staff.push(payload.new);
        state.staff.sort((a,b) => a.name.localeCompare(b.name));
        // Sync staff baru ke chat_users
        if (typeof syncAllStaffToChatUsers === 'function') {
            syncAllStaffToChatUsers().catch(() => {});
        }
    } else if (payload.eventType === 'DELETE') {
        state.staff = state.staff.filter(s => s.id !== payload.old.id);
        if (state.currentStaff && state.currentStaff.id === payload.old.id) {
            logoutStaff();
            showToast("Akun Anda telah dihapus oleh Admin.", "error");
        }
    } else if (payload.eventType === 'UPDATE') {
        const idx = state.staff.findIndex(s => s.id === payload.new.id);
        if (idx !== -1) {
            state.staff[idx] = payload.new;
            state.staff.sort((a,b) => a.name.localeCompare(b.name));
        }
        if (state.currentStaff && state.currentStaff.id === payload.new.id) {
            state.currentStaff = payload.new;
            updateStaffConsoleUI();
        }
    }

    scheduleRender("daily-status-panel", () => renderDailyStatusPanel());

    if (isSectionActive("adminView")) {
        scheduleRender("admin-staff", () => renderAdminStaff());
    }
    if (isSectionActive("absensiView")) {
        scheduleRender("absensi-view", () => renderAbsensi());
    }
    scheduleRender("role-dropdowns", () => populateRoleDropdowns());
    // Invalidate admin cache so it re-renders next time user opens it
    _renderedViews.delete('adminView');
}

function handleRolesRealtime(payload) {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const idx = state.rolesConfig.findIndex(r => isSameRole(r.role, payload.new.role));
        if (idx !== -1) {
            state.rolesConfig[idx] = payload.new;
        } else {
            state.rolesConfig.push(payload.new);
        }
    } else if (payload.eventType === 'DELETE') {
        state.rolesConfig = state.rolesConfig.filter(r => !isSameRole(r.role, payload.old.role));
    }
    if (isSectionActive("izinView") && getActiveIzinTabId() === "monitorView") {
        scheduleRender("izin-role-slots", () => renderRoleSlots());
    }
    if (isSectionActive("adminView")) {
        scheduleRender("admin-roles", () => renderAdminRoles());
    }
    scheduleRender("role-dropdowns", () => populateRoleDropdowns());
    if (state.currentStaff) {
        scheduleRender("staff-console", () => updateStaffConsoleUI());
    }
}

function handleAbsensiShiftsRealtime(payload) {
    if (payload.eventType === 'INSERT') {
        state.absensiShifts.push(payload.new);
    } else if (payload.eventType === 'DELETE') {
        state.absensiShifts = state.absensiShifts.filter(s => s.id !== payload.old.id);
    } else if (payload.eventType === 'UPDATE') {
        const idx = state.absensiShifts.findIndex(s => s.id === payload.new.id);
        if (idx !== -1) state.absensiShifts[idx] = payload.new;
    }

    scheduleRender("daily-status-panel", () => renderDailyStatusPanel());

    if (isSectionActive("absensiView")) {
        scheduleRender("absensi-view", () => renderAbsensi());
    }
    
    const clockInSec = document.getElementById("clockInView");
    if (clockInSec && clockInSec.classList.contains("active")) {
        const today = new Date();
        const currentDay = today.getDate();
        renderClockInStatus(currentDay);
        renderTodayAttendanceList(currentDay);
        renderAttendanceHistory(currentDay);
    }
}

function handleAbsensiLogsRealtime(payload) {
    if (payload.eventType === 'INSERT') {
        state.absensiLogs.push(payload.new);
    } else if (payload.eventType === 'DELETE') {
        state.absensiLogs = state.absensiLogs.filter(l => l.id !== payload.old.id);
    } else if (payload.eventType === 'UPDATE') {
        const idx = state.absensiLogs.findIndex(l => l.id === payload.new.id);
        if (idx !== -1) state.absensiLogs[idx] = payload.new;
    }
    if (isSectionActive("absensiView")) {
        scheduleRender("absensi-view", () => renderAbsensi());
    }
    
    const clockInSec = document.getElementById("clockInView");
    if (clockInSec && clockInSec.classList.contains("active")) {
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonthStr = today.toLocaleDateString('sv-SE').substring(0, 7);
        renderClockInStatus(currentDay);
        renderTodayAttendanceList(currentDay);
        renderAttendanceHistory(currentDay);
        renderPersonalAttendanceLogs(currentMonthStr);
    }
}

// 4. EVENT LISTENERS SETUP
function setupEventListeners() {
    // A. Hubungkan Database Button
    document.getElementById("btnConnect").addEventListener("click", handleDatabaseConnect);
    
    // B. Main Navbar Switcher
    const navItems = document.querySelectorAll(".nav-item, .nav-item-main");
    navItems.forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const target = btn.getAttribute("data-target");


            localStorage.setItem("restease_active_tab", target);
            showView(target);
            setActiveNav(btn);
        });
    });

    // C. Re-connect DB indicator click (mempermudah setup ulang)
    const btnStatusDb = document.getElementById("btnStatusDb");
    if (btnStatusDb) {
        btnStatusDb.addEventListener("click", async () => {
            if (await showCustomConfirm("Ingin memutuskan koneksi database saat ini dan mereset Anon Key?", "Disconnect Database", true)) {
                localStorage.removeItem("restease_supabase_key");
                location.reload();
            }
        });
    }

    // D. Staff Portal: Registration Full Name Autocomplete
    const regFullName = document.getElementById("regFullName");
    const regFullNameDropdown = document.getElementById("regFullNameDropdown");
    
    if (regFullName) {
        regFullName.addEventListener("input", handleRegFullNameInput);
        regFullName.addEventListener("focus", () => {
            if (regFullName.value.trim().length > 0) {
                regFullNameDropdown.classList.remove("hide");
            }
        });
    }
    
    // Menutup dropdown saat klik di luar
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".autocomplete-container")) {
            if (regFullNameDropdown) regFullNameDropdown.classList.add("hide");
        }
    });

    // E. Login / Logout Staff Buttons
    const btnStaffLogout = document.getElementById("btnStaffLogout");
    if (btnStaffLogout) btnStaffLogout.addEventListener("click", logoutStaff);

    // F. Staff Break Action Button
    document.getElementById("btnBreakAction").addEventListener("click", handleBreakAction);

    // G. Admin Authentication
    document.getElementById("btnAdminAuth").addEventListener("click", authenticateAdmin);
    document.getElementById("adminPasscodeInput").addEventListener("keyup", (e) => {
        if (e.key === "Enter") authenticateAdmin();
    });

    // H. Team Chat Toggle
    const toggleChatEnabled = document.getElementById("toggleChatEnabled");
    if (toggleChatEnabled) {
        toggleChatEnabled.addEventListener("change", (e) => {
            handleChatToggle(e.target.checked);
        });
    }
    document.getElementById("btnLockAdmin").addEventListener("click", lockAdminPanel);

    // H. Admin Workspace Tab Switcher
    const adminMenu = document.querySelectorAll(".admin-side-menu li");
    adminMenu.forEach(item => {
        item.addEventListener("click", () => {
            adminMenu.forEach(i => i.classList.remove("active"));
            item.classList.add("active");
            
            const tabId = item.getAttribute("data-tab");
            const panels = document.querySelectorAll(".admin-tab-panel");
            panels.forEach(p => p.classList.remove("active"));
            document.getElementById(tabId).classList.add("active");

            // Saat tab Hapus Data dibuka, set default bulan ke bulan lalu
            if (tabId === 'tabDeleteData') {
                const now = new Date();
                const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const prevStr = prev.toLocaleDateString('sv-SE').substring(0, 7); // YYYY-MM
                ['deleteAbsensiMonth', 'deleteBreakLogsMonth', 'deleteChatMonth'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el && !el.value) el.value = prevStr;
                });
                // Reset status labels
                ['deleteAbsensiStatus', 'deleteBreakLogsStatus', 'deleteChatStatus'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
            }

            if (tabId === 'tabRoleAccess') {
                renderAdminRoleAccess();
            }
        });
    });

    // I. Admin: Tambah Staff
    document.getElementById("formAddStaff").addEventListener("submit", handleAddStaff);
    
    // J. Admin: Cari & Filter Staff
    const debouncedRenderAdminStaff = debounce(() => renderAdminStaff(), 120);
    document.getElementById("adminSearchStaff").addEventListener("input", debouncedRenderAdminStaff);
    
    const adminFilterStaffRole = document.getElementById("adminFilterStaffRole");
    if (adminFilterStaffRole) {
        adminFilterStaffRole.addEventListener("change", () => {
            renderAdminStaff();
        });
    }

    // K. Admin: Tambah Jabatan
    document.getElementById("formAddRole").addEventListener("submit", handleAddRole);

    // L. Admin: Simpan Konfigurasi Umum
    document.getElementById("formGeneralSettings").addEventListener("submit", handleSaveSettings);

    // M. Admin: Ganti Background Default
    const bgPreviewItems = document.querySelectorAll(".bg-preview-item");
    bgPreviewItems.forEach(item => {
        item.addEventListener("click", () => {
            bgPreviewItems.forEach(i => i.classList.remove("active"));
            item.classList.add("active");
            const bgValue = item.getAttribute("data-bg");
            saveBackgroundSetting(bgValue);
        });
    });

    // N. Admin: Terapkan Background URL
    document.getElementById("btnApplyBgUrl").addEventListener("click", () => {
        const urlInput = document.getElementById("inputBgUrl").value.trim();
        if (urlInput) {
            saveBackgroundSetting(`url('${urlInput}')`);
        } else {
            showToast("Harap masukkan URL gambar yang valid.", "warning");
        }
    });

    // O. Admin: Upload Background File
    document.getElementById("inputBgFile").addEventListener("change", handleBackgroundFileUpload);

    // P. Admin: Simulasi Ganti Hari (Shift Logs)
    document.getElementById("btnSimulateDayChange").addEventListener("click", handleSimulateDayChange);
    
    // Q. Admin: Generate Dummy Data
    document.getElementById("btnGenerateDummyData").addEventListener("click", handleGenerateDummyData);
    
    // R. Admin: Hapus Semua Log Riwayat
    document.getElementById("btnClearLogs").addEventListener("click", handleClearLogs);
    
    // S. Admin: Reset Semua Setelan ke Default
    document.getElementById("btnResetAppConfig").addEventListener("click", handleResetConfig);

    // T. Laporan: Ekspor CSV & Hapus Semua Log
    const btnExportCSV = document.getElementById("btnExportCSV");
    if (btnExportCSV) {
        btnExportCSV.addEventListener("click", exportLogsToCSV);
    }
    
    const btnDeleteAllReportLogs = document.getElementById("btnDeleteAllReportLogs");
    if (btnDeleteAllReportLogs) {
        btnDeleteAllReportLogs.addEventListener("click", handleClearLogs);
    }

    // U. Laporan: Tab Filter Status Harian (Hanya targetkan tombol filter di dalam status filter group)
    const filterTabs = document.querySelectorAll("#dailyStatusFilterGroup .btn-tab");
    filterTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            filterTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            renderReports(tab.getAttribute("data-filter"));
        });
    });

    // U2. Laporan: Toggle Tipe Laporan (Harian / Rekap Bulanan)
    const btnReportDaily = document.getElementById("btnReportDaily");
    const btnReportMonthly = document.getElementById("btnReportMonthly");
    
    if (btnReportDaily && btnReportMonthly) {
        btnReportDaily.addEventListener("click", () => {
            btnReportDaily.classList.add("active");
            btnReportMonthly.classList.remove("active");
            
            state.reportMode = "daily";
            document.getElementById("reportSubTitle").textContent = "Data riwayat keluar masuk istirahat staff hari ini";
            
            document.getElementById("dailyDateFilterGroup").classList.remove("hide");
            document.getElementById("dailyStatusFilterGroup").classList.remove("hide");
            document.getElementById("dailyTableContainer").classList.remove("hide");
            
            document.getElementById("monthlyDateFilterGroup").classList.add("hide");
            document.getElementById("monthlyTableContainer").classList.add("hide");
            
            renderReports();
        });
        
        btnReportMonthly.addEventListener("click", () => {
            btnReportMonthly.classList.add("active");
            btnReportDaily.classList.remove("active");
            
            state.reportMode = "monthly";
            document.getElementById("reportSubTitle").textContent = "Rekap bulanan staff yang terlambat kembali";
            
            document.getElementById("dailyDateFilterGroup").classList.add("hide");
            document.getElementById("dailyStatusFilterGroup").classList.add("hide");
            document.getElementById("dailyTableContainer").classList.add("hide");
            
            document.getElementById("monthlyDateFilterGroup").classList.remove("hide");
            document.getElementById("monthlyTableContainer").classList.remove("hide");
            
            renderReports();
        });
    }

    // V. Laporan: Filter Tanggal Harian
    const reportDateFilter = document.getElementById("reportDateFilter");
    if (reportDateFilter) {
        reportDateFilter.value = new Date().toLocaleDateString('sv-SE');
        reportDateFilter.addEventListener("change", () => {
            const activeTab = document.querySelector("#dailyStatusFilterGroup .btn-tab.active");
            const filter = activeTab ? activeTab.getAttribute("data-filter") : "all";
            renderReports(filter);
        });
    }

    // V2. Laporan: Filter Bulan Rekap Bulanan
    const reportMonthFilter = document.getElementById("reportMonthFilter");
    if (reportMonthFilter) {
        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        reportMonthFilter.value = currentMonthStr;
        
        reportMonthFilter.addEventListener("change", () => {
            renderReports();
        });
    }

    // W. IZIN ISTIRAHAT: Navigasi Tab Internal
    const izinTabBtns = document.querySelectorAll("#izinTabMenu .btn-tab");
    izinTabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-izin-target");
            

            
            // Update active styling
            izinTabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            // Hide all izin-tab-contents
            document.querySelectorAll("#izinView .absensi-tab-content").forEach(c => c.classList.add("hide"));
            
            // Show target
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.classList.remove("hide");
            }
            
            // Render specific components
            if (targetId === "monitorView") {
                renderMonitorSection();
            } else if (targetId === "staffView") {
                if (state.currentStaff) updateStaffConsoleUI();
            } else if (targetId === "adminView") {
                renderAdminStaff();
                renderAdminRoles();
            } else if (targetId === "reportsView") {
                renderReports();
            }
        });
    });

    // W2. Absensi: Navigasi Tab Internal
    const absensiTabs = [
        { btnId: "btnAbsensiDaily", containerId: "absensiDailyContainer" },
        { btnId: "btnAbsensiSpreadsheet", containerId: "absensiSpreadsheetContainer" },
        { btnId: "btnAbsensiLogs", containerId: "absensiLogsContainer" },
        { btnId: "btnAbsensiShiftSettings", containerId: "absensiShiftSettingsContainer" }
    ];
    
    absensiTabs.forEach(tab => {
        const btn = document.getElementById(tab.btnId);
        if (btn) {
            btn.addEventListener("click", () => {
                absensiTabs.forEach(t => {
                    document.getElementById(t.btnId).classList.remove("active");
                });
                btn.classList.add("active");
                renderAbsensi();
            });
        }
    });

    // W3. Absensi: Filter & Search spreadsheet
    const absensiShiftSearch = document.getElementById("absensiShiftSearch");
    if (absensiShiftSearch) {
        absensiShiftSearch.addEventListener("input", debounce(() => renderAbsensiSpreadsheet(), 120));
    }
    const absensiShiftFilterRole = document.getElementById("absensiShiftFilterRole");
    if (absensiShiftFilterRole) {
        absensiShiftFilterRole.addEventListener("change", renderAbsensiSpreadsheet);
    }
    const absensiShiftFilterVal = document.getElementById("absensiShiftFilterVal");
    if (absensiShiftFilterVal) {
        absensiShiftFilterVal.addEventListener("change", renderAbsensiSpreadsheet);
    }

    // W4. Absensi: Filter & Search Logs
    const absensiLogSearch = document.getElementById("absensiLogSearch");
    if (absensiLogSearch) {
        absensiLogSearch.addEventListener("input", debounce(() => renderAbsensiLogs(), 120));
    }
    const absensiLogFilterStatus = document.getElementById("absensiLogFilterStatus");
    if (absensiLogFilterStatus) {
        absensiLogFilterStatus.addEventListener("change", renderAbsensiLogs);
    }

    // W5. Absensi: Month Pickers
    const absensiShiftMonthFilter = document.getElementById("absensiShiftMonthFilter");
    if (absensiShiftMonthFilter) {
        const now = new Date();
        absensiShiftMonthFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        state.absensiSelectedMonth = absensiShiftMonthFilter.value;
        
        absensiShiftMonthFilter.addEventListener("change", async (e) => {
            state.absensiSelectedMonth = e.target.value;
            const logMonth = document.getElementById("absensiLogMonthFilter");
            if (logMonth) logMonth.value = e.target.value;
            
            await fetchAbsensiData();
            renderAbsensi();
        });
    }

    // W6. Absensi: Daily Date Picker
    const absensiDailyDatePicker = document.getElementById("absensiDailyDatePicker");
    const absensiLogDateFilter = document.getElementById("absensiLogDateFilter");
    const btnAbsensiPrevDay = document.getElementById("btnAbsensiPrevDay");
    const btnAbsensiNextDay = document.getElementById("btnAbsensiNextDay");

    const handleDailyDateChange = async (newDateObj) => {
        const newY = newDateObj.getFullYear();
        const newM = String(newDateObj.getMonth() + 1).padStart(2, '0');
        const newD = newDateObj.getDate();
        const newMonthStr = `${newY}-${newM}`;
        
        state.absensiSelectedDay = newD;
        
        if (state.absensiSelectedMonth !== newMonthStr) {
            state.absensiSelectedMonth = newMonthStr;
            const shiftMonth = document.getElementById("absensiShiftMonthFilter");
            if (shiftMonth) shiftMonth.value = newMonthStr;
            await fetchAbsensiData();
        }
        
        if (absensiLogDateFilter) {
            absensiLogDateFilter.value = `${newY}-${newM}-${String(newD).padStart(2, '0')}`;
        }
        
        renderAbsensiDaily();
        renderAbsensiLogs();
    };
    
    if (absensiLogDateFilter) {
        const now = new Date();
        absensiLogDateFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        absensiLogDateFilter.addEventListener("change", (e) => {
            if (!e.target.value) return;
            const parts = e.target.value.split('-');
            if (parts.length === 3) {
                const dateObj = new Date(parts[0], parseInt(parts[1]) - 1, parseInt(parts[2]));
                handleDailyDateChange(dateObj);
            }
        });
    }

    if (absensiDailyDatePicker) {
        absensiDailyDatePicker.addEventListener("change", (e) => {
            if (!e.target.value) return;
            const parts = e.target.value.split('-');
            if (parts.length === 3) {
                const dateObj = new Date(parts[0], parseInt(parts[1]) - 1, parseInt(parts[2]));
                handleDailyDateChange(dateObj);
            }
        });
    }

    if (btnAbsensiPrevDay) {
        btnAbsensiPrevDay.addEventListener("click", () => {
            const [yy, mm] = state.absensiSelectedMonth.split('-');
            const dateObj = new Date(yy, parseInt(mm) - 1, state.absensiSelectedDay);
            dateObj.setDate(dateObj.getDate() - 1);
            handleDailyDateChange(dateObj);
        });
    }

    if (btnAbsensiNextDay) {
        btnAbsensiNextDay.addEventListener("click", () => {
            const [yy, mm] = state.absensiSelectedMonth.split('-');
            const dateObj = new Date(yy, parseInt(mm) - 1, state.absensiSelectedDay);
            dateObj.setDate(dateObj.getDate() + 1);
            handleDailyDateChange(dateObj);
        });
    }

    // W7. Absensi: Button Controls
    const btnExportAbsensiCSV = document.getElementById("btnExportAbsensiCSV");
    if (btnExportAbsensiCSV) {
        btnExportAbsensiCSV.addEventListener("click", exportAbsensiLogsToCSV);
    }
    const btnClearAbsensiLogs = document.getElementById("btnClearAbsensiLogs");
    if (btnClearAbsensiLogs) {
        btnClearAbsensiLogs.addEventListener("click", resetAbsensiLogs);
    }

    // W7a. Absensi: Hapus Semua Shift
    const btnDeleteAllShifts = document.getElementById("btnDeleteAllShifts");
    if (btnDeleteAllShifts) {
        btnDeleteAllShifts.addEventListener("click", async () => {
            const month = state.absensiSelectedMonth;
            if (!await showCustomConfirm(`Apakah Anda yakin ingin MENGHAPUS SEMUA jadwal shift untuk bulan ${month}? Tindakan ini tidak dapat dibatalkan.`, "Hapus Semua Shift", true)) return;
            
            try {
                btnDeleteAllShifts.disabled = true;
                btnDeleteAllShifts.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span> Menghapus...</span>`;
                
                const { error } = await supabaseClient
                    .from('absensi_shifts')
                    .delete()
                    .eq('month', month);
                    
                if (error) throw error;
                
                showToast(`Semua jadwal shift bulan ${month} berhasil dihapus.`, "success");
                await fetchAbsensiData();
                renderAbsensi();
            } catch (err) {
                console.error("Gagal menghapus shift:", err);
                showToast("Terjadi kesalahan saat menghapus shift.", "error");
            } finally {
                btnDeleteAllShifts.disabled = false;
                btnDeleteAllShifts.innerHTML = `<i class="fa-solid fa-trash"></i><span> Hapus Semua Shift</span>`;
            }
        });
    }

    // W7. Absensi: Impor Modal
    const importShiftModal = document.getElementById("importShiftModal");
    const btnOpenImportShiftModal = document.getElementById("btnOpenImportShiftModal");
    const btnImportShiftCancel = document.getElementById("btnImportShiftCancel");
    const btnImportShiftSubmit = document.getElementById("btnImportShiftSubmit");
    const importShiftTextarea = document.getElementById("importShiftText");
    const importShiftCategory = document.getElementById("importShiftCategory");

    const openImportShiftModal = () => {
        if (!importShiftModal) return;
        importShiftModal.classList.remove("hide");
        if (importShiftTextarea) importShiftTextarea.value = "";
        if (importShiftCategory) importShiftCategory.value = "CS LINE";
        btnImportShiftSubmit?.blur();
    };

    const closeImportShiftModal = () => {
        if (!importShiftModal) return;
        importShiftModal.classList.add("hide");
        if (importShiftTextarea) importShiftTextarea.value = "";
        if (importShiftCategory) importShiftCategory.value = "CS LINE";
        btnImportShiftSubmit?.blur();
        btnImportShiftCancel?.blur();
    };
    
    if (btnOpenImportShiftModal && importShiftModal) {
        btnOpenImportShiftModal.addEventListener("click", () => {
            openImportShiftModal();
        });
    }
    if (btnImportShiftCancel && importShiftModal) {
        btnImportShiftCancel.addEventListener("click", () => {
            closeImportShiftModal();
        });
    }
    if (importShiftModal) {
        importShiftModal.addEventListener("click", (e) => {
            if (e.target === importShiftModal) {
                closeImportShiftModal();
            }
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !importShiftModal.classList.contains("hide")) {
                closeImportShiftModal();
            }
        });
    }
    if (btnImportShiftSubmit && importShiftModal) {
        btnImportShiftSubmit.addEventListener("click", async () => {
            const textarea = importShiftTextarea;
            const selectCategory = importShiftCategory;
            if (!textarea.value.trim()) {
                showToast("Data salinan shift tidak boleh kosong.", "warning");
                return;
            }
            
            btnImportShiftSubmit.disabled = true;
            btnImportShiftSubmit.textContent = "Memproses...";
            
            try {
                const lines = textarea.value.split('\n');
                let currentCategory = selectCategory.value;
                const validShifts = ["1", "2", "1/2", "OFF", "CUTI"];
                const [year, month] = state.absensiSelectedMonth.split('-').map(Number);
                const daysInMonth = new Date(year, month, 0).getDate();
                
                let importCount = 0;
                for (let line of lines) {
                    line = line.trim();
                    if (!line) continue;
                    
                    const lineUpper = line.toUpperCase();
                    if (lineUpper.includes("CS LINE")) { currentCategory = "CS LINE"; continue; }
                    if (lineUpper.includes("CS LC")) { currentCategory = "CS LC"; continue; }
                    if (lineUpper.includes("KAPTEN KASIR") || lineUpper.includes("KAPTEN")) { currentCategory = "KAPTEN KASIR"; continue; }
                    if (lineUpper.includes("KASIR")) { currentCategory = "KASIR"; continue; }
                    if (lineUpper.includes("TANGGAL") || lineUpper.includes("JULI") || lineUpper.includes("MINGGU")) continue;
                    
                    const tokens = line.split(/\s+/);
                    if (tokens.length < 2) continue;
                    
                    const shiftStartIdx = tokens.findIndex(t => validShifts.includes(t.toUpperCase()));
                    if (shiftStartIdx === -1) continue;
                    
                    const parsedName = tokens.slice(0, shiftStartIdx).join(" ").toUpperCase();
                    const shiftCodes = tokens.slice(shiftStartIdx).map(t => t.toUpperCase());
                    
                    const schedule = [];
                    for (let d = 0; d < daysInMonth; d++) {
                        if (d < shiftCodes.length && validShifts.includes(shiftCodes[d])) {
                            schedule.push(shiftCodes[d]);
                        } else {
                            schedule.push("OFF");
                        }
                    }
                    
                    let staff = state.staff.find(s => s.name.toUpperCase() === parsedName || s.name.toUpperCase().includes(parsedName));
                    if (!staff) {
                        if (supabaseClient && !state.absensiUseLocalFallback) {
                            const { data: newStaff, error } = await supabaseClient
                                .from('staff')
                                .insert({ name: parsedName, role: currentCategory })
                                .select()
                                .single();
                            if (error) {
                                console.error("Gagal membuat staff baru saat import:", error);
                                continue;
                            }
                            staff = newStaff;
                            state.staff.push(staff);
                            state.staff.sort((a,b) => a.name.localeCompare(b.name));
                        } else {
                            const localId = `local-staff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                            const newStaff = { id: localId, name: parsedName, role: currentCategory };
                            state.staff.push(newStaff);
                            state.staff.sort((a,b) => a.name.localeCompare(b.name));
                            localStorage.setItem("restease_local_staff", JSON.stringify(state.staff));
                            staff = newStaff;
                        }
                    }
                    
                    await saveAbsensiShift(staff.id, staff.name, staff.role, schedule);
                    importCount++;
                }
                
                closeImportShiftModal();
                showToast(`Berhasil memproses & mengimpor ${importCount} jadwal shift staff.`, "success");
                
                await fetchAbsensiData();
                renderAbsensi();
                renderAdminStaff();
            } catch (err) {
                console.error("Gagal memproses impor shift:", err);
                showToast("Terjadi kesalahan saat memproses text jadwal.", "error");
            } finally {
                btnImportShiftSubmit.disabled = false;
                btnImportShiftSubmit.textContent = "Proses & Simpan";
            }
        });
    }
}

function initStaffConsoleMotion() {
    const backgroundLayer = document.getElementById("staffView");
    if (!backgroundLayer || backgroundLayer.dataset.motionReady === "true") return;

    backgroundLayer.dataset.motionReady = "true";
    backgroundLayer.style.setProperty("--mouse-x", "50%");
    backgroundLayer.style.setProperty("--mouse-y", "32%");
    backgroundLayer.style.setProperty("--glow-shift-x", "0px");
    backgroundLayer.style.setProperty("--glow-shift-y", "0px");
}

// 5. PENANGANAN STATE NAV & VIEW
function checkOfficerAuthorization() {
    return true;
}

function promptOfficerVerification() {
    sessionStorage.setItem("restease_authorized_officer", "true");
    return Promise.resolve(true);
}


function normalizeRoleString(roleStr) {
    if (!roleStr) return "";
    let r = String(roleStr).trim().toUpperCase();
    r = r.replace(/_/g, " ");
    if (r === "CS" || r === "CSLC") r = "CS LC";
    if (r === "CSLINE") r = "CS LINE";
    if (r === "KAPTEN") r = "KAPTEN KASIR";
    return r;
}

function setRoleNavVisibility(el, visible, flexMode = 'flex') {
    if (!el) return;
    if (visible) {
        el.classList.remove('role-restricted-hidden');
    } else {
        el.classList.add('role-restricted-hidden');
    }
}

function updateRoleBasedSidebarAccess() {
    const staff = state.currentStaff;
    const isAdmin = typeof isAdminAuthenticated === 'function' ? isAdminAuthenticated() : false;

    let normRole = '';
    if (staff && staff.role) {
        normRole = normalizeRoleString(staff.role);
    }

    // Helper function to check role access from dynamic settings
    const roleAccess = state.settings.role_access || DEFAULT_ROLE_ACCESS;
    const staffAccess = state.settings.staff_access || {};
    
    const isAllowed = (viewId) => {
        if (isAdmin) return true;
        if (!staff || !normRole) return false;
        
        // 1. Check Individual Staff Access Override (Exceptions)
        const allowedStaffIds = staffAccess[viewId] || [];
        if (allowedStaffIds.includes(staff.id)) return true;
        
        // 2. Check Role-based Access
        const allowedRoles = roleAccess[viewId];
        if (!allowedRoles) return true; // If not explicitly restricted, allow
        return allowedRoles.includes(normRole);
    };

    setRoleNavVisibility(document.getElementById('btnChatView'), isAllowed('chatView'), 'flex');
    setRoleNavVisibility(document.getElementById('btnClockInSidebar'), isAllowed('clockInView'), 'flex');
    
    // Izin / Staff Console isn't explicitly ID'd in your previous code for toggling, but we can target it via data-target if needed.
    // In index.html, it's <button class="nav-item-main active" data-target="izinView" title="Izin Istirahat" onclick="showView('izinView'); setActiveNav(this)">
    const btnIzinView = document.querySelector('.nav-item-main[data-target="izinView"]');
    setRoleNavVisibility(btnIzinView, isAllowed('izinView'), 'flex');

    setRoleNavVisibility(document.getElementById('btnAbsensiView'), isAllowed('absensiView'), 'flex');
    setRoleNavVisibility(document.getElementById('btnPasporView'), isAllowed('pasporView'), 'flex');
    setRoleNavVisibility(document.getElementById('btnSerahTerimaCSLine'), isAllowed('serahTerimaCSLineView'), 'flex');
    setRoleNavVisibility(document.getElementById('btnSerahTerimaKapten'), isAllowed('serahTerimaKaptenView'), 'flex');
    setRoleNavVisibility(document.getElementById('btnDataRekeningView'), isAllowed('dataRekeningView'), 'flex');
    setRoleNavVisibility(document.getElementById('btnAdminPanelSidebar'), isAllowed('adminView'), 'flex');
    setRoleNavVisibility(document.getElementById('btnSerahTerimaKasir'), isAllowed('serahTerimaKasirView'), 'flex');
    setRoleNavVisibility(document.getElementById('btnBuktiView'), isAllowed('buktiView'), 'flex');
    
    // Group container for Customer Service (Banding, QRIS)
    const isAnyCSVisible = isAllowed('bandingView') || isAllowed('qrisView');
    setRoleNavVisibility(document.getElementById('csGroupContainer'), isAnyCSVisible, 'block');
    
    // Group container for Serah Terima
    const isAnySTVisible = isAllowed('serahTerimaCSLineView') || isAllowed('serahTerimaKaptenView') || isAllowed('serahTerimaKasirView');
    setRoleNavVisibility(document.getElementById('serahTerimaGroupContainer'), isAnySTVisible, 'block');
}
window.updateRoleBasedSidebarAccess = updateRoleBasedSidebarAccess;

async function showView(viewId) {
    normalizeDetachedViewSections();

    const staff = state.currentStaff;
    const isAdmin = typeof isAdminAuthenticated === 'function' ? isAdminAuthenticated() : false;
    let normRole = '';
    if (staff && staff.role) {
        normRole = normalizeRoleString(staff.role);
    }

    // Cek dynamic RBAC
    const roleAccess = state.settings.role_access || DEFAULT_ROLE_ACCESS;
    const staffAccess = state.settings.staff_access || {};
    
    const allowedRoles = roleAccess[viewId];
    const allowedStaffIds = staffAccess[viewId] || [];
    
    if (allowedRoles) { // Jika ada pengaturan restriksi untuk view ini
        // Allowed if admin, OR if staff ID is in exceptions, OR if role is allowed
        const hasIndividualAccess = staff && allowedStaffIds.includes(staff.id);
        const hasRoleAccess = staff && allowedRoles.includes(normRole);
        const isAllowed = isAdmin || hasIndividualAccess || hasRoleAccess;
        if (!isAllowed) {
            // Only show toast if someone is actually logged in, otherwise silently redirect
            if (isAdmin || staff) {
                showToast("Akses Ditolak: Anda tidak memiliki izin untuk melihat fitur ini.", "error");
            }
            showView("izinView");
            const izinNavBtn = document.querySelector('.nav-item-main[data-target="izinView"]');
            if (izinNavBtn) setActiveNav(izinNavBtn);
            return;
        }
    }

    // Blokir akses ke chatView jika fitur dinonaktifkan admin
    if (viewId === "chatView" && state.settings.chat_enabled === false) {
        showToast("Fitur Team Chat sedang dinonaktifkan oleh admin.", "error");
        return;
    }

    // Sembunyikan semua section
    const sections = document.querySelectorAll(".view-section");
    sections.forEach(s => {
        s.classList.remove("active");
        s.classList.add("hide");
    });
    // Stop bio greeting clock whenever we leave bioView
    if (viewId !== 'bioView') stopBioGreetingClock();
    
    // Tampilkan target section
    const targetSection = document.getElementById(viewId);
    if (targetSection) {
        targetSection.classList.remove("hide");
        targetSection.classList.add("active");
        
        if (viewId === "bioView") {
            if (typeof updateBioView === 'function') {
                updateBioView();
            }
        }
    }

    // Set overflow & padding untuk .app-content
    const appContent = document.querySelector('.app-content');
    if (appContent) {
        if (viewId === 'chatView') {
            appContent.style.cssText = "flex: 1 !important; overflow: hidden !important; padding: 0 !important; box-sizing: border-box !important; display: flex !important; flex-direction: column !important;";
        } else {
            appContent.style.cssText = "flex: 1 !important; overflow-y: auto !important; padding: 40px !important; box-sizing: border-box !important;";
        }
        appContent.scrollTop = 0;
    }
    
    // Trigger render untuk pasporView — fetch data dulu, baru render
    if (viewId === "pasporView") {
        if (typeof refreshPasporView === 'function') {
            refreshPasporView();
        } else {
            populatePasporPetugasDropdown();
            fetchPassportData().then(() => renderPasporView());
        }
    }
    if (viewId === "izinView") {
        const activeIzinTabId = getActiveIzinTabId();
        if (activeIzinTabId === "monitorView") {
            renderMonitorSection();
        } else if (activeIzinTabId === "reportsView") {
            renderReports();
        }
        if (state.currentStaff) {
            updateStaffConsoleUI();
        }
    }
    // Trigger render untuk absensiView
    if (viewId === "absensiView" && typeof renderAbsensi === 'function') {
        renderAbsensi();
    }
    // Trigger render untuk buktiView
    if (viewId === "buktiView" && typeof initBuktiView === 'function') {
        initBuktiView();
    }
    // Trigger render untuk clockInView
    if (viewId === "clockInView" && typeof initClockInView === 'function') {
        initClockInView();
    }
    // Trigger render untuk chatView
    if (viewId === "chatView" && typeof onChatViewOpen === 'function') {
        onChatViewOpen();
    }
    // Trigger render untuk dataRekeningView
    if (viewId === "dataRekeningView" && typeof renderDataRekeningView === 'function') {
        renderDataRekeningView();
    }
    // Trigger render untuk adminView
    if (viewId === "adminView") {
        const authSec = document.getElementById("adminAuthSection");
        const workSec = document.getElementById("adminWorkspaceSection");
        if (authSec) authSec.classList.add("hide");
        if (workSec) workSec.classList.remove("hide");

        if (!_renderedViews.has('adminView')) {
            renderAdminStaff();
            renderAdminRoles();
            renderAdminRoleAccess();
            _renderedViews.add('adminView');
        }
    }
    // Trigger render untuk bandingView — set bulan default & fetch
    if (viewId === "bandingView" && typeof fetchBandingData === 'function') {
        const monthInput = document.getElementById('bandFilterMonth');
        if (monthInput && !monthInput.value) {
            monthInput.value = new Date().toLocaleDateString('sv-SE').substring(0, 7);
        }
        fetchBandingData().then(() => {
            if (typeof renderBandingView === 'function') renderBandingView();
        });
    }
    // Trigger render untuk qrisView — set bulan default & fetch
    if (viewId === "qrisView" && typeof fetchQrisData === 'function') {
        const monthInput = document.getElementById('qrisFilterMonth');
        if (monthInput && !monthInput.value) {
            monthInput.value = new Date().toLocaleDateString('sv-SE').substring(0, 7);
        }
        fetchQrisData().then(() => {
            if (typeof renderQrisView === 'function') renderQrisView();
        });
    }
    // Trigger render untuk Serah Terima views
    if (viewId === "serahTerimaCSLineView" && typeof stRender === 'function') {
        stFetch('cs_line').then(() => stRender('cs_line'));
    }
    if (viewId === "serahTerimaKaptenView" && typeof stRender === 'function') {
        stFetch('kapten_kasir').then(() => stRender('kapten_kasir'));
    }
    if (viewId === "serahTerimaKasirView" && typeof stRender === 'function') {
        stFetch('kasir').then(() => stRender('kasir'));
    }
}

function setActiveNav(activeBtn) {
    if (!activeBtn) return;
    const navItems = document.querySelectorAll(".nav-item-main");
    navItems.forEach(item => item.classList.remove("active"));
    activeBtn.classList.add("active");
}

// 6. LOGIKA KONEKSI DATABASE SETUP
async function handleDatabaseConnect() {
    const btn = document.getElementById("btnConnect");
    const spinner = btn.querySelector(".btn-spinner");
    const anonKeyInput = document.getElementById("setupAnonKey");
    const anonKey = anonKeyInput.value.trim();
    
    if (!anonKey) {
        showToast("Harap masukkan Supabase Anon Key.", "warning");
        return;
    }
    
    // Loading State
    btn.disabled = true;
    spinner.classList.remove("hide");
    
    const success = await connectToSupabase(anonKey);
    
    btn.disabled = false;
    spinner.classList.add("hide");
    
    if (success) {
        showToast("Berhasil terhubung ke database Supabase!", "success");
        showView("izinView");
        // Aktifkan navbar default ke IZIN ISTIRAHAT
        const izinNavBtn = document.querySelector('.nav-item-main[data-target="izinView"]');
        setActiveNav(izinNavBtn);
    }
}

// 7. REALTIME CLOCK & TIME FUNCTIONS
function startClock() {
    const liveClock = document.getElementById("liveClock");
    const timeEl = liveClock ? liveClock.querySelector(".time") : null;
    const dateEl = liveClock ? liveClock.querySelector(".date") : null;
    
    const formatTime = () => {
        const now = new Date();
        
        // Jam digital
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        if (timeEl) timeEl.textContent = `${hours}:${minutes}:${seconds}`;
        
        // Format tanggal Indonesia
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        if (dateEl) dateEl.textContent = now.toLocaleDateString('id-ID', options);
        
        // Login Page Clock
        const loginTimeEl = document.getElementById("loginTime");
        const loginDateEl = document.getElementById("loginDate");
        if (loginTimeEl) loginTimeEl.textContent = `${hours}:${minutes}:${seconds}`;
        if (loginDateEl) loginDateEl.textContent = now.toLocaleDateString('id-ID', options);
    };
    
    const tick = () => {
        formatTime();
        // Update stats summary secara realtime setiap detik
        if (supabaseClient) {
            updateStatsSummary();
        }
    };
    tick();
    setInterval(tick, 1000);
}

// Helper: Memeriksa apakah log dibuat hari ini
function isLogToday(timestampString) {
    const logDate = new Date(timestampString);
    const today = new Date();
    
    return logDate.getFullYear() === today.getFullYear() &&
           logDate.getMonth() === today.getMonth() &&
           logDate.getDate() === today.getDate();
}

// Helper format detik ke HH:MM:SS
function formatDurationSeconds(totalSeconds) {
    const isNegative = totalSeconds < 0;
    const absSeconds = Math.abs(totalSeconds);
    
    const hours = Math.floor(absSeconds / 3600);
    const minutes = Math.floor((absSeconds % 3600) / 60);
    const seconds = absSeconds % 60;
    
    const sign = isNegative ? "-" : "";
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Helper format timestamp UTC ke HH:MM:SS waktu lokal
function formatLocalTime(isoString) {
    if (!isoString) return "-";
    const date = new Date(isoString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// 8. AUTOCOMPLETE, REGISTER & LOGIN STAFF
function handleRegFullNameInput(e) {
    const query = e.target.value.trim().toLowerCase();
    const dropdown = document.getElementById("regFullNameDropdown");
    dropdown.innerHTML = "";
    
    if (query.length === 0) {
        dropdown.classList.add("hide");
        return;
    }
    
    // Filter staff terdaftar
    const matches = state.staff.filter(s => s.name.toLowerCase().includes(query));
    
    if (matches.length === 0) {
        const noMatch = document.createElement("div");
        noMatch.className = "autocomplete-item text-center";
        noMatch.style.color = "var(--text-muted)";
        noMatch.textContent = "Nama belum ada. Pendaftaran akan membuat staff baru.";
        dropdown.appendChild(noMatch);
    } else {
        matches.forEach(staff => {
            const item = document.createElement("div");
            item.className = "autocomplete-item";
            item.innerHTML = `
                <span class="name">${staff.name}</span>
                <span class="role">${staff.role}</span>
            `;
            item.addEventListener("click", () => {
                document.getElementById("regFullName").value = staff.name;
                document.getElementById("regRole").value = getCanonicalRoleName(staff.role);
                dropdown.classList.add("hide");
            });
            dropdown.appendChild(item);
        });
    }
    
    dropdown.classList.remove("hide");
}

function toggleLoginRegister(showRegister) {
    if (showRegister) {
        document.getElementById("cardStaffLogin").classList.add("hide");
        document.getElementById("cardStaffRegister").classList.remove("hide");
    } else {
        document.getElementById("cardStaffRegister").classList.add("hide");
        document.getElementById("cardStaffLogin").classList.remove("hide");
    }
}
window.toggleLoginRegister = toggleLoginRegister;

async function registerStaff() {
    const fullName = document.getElementById("regFullName").value.trim();
    const role = getCanonicalRoleName(document.getElementById("regRole").value);
    const email = document.getElementById("regEmail").value.trim();
    const username = document.getElementById("regUsername").value.trim().toLowerCase();
    const password = document.getElementById("regPassword").value;

    if (!fullName || !email || !username || !password) {
        showToast("Semua kolom registrasi wajib diisi!", "warning");
        return;
    }

    if (!isAllowedRole(role)) {
        showToast("Jabatan tidak valid. Pilih salah satu jabatan resmi.", "error");
        return;
    }

    if (!supabaseClient) {
        showToast("Koneksi database belum siap.", "error");
        return;
    }
    const btnSubmit = document.getElementById("btnStaffRegisterSubmit");
    if (btnSubmit) btnSubmit.disabled = true;

    try {
        // Cari staff berdasarkan nama lengkap
        const matchedStaff = state.staff.find(s => s.name.toLowerCase() === fullName.toLowerCase());

        // Cek apakah username sudah dipakai oleh orang lain (menggunakan check array length agar lebih aman)
        const { data: existingUsers, error: queryErr } = await supabaseClient
            .from('staff')
            .select('id, name')
            .eq('username', username);

        if (queryErr) throw queryErr;
        
        // Jika username sudah terpakai, pastikan itu bukan milik staff itu sendiri (untuk update kredensial)
        const isTakenByOthers = existingUsers && existingUsers.some(u => !matchedStaff || u.id !== matchedStaff.id);
        
        if (isTakenByOthers) {
            showToast("Username sudah digunakan oleh staff lain!", "error");
            if (btnSubmit) btnSubmit.disabled = false;
            return;
        }
        
        let savedUser = null;
        if (matchedStaff) {
            // Update staff yang sudah ada
            const { data, error } = await supabaseClient
                .from('staff')
                .update({
                    email: email,
                    username: username,
                    password: password,
                    role: role
                })
                .eq('id', matchedStaff.id)
                .select()
                .single();
            
            if (error) throw error;
            savedUser = data;
            showToast("Kredensial staff berhasil diperbarui!", "success");
        } else {
            // Buat staff baru
            const { data, error } = await supabaseClient
                .from('staff')
                .insert([{
                    name: fullName,
                    role: role,
                    email: email,
                    username: username,
                    password: password
                }])
                .select()
                .single();

            if (error) throw error;
            savedUser = data;
            showToast("Akun staff baru berhasil dibuat!", "success");
        }

        // Segarkan data staff lokal
        await loadAllData();

        // Bersihkan input
        document.getElementById("regFullName").value = "";
        document.getElementById("regRole").value = getAllowedRoles()[0];
        document.getElementById("regEmail").value = "";
        document.getElementById("regUsername").value = "";
        document.getElementById("regPassword").value = "";

        // Pindahkan ke menu login & beri notifikasi sukses
        toggleLoginRegister(false);
        showToast("Registrasi berhasil! Silakan masuk menggunakan username & password Anda.", "success");

    } catch (err) {
        console.error("Registrasi gagal:", err);
        showToast("Gagal mendaftar: " + err.message, "error");
    } finally {
        if (btnSubmit) btnSubmit.disabled = false;
    }
}
window.registerStaff = registerStaff;

async function loginStaff() {
    const username = document.getElementById("loginUsername").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;

    if (!username || !password) {
        showToast("Harap masukkan Username dan Password Anda.", "warning");
        return;
    }

    if (!supabaseClient) {
        showToast("Koneksi database belum siap.", "error");
        return;
    }

    const btnSubmit = document.getElementById("btnStaffLoginSubmit");
    if (btnSubmit) btnSubmit.disabled = true;

    try {
        const { data: matched, error } = await supabaseClient
            .from('staff')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle();

        if (error) throw error;

        if (!matched) {
            showToast("Username atau Password salah!", "error");
            if (btnSubmit) btnSubmit.disabled = false;
            return;
        }

        // Login sukses
        state.currentStaff = matched;
        localStorage.setItem("restease_current_staff_id", matched.id);

        // Bersihkan input login
        document.getElementById("loginUsername").value = "";
        document.getElementById("loginPassword").value = "";

        // Tampilkan Dashboard & Sembunyikan Login Overlay
        document.getElementById("dashboardAuthScreen").classList.add("hide");
        document.getElementById("appShell").classList.remove("hide");

        updateStaffConsoleUI();
        
        // Load and apply staff's background preference
        if (typeof loadAndApplyStaffBackground === 'function') {
            await loadAndApplyStaffBackground(matched.id);
        }

        // Load and apply staff's saved theme preset
        loadAndApplyStaffTheme(matched.id, true);
        
        showToast(`Selamat datang kembali, ${matched.name}!`, "success");

        // Init chat setelah login
        if (typeof initChat === 'function') {
            initChat().catch(e => console.warn("Chat init error:", e));
        }
    } catch (err) {
        console.error("Login gagal:", err);
        showToast("Gagal masuk: " + err.message, "error");
    } finally {
        if (btnSubmit) btnSubmit.disabled = false;
    }
}
window.loginStaff = loginStaff;

function logoutStaff() {
    state.currentStaff = null;
    localStorage.removeItem("restease_current_staff_id");
    updateRoleBasedSidebarAccess();
    
    // Reset background card ke normal
    const card = document.querySelector(".staff-console-card");
    if (card) {
        card.classList.remove("bg-state-break", "bg-state-late");
    }
    
    // Reset background ke setelan umum aplikasi saat logout
    const defaultBg = state.settings?.background || 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #31104b 100%)';
    applyBackground(defaultBg);

    // Reset tema ke default (hapus semua theme class) saat logout
    ALL_THEME_CLASSES.forEach(cls => document.body.classList.remove(cls));
    // Hapus CSS variable override agar kembali ke default stylesheet
    const root = document.documentElement;
    ['--primary','--primary-hover','--primary-glow','--accent','--accent-glow','--glass-border-focus'].forEach(v => root.style.removeProperty(v));
    document.querySelectorAll('.theme-preset-card').forEach(card => {
        const radio = card.querySelector('.theme-radio');
        card.style.border = '2px solid rgba(255,255,255,0.08)';
        card.style.boxShadow = '';
        if (radio) {
            radio.style.background = '';
            radio.style.borderColor = 'rgba(255,255,255,0.3)';
            radio.innerHTML = '';
        }
    });
    applyStaffBackgroundAnimationPreference(true, { persistLocal: false, staffId: 'guest' });
    
    // Clear active selection in background picker
    const presetItems = document.querySelectorAll(".staff-bg-card");
    if (presetItems) {
        presetItems.forEach(i => i.classList.remove("active"));
    }
    
    // Bersihkan timer console jika ada
    if (consoleTimerInterval) {
        clearInterval(consoleTimerInterval);
        consoleTimerInterval = null;
    }
    
    // Sembunyikan Dashboard & Tampilkan Login Overlay
    document.getElementById("appShell").classList.add("hide");
    document.getElementById("dashboardAuthScreen").classList.remove("hide");
    
    // Hide global header staff info
    const headerStaffInfo = document.getElementById("headerStaffInfo");
    if (headerStaffInfo) {
        headerStaffInfo.classList.add("hide");
    }
    showToast("Berhasil keluar dari konsol.", "success");

}
window.logoutStaff = logoutStaff;


// 9. LOGIKA KONSOL & TRANSAKSI ISTIRAHAT
function updateStaffConsoleUI() {
    if (!state.currentStaff) return;
    
    const staff = state.currentStaff;
    
    // Update Role-Based Sidebar Access (ABSENSI & PASPOR visible ONLY to CS LINE & KAPTEN KASIR)
    updateRoleBasedSidebarAccess();

    // Update Serah Terima sidebar access based on current staff role
    if (typeof window.stUpdateSidebarAccess === 'function') {
        window.stUpdateSidebarAccess();
    }
    
    // Set Profile
    document.getElementById("currentStaffName").textContent = staff.name;
    document.getElementById("currentStaffRole").textContent = formatRoleNameUpper(staff.role);
    
    // Update global header staff info
    const headerStaffInfo = document.getElementById("headerStaffInfo");
    const headerStaffName = document.getElementById("headerStaffName");
    if (headerStaffInfo && headerStaffName) {
        headerStaffName.textContent = staff.name;
        headerStaffInfo.classList.remove("hide");
    }
    
    // Avatar Initials (Diabaikan karena diganti animasi gerak tanpa teks)
    // const initials = staff.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
    // document.getElementById("staffAvatar").textContent = initials;
    
    // Jatah Quota & Pemakaian hari ini
    const todayLogsCount = state.logs.filter(log => log.staff_id === staff.id && isLogToday(log.start_time)).length;
    const dailyQuota = state.settings.daily_quota;
    
    document.getElementById("quotaText").textContent = `${todayLogsCount} / ${dailyQuota} Kali`;
    const percentage = Math.min((todayLogsCount / dailyQuota) * 100, 100);
    const barFill = document.getElementById("quotaProgressBar");
    barFill.style.width = `${percentage}%`;
    
    if (todayLogsCount >= dailyQuota) {
        barFill.style.backgroundColor = "var(--danger)";
    } else {
        barFill.style.backgroundColor = "var(--primary)";
    }

    // Hitung Ketersediaan Slot Izin berdasarkan jabatan staff
    const roleLimit = getRoleConfigByName(staff.role);
    const maxSlots = roleLimit ? roleLimit.max_slots : 1;
    const currentActiveInRole = getActiveBreaksByRole(staff.role).length;
    const remainingSlots = Math.max(0, maxSlots - currentActiveInRole);

    const slotStatusText = document.getElementById("slotStatusText");
    const slotProgressBar = document.getElementById("slotProgressBar");

    if (slotStatusText && slotProgressBar) {
        if (remainingSlots <= 0) {
            slotStatusText.textContent = "SLOT PENUH";
            slotStatusText.style.color = "var(--danger)";
            slotProgressBar.style.width = "100%";
            slotProgressBar.style.backgroundColor = "var(--danger)";
            slotProgressBar.style.boxShadow = "0 0 10px var(--danger-glow)";
        } else {
            slotStatusText.textContent = `${remainingSlots} / ${maxSlots} Tersedia`;
            slotStatusText.style.color = "var(--accent)";
            const slotPercentage = ((maxSlots - remainingSlots) / maxSlots) * 100;
            slotProgressBar.style.width = `${100 - slotPercentage}%`;
            slotProgressBar.style.backgroundColor = "var(--accent)";
            slotProgressBar.style.boxShadow = "none";
        }
    }
    
    // Periksa status istirahat saat ini
    const activeBreak = state.activeBreaks.find(b => b.staff_id === staff.id);
    const actionBtn = document.getElementById("btnBreakAction");
    const timerSection = document.getElementById("consoleActiveBreakSection");
    const msgAlert = document.getElementById("consoleMessageAlert");
    
    // Bersihkan interval sebelumnya
    if (consoleTimerInterval) {
        clearInterval(consoleTimerInterval);
        consoleTimerInterval = null;
    }
    
    if (activeBreak) {
        // SEDANG ISTIRAHAT -> Opsi untuk "SELESAI/MASUK"
        actionBtn.className = "btn btn-action-break btn-block end-state";
        actionBtn.querySelector(".action-text").textContent = "SELESAI ISTIRAHAT / MASUK";
        actionBtn.querySelector("i").className = "fa-solid fa-arrow-right-to-bracket action-icon";
        actionBtn.disabled = false;
        actionBtn.style.opacity = "1";
        actionBtn.style.cursor = "pointer";
        
        timerSection.classList.remove("hide");
        msgAlert.classList.add("hide");
        
        // Start countdown timer
        const consoleStartTimeLabel = document.getElementById("consoleStartTimeLabel");
        consoleStartTimeLabel.textContent = `Mulai Istirahat: ${formatLocalTime(activeBreak.start_time)}`;
        
        const countdownTimerEl = document.getElementById("consoleCountdownTimer");
        
        const updateConsoleTimer = () => {
            const start = new Date(activeBreak.start_time).getTime();
            const now = new Date().getTime();
            const elapsedSeconds = Math.floor((now - start) / 1000);
            const totalAllowedSeconds = activeBreak.allowed_duration;
            const remainingSeconds = totalAllowedSeconds - elapsedSeconds;
            
            countdownTimerEl.textContent = formatDurationSeconds(remainingSeconds);
            
            const card = document.querySelector(".staff-console-card");
            if (remainingSeconds < 0) {
                countdownTimerEl.style.color = "var(--danger)";
                countdownTimerEl.classList.add("blink-fast");
                if (card) {
                    card.classList.add("bg-state-late");
                    card.classList.remove("bg-state-break");
                }
            } else {
                countdownTimerEl.style.color = "var(--warning)";
                countdownTimerEl.classList.remove("blink-fast");
                if (card) {
                    card.classList.add("bg-state-break");
                    card.classList.remove("bg-state-late");
                }
            }
        };
        
        updateConsoleTimer();
        consoleTimerInterval = setInterval(updateConsoleTimer, 1000);
        
    } else {
        // SEDANG BEKERJA -> Opsi untuk "MULAI ISTIRAHAT"
        actionBtn.className = "btn btn-action-break btn-block start-state";
        actionBtn.querySelector(".action-text").textContent = "IZIN ISTIRAHAT / MULAI";
        actionBtn.querySelector("i").className = "fa-solid fa-coffee action-icon";
        
        timerSection.classList.add("hide");

        // Reset background card ke normal
        const card = document.querySelector(".staff-console-card");
        if (card) {
            card.classList.remove("bg-state-break", "bg-state-late");
        }
        
        // Validasi tombol (Kuota & Slot)
        let blockReason = null;
        
        // 1. Quota Check
        if (todayLogsCount >= dailyQuota) {
            blockReason = `Kuota harian Anda habis (${dailyQuota} kali/hari).`;
        }
        
        // 2. Slot Check
        const roleLimit = getRoleConfigByName(staff.role);
        const maxSlots = roleLimit ? roleLimit.max_slots : 1;
        const currentActiveInRole = getActiveBreaksByRole(staff.role).length;
        
        if (!blockReason && currentActiveInRole >= maxSlots) {
            blockReason = `Slot istirahat jabatan ${staff.role} penuh (${currentActiveInRole}/${maxSlots} terpakai).`;
        }
        
        if (blockReason) {
            actionBtn.disabled = true;
            actionBtn.style.opacity = "0.5";
            actionBtn.style.cursor = "not-allowed";
            msgAlert.classList.remove("hide");
            document.getElementById("consoleMessageText").textContent = blockReason;
        } else {
            actionBtn.disabled = false;
            actionBtn.style.opacity = "1";
            actionBtn.style.cursor = "pointer";
            msgAlert.classList.add("hide");
        }
    }
}
let isActionProcessing = false;
// Per-role optimistic lock: mencegah double-tap dari device yang sama
// sebelum RPC selesai (lapisan pertama; RPC server = lapisan final)
const _roleProcessingLock = new Set();

// Mulai / Selesai Istirahat Handler
async function handleBreakAction() {
    if (!state.currentStaff || !supabaseClient) return;
    if (isActionProcessing) return;
    
    const staff = state.currentStaff;
    const activeBreak = state.activeBreaks.find(b => b.staff_id === staff.id);
    const roleKey = getCanonicalRoleName(staff.role);

    // Cegah double-request dari device yang sama untuk role yang sama
    if (!activeBreak && _roleProcessingLock.has(roleKey)) {
        showToast("Sedang memproses permintaan lain untuk jabatan ini...", "warning");
        return;
    }

    isActionProcessing = true;
    if (!activeBreak) _roleProcessingLock.add(roleKey);
    
    const btn = document.getElementById("btnBreakAction");
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin action-icon"></i><span class="action-text">MEMPROSES...</span>`;
    }
    
    try {
        if (!activeBreak) {
            // ── MULAI ISTIRAHAT (via atomic RPC — anti race condition) ──────
            const roleLimit      = getRoleConfigByName(staff.role);
            const maxSlots       = roleLimit ? roleLimit.max_slots : 1;
            const canonicalRole  = getCanonicalRoleName(staff.role);
            const allowedSeconds = getDurationSeconds(state.settings.default_duration);
            const dailyQuota     = state.settings.daily_quota ?? 4;

            // Panggil PostgreSQL function — semua cek (quota + slot) + INSERT
            // dilakukan dalam SATU transaction dengan advisory lock per role.
            // Tidak ada celah race condition.
            const { data: rpcResult, error: rpcError } = await supabaseClient
                .rpc('atomic_start_break', {
                    p_staff_id:         staff.id,
                    p_staff_name:       staff.name,
                    p_role:             canonicalRole,
                    p_allowed_duration: allowedSeconds,
                    p_max_slots:        maxSlots,
                    p_daily_quota:      dailyQuota
                });

            if (rpcError) throw rpcError;

            // rpcResult adalah object JSON dari RETURNS JSON
            const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;

            if (!result.success) {
                // Tampilkan pesan error dari server (slot penuh, quota habis, dll)
                showToast(result.message || "Gagal memulai istirahat.", "error");
                updateStaffConsoleUI();
                return;
            }

            // Berhasil — update local state dengan data yang dikembalikan server
            const inserted = {
                staff_id:         result.staff_id,
                staff_name:       result.staff_name,
                role:             result.role,
                start_time:       result.start_time,
                allowed_duration: result.allowed_duration
            };

            state.activeBreaks = state.activeBreaks.filter(b => b.staff_id !== staff.id);
            state.activeBreaks.push(inserted);

            showToast("Selamat beristirahat!", "success");
            
        } else {
            // Skema SELESAI ISTIRAHAT
            const start = new Date(activeBreak.start_time).getTime();
            const now = new Date();
            const nowTime = now.getTime();
            
            const durationSeconds = Math.floor((nowTime - start) / 1000);
            const allowedDurationSeconds = activeBreak.allowed_duration;
            const overtimeSeconds = Math.max(0, durationSeconds - allowedDurationSeconds);
            const status = durationSeconds > allowedDurationSeconds ? "Terlambat" : "Aman";
            
            // 1. Simpan ke break_logs
            const { data: insertedLogData, error: logErr } = await supabaseClient
                .from('break_logs')
                .insert({
                    staff_id: staff.id,
                    staff_name: staff.name,
                    role: staff.role,
                    start_time: activeBreak.start_time,
                    end_time: now.toISOString(),
                    duration_seconds: durationSeconds,
                    allowed_duration_minutes: activeBreak.allowed_duration,
                    status: status,
                    overtime_seconds: overtimeSeconds
                })
                .select();
                
            if (logErr) throw logErr;
            
            // 2. Hapus dari active_breaks
            const { error: delErr } = await supabaseClient
                .from('active_breaks')
                .delete()
                .eq('staff_id', staff.id);
                
            if (delErr) throw delErr;
            
            // Hapus dari local state instan secara optimis
            state.activeBreaks = state.activeBreaks.filter(b => b.staff_id !== staff.id);
            
            // Tambahkan log ke local state logs (dengan ID database asli) agar quota & riwayat ter-update instan
            const logWithId = (insertedLogData && insertedLogData[0]) ? insertedLogData[0] : {
                id: `temp-${Date.now()}`,
                staff_id: staff.id,
                staff_name: staff.name,
                role: staff.role,
                start_time: activeBreak.start_time,
                end_time: now.toISOString(),
                duration_seconds: durationSeconds,
                allowed_duration_minutes: activeBreak.allowed_duration,
                status: status,
                overtime_seconds: overtimeSeconds
            };
            state.logs.unshift(logWithId);
            
            showToast("Selamat kembali bekerja!", "success");
        }
        
        // Render UI Instan (Optimistic UI Update) — targeted, bukan renderAll
        updateStaffConsoleUI();
        // Perbarui hanya bagian yang relevan: monitor aktif dan stats
        scheduleRender("staff-console", () => updateStaffConsoleUI());
        if (isSectionActive("izinView") && getActiveIzinTabId() === "monitorView") {
            scheduleRender("izin-monitor", () => renderMonitorSection());
            scheduleRender("izin-monitor-stats", () => updateStatsSummary());
        }
        
    } catch (err) {
        console.error("Gagal melakukan aksi istirahat:", err);
        // Tangkap error SLOT_FULL dari trigger DB (lapisan safety net)
        const msg = err?.message || '';
        if (msg.includes('SLOT_FULL')) {
            showToast(`Slot istirahat untuk jabatan ini sudah penuh!`, "error");
        } else if (msg.includes('QUOTA_EXCEEDED')) {
            showToast("Kuota izin harian sudah habis.", "error");
        } else {
            showToast("Terjadi kesalahan sistem database.", "error");
        }
    } finally {
        isActionProcessing = false;
        // Lepas role lock agar request berikutnya bisa masuk
        if (staff && staff.role) _roleProcessingLock.delete(getCanonicalRoleName(staff.role));
        updateStaffConsoleUI();
    }
}

// 10. RENDERING ENGINE (PAPAN MONITOR UTAMA)
// Tracking view mana yang sudah pernah di-render
const _renderedViews = new Set();

function renderAll(options = {}) {
    const forceFull = options.forceFull === true;
    
    populateRoleDropdowns();
    
    if (forceFull) {
        // Render HANYA view yang sedang aktif — view lain render saat pertama dibuka
        renderCurrentMainView();
        // Tandai dirty agar view lain re-render saat dibuka
        _renderedViews.clear();
    } else {
        renderCurrentMainView();
    }
    
    if (state.currentStaff) {
        updateStaffConsoleUI();
    }
}

// Dipanggil saat user pindah view — lazy render
function renderViewOnDemand(viewId) {
    switch(viewId) {
        case 'izinView':
            renderMonitorSection();
            break;
        case 'reportsView':
            renderReports();
            break;
        case 'adminView':
            renderAdminStaff();
            renderAdminRoles();
            break;
        case 'absensiView':
            renderAbsensi();
            break;
        case 'pasporView':
            if (typeof renderPasporView === 'function') renderPasporView();
            break;
        case 'bandingView':
            if (typeof renderBandingView === 'function') renderBandingView();
            break;
    }
    _renderedViews.add(viewId);
}

function updateStatsSummary() {
    // ── Dirty-check: skip full rebuild jika data tidak berubah ──────────────
    const now = new Date().getTime();

    const activeCount = state.activeBreaks.length;

    // Hitung late count tanpa membangun DOM dulu
    const activeLateStaff = [];
    state.activeBreaks.forEach(b => {
        const elapsed = Math.floor((now - new Date(b.start_time).getTime()) / 1000);
        if (elapsed > b.allowed_duration) {
            activeLateStaff.push({ name: b.staff_name, role: b.role, status: "Aktif", overtime: elapsed });
        }
    });

    const loggedLateStaff = state.logs
        .filter(l => isLogToday(l.start_time) && l.status === "Terlambat")
        .map(l => ({ name: l.staff_name, role: l.role, status: "Kembali", overtime: l.duration_seconds }));

    const allLateStaff = [...activeLateStaff, ...loggedLateStaff];
    const lateCount    = allLateStaff.length;
    const finishedTodayCount = state.logs.filter(l => isLogToday(l.start_time)).length;
    const totalTodayCount = activeCount + finishedTodayCount;

    // Buat fingerprint ringkas: jika sama dengan sebelumnya, skip DOM writes
    const fingerprint = `${activeCount}|${lateCount}|${totalTodayCount}|` +
        activeLateStaff.map(s => `${s.name}:${Math.floor(s.overtime / 30)}`).join(',');

    if (updateStatsSummary._lastFingerprint === fingerprint) return; // tidak ada yang berubah
    updateStatsSummary._lastFingerprint = fingerprint;

    // ── DOM writes — hanya jika data benar-benar berubah ────────────────────
    document.getElementById("statActiveCount").textContent = activeCount;
    document.getElementById("activeBreaksCount").textContent = `${activeCount} Staff`;
    document.getElementById("statLateCount").textContent = lateCount;

    const totalTodayEl = document.getElementById("statTotalTodayCount");
    if (totalTodayEl) totalTodayEl.textContent = totalTodayCount;

    // Render daftar nama staff yang terlambat
    const lateListEl = document.getElementById("lateStaffList");
    if (lateListEl) {
        lateListEl.innerHTML = "";
        if (allLateStaff.length === 0) {
            lateListEl.innerHTML = '<div class="empty-state-mini"><i class="fa-solid fa-circle-check" style="color: var(--success)"></i> Aman. Tidak ada yang terlambat.</div>';
        } else {
            const frag = document.createDocumentFragment();
            allLateStaff.forEach(staff => {
                const item = document.createElement("div");
                item.className = "late-staff-item";
                const badgeClass = staff.status === "Aktif" ? "active" : "returned";
                const badgeLabel = staff.status === "Aktif" ? "Sedang Izin" : "Kembali";
                item.innerHTML = `
                    <div class="staff-info">
                        <span class="staff-name">${staff.name}</span>
                        <div class="staff-role-flex">
                            <span class="staff-role">${staff.role}</span>
                            <span class="late-badge-status ${badgeClass}">${badgeLabel}</span>
                        </div>
                    </div>
                    <div class="overtime-container">
                        <span class="overtime-val">${formatDurationSeconds(staff.overtime)}</span>
                        <span class="overtime-label">Telat</span>
                    </div>
                `;
                frag.appendChild(item);
            });
            lateListEl.appendChild(frag);
        }
    }
}

function renderRoleSlots() {
    const listEl = document.getElementById("roleSlotsList");
    listEl.innerHTML = "";
    
    const frag = document.createDocumentFragment();
    getManagedRolesConfig().forEach(rc => {
        const activeCount = getActiveBreaksByRole(rc.role).length;
        const maxSlots = rc.max_slots;
        
        let fractionClass = "";
        if (activeCount >= maxSlots) {
            fractionClass = "full";
        } else if (activeCount > 0) {
            fractionClass = "warning";
        }
        
        const row = document.createElement("div");
        row.className = "role-slot-row";
        
        // Generate dot indicators
        let dotsHtml = "";
        for (let i = 0; i < maxSlots; i++) {
            if (i < activeCount) {
                dotsHtml += '<span class="role-dot occupied"></span>';
            } else {
                dotsHtml += '<span class="role-dot available"></span>';
            }
        }
        
        row.innerHTML = `
            <div class="role-slot-info">
                <span class="role-slot-name">${rc.role}</span>
                <span class="role-slot-fraction ${fractionClass}">${activeCount} / ${maxSlots}</span>
            </div>
            <div class="role-dot-indicators">
                ${dotsHtml}
            </div>
        `;
        frag.appendChild(row);
    });
    listEl.appendChild(frag);
}

function renderActiveBreaks() {
    const gridEl = document.getElementById("activeBreaksGrid");
    if (!gridEl) return;
    
    if (state.activeBreaks.length === 0) {
        clearActiveBreakTicker();
        gridEl.innerHTML = `
            <div class="no-breaks-state glass-card">
                <div class="icon-illustration">
                    <i class="fa-solid fa-briefcase"></i>
                </div>
                <h3>Semua Staff Sedang Bekerja</h3>
                <p>Tidak ada staff yang sedang mengambil izin istirahat saat ini.</p>
            </div>
        `;
        return;
    }
    
    // Sembunyikan state kosong jika ada
    const noBreaks = gridEl.querySelector(".no-breaks-state");
    if (noBreaks) noBreaks.remove();
    
    const activeStaffIds = new Set(state.activeBreaks.map(ab => ab.staff_id));
    
    // Hapus kartu staff yang sudah tidak lagi istirahat
    gridEl.querySelectorAll(".active-break-card").forEach(card => {
        const id = card.id.replace("activeCard_", "");
        if (!activeStaffIds.has(id)) {
            card.remove();
        }
    });
    
    // Tambah atau perbarui kartu tanpa merusak DOM yang ada
    state.activeBreaks.forEach(ab => {
        let card = document.getElementById(`activeCard_${ab.staff_id}`);
        const roleUpper = window.formatRoleNameUpper ? window.formatRoleNameUpper(ab.role) : (ab.role || '').toUpperCase();
        if (!card) {
            card = document.createElement("div");
            card.id = `activeCard_${ab.staff_id}`;
            card.className = "glass-card active-break-card";
            card.innerHTML = `
                <div class="active-card-top">
                    <div class="active-card-name">
                        <h3>${ab.staff_name}</h3>
                        <span>${roleUpper}</span>
                    </div>
                </div>
                
                <div class="active-card-timer" id="timerContainer_${ab.staff_id}">
                    <span class="timer-val">00:00:00</span>
                </div>
                
                <div class="active-card-bottom">
                    <span>Mulai: ${formatLocalTime(ab.start_time)}</span>
                    <span class="elapsed-info">Berjalan...</span>
                </div>
                <div class="timer-progress-bar" id="progressBar_${ab.staff_id}"></div>
            `;
            gridEl.appendChild(card);
        } else {
            const roleSpan = card.querySelector(".active-card-name span");
            if (roleSpan && roleSpan.textContent !== roleUpper) roleSpan.textContent = roleUpper;
        }
    });
    
    startActiveBreakTicker();
}

// 11. RENDERING LAPORAN
function renderReports(filter = "all") {
    if (state.reportMode === "monthly") {
        // TAMPILAN REKAP BULANAN (SEBULAN PENUH)
        const tbodyGrouped = document.getElementById("monthlyReportTableBody");
        tbodyGrouped.innerHTML = "";
        
        const selectedMonth = document.getElementById("reportMonthFilter") ? document.getElementById("reportMonthFilter").value : new Date().toLocaleDateString('sv-SE').substring(0, 7);
        
        if (!selectedMonth) {
            tbodyGrouped.innerHTML = `<tr><td colspan="2" class="text-center" style="color: var(--text-muted); padding: 30px;">Pilih bulan terlebih dahulu.</td></tr>`;
            return;
        }

        // Filter log di bulan terpilih (semua status agar bisa mendeteksi hari aman vs tidak ada data)
        let filteredLogs = state.logs.filter(l => {
            if (!l.start_time) return false;
            return new Date(l.start_time).toLocaleDateString('sv-SE').substring(0, 7) === selectedMonth;
        });
        
        const [year, month] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        
        // Grouping logs berdasarkan hari (1 sampai daysInMonth)
        const groupedByDay = {};
        for (let d = 1; d <= daysInMonth; d++) {
            groupedByDay[d] = {
                lateStaff: {}, // nama -> jumlah terlambat
                totalLogs: 0
            };
        }
        
        filteredLogs.forEach(l => {
            const d = new Date(l.start_time);
            const dayNum = d.getDate();
            if (groupedByDay[dayNum]) {
                groupedByDay[dayNum].totalLogs++;
                if (l.status === 'Terlambat') {
                    const name = l.staff_name;
                    groupedByDay[dayNum].lateStaff[name] = (groupedByDay[dayNum].lateStaff[name] || 0) + 1;
                }
            }
        });
        
        let hasLateData = false;
        
        // Urutkan hari dari yang terbaru (tanggal terbesar ke terkecil)
        for (let dayNum = daysInMonth; dayNum >= 1; dayNum--) {
            const dayData = groupedByDay[dayNum];
            
            if (Object.keys(dayData.lateStaff).length > 0) {
                hasLateData = true;
                const dayStr = String(dayNum).padStart(2, '0');
                const monthStr = String(month).padStart(2, '0');
                const dateKey = `${monthStr}/${dayStr}/${year}`;
                
                const [mVal, dVal, yVal] = dateKey.split('/').map(Number);
                const dateObj = new Date(yVal, mVal - 1, dVal);
                const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
                const monthNameShort = dateObj.toLocaleDateString('id-ID', { month: 'short' }).toUpperCase();
                
                const staffList = Object.entries(dayData.lateStaff)
                    .map(([name, count]) => `
                        <span class="late-staff-tag" style="background: rgba(244, 63, 94, 0.05); border: 1px solid rgba(244, 63, 94, 0.16); padding: 6px 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s ease;">
                            <i class="fa-solid fa-triangle-exclamation" style="color: #f43f5e; font-size: 0.75rem;"></i>
                            <span style="font-weight: 700; color: #fda4af; font-size: 0.78rem; letter-spacing: 0.3px;">${name.toUpperCase()}</span>
                            <span style="background: rgba(244, 63, 94, 0.18); border: 1px solid rgba(244, 63, 94, 0.3); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${count}x Terlambat</span>
                        </span>
                    `).join("");
                
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td style="padding: 12px 14px; vertical-align: middle;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 10px; width: 44px; height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                                <span style="font-size: 0.55rem; text-transform: uppercase; letter-spacing: 1px; color: var(--accent); font-weight: 800;">${monthNameShort}</span>
                                <span style="font-size: 0.95rem; font-weight: 800; color: #ffffff;">${dVal}</span>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-main);">${dayName}</span>
                                <span style="font-size: 0.65rem; color: var(--text-muted);">${yVal}</span>
                            </div>
                        </div>
                    </td>
                    <td style="padding: 12px 14px; vertical-align: middle;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
                            ${staffList}
                        </div>
                    </td>
                `;
                tbodyGrouped.appendChild(row);
            }
        }
        
        if (!hasLateData) {
            tbodyGrouped.innerHTML = `<tr><td colspan="2" class="text-center" style="color: var(--text-muted); padding: 30px;">Tidak ada rekap keterlambatan staff untuk bulan ${selectedMonth || '-'}.</td></tr>`;
        }
    } else {
        // TAMPILAN RIWAYAT HARIAN (DEFAULT)
        const tbody = document.getElementById("reportTableBody");
        tbody.innerHTML = "";
        
        const selectedDate = document.getElementById("reportDateFilter") ? document.getElementById("reportDateFilter").value : new Date().toLocaleDateString('sv-SE');
        
        let filteredLogs = state.logs;
        
        if (selectedDate) {
            filteredLogs = filteredLogs.filter(l => new Date(l.start_time).toLocaleDateString('sv-SE') === selectedDate);
        }
        
        if (filter !== "all") {
            filteredLogs = filteredLogs.filter(l => l.status === filter);
        }
        
        if (filteredLogs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color: var(--text-muted); padding: 30px;">Tidak ada riwayat untuk filter '${filter}' pada tanggal ${selectedDate || '-'}.</td></tr>`;
            return;
        }
        
        const frag = document.createDocumentFragment();
        filteredLogs.forEach(log => {
            const startText = formatLocalTime(log.start_time);
            const endText = formatLocalTime(log.end_time);
            const durationText = formatDurationSeconds(log.duration_seconds);
            const allowedText = formatDurationSeconds(log.allowed_duration_minutes);
            
            const statusClass = log.status === 'Aman' ? 'safe' : 'late';
            const overtimeText = log.status === 'Terlambat' ? formatDurationSeconds(log.overtime_seconds) : "-";
            
            const row = document.createElement("tr");
            row.setAttribute("data-id", log.id);
            row.innerHTML = `
                <td><strong>${log.staff_name}</strong></td>
                <td><span class="role-badge" style="margin:0">${log.role}</span></td>
                <td>${startText}</td>
                <td>${endText}</td>
                <td>${durationText}</td>
                <td>${allowedText}</td>
                <td><span class="status-badge ${statusClass}">${log.status}</span></td>
                <td style="color:${log.status === 'Terlambat' ? 'var(--danger)' : 'inherit'}">${overtimeText}</td>
                <td>
                    <button class="btn-icon-danger" onclick="window.handleDeleteReportLogClick('${log.id}', '${log.staff_name}')" title="Hapus Log">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
            frag.appendChild(row);
        });
        tbody.appendChild(frag);
    }
}

// Ekspor Riwayat ke File CSV
function exportLogsToCSV() {
    if (state.reportMode === "monthly") {
        // Ekspor Rekap Bulanan Terlambat (Sebulan Penuh)
        const selectedMonth = document.getElementById("reportMonthFilter") ? document.getElementById("reportMonthFilter").value : new Date().toLocaleDateString('sv-SE').substring(0, 7);
        
        if (!selectedMonth) {
            showToast("Bulan tidak valid.", "warning");
            return;
        }

        const [year, month] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        
        // Filter log di bulan terpilih
        const filteredLogs = state.logs.filter(l => {
            if (!l.start_time) return false;
            return new Date(l.start_time).toLocaleDateString('sv-SE').substring(0, 7) === selectedMonth;
        });
        
        const groupedByDay = {};
        for (let d = 1; d <= daysInMonth; d++) {
            groupedByDay[d] = {
                lateStaff: {},
                totalLogs: 0
            };
        }
        
        filteredLogs.forEach(l => {
            const d = new Date(l.start_time);
            const dayNum = d.getDate();
            if (groupedByDay[dayNum]) {
                groupedByDay[dayNum].totalLogs++;
                if (l.status === 'Terlambat') {
                    const name = l.staff_name;
                    groupedByDay[dayNum].lateStaff[name] = (groupedByDay[dayNum].lateStaff[name] || 0) + 1;
                }
            }
        });
        
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Tanggal,Daftar Staff Terlambat\n";
        
        let hasLateData = false;
        for (let dayNum = daysInMonth; dayNum >= 1; dayNum--) {
            const dayData = groupedByDay[dayNum];
            if (Object.keys(dayData.lateStaff).length > 0) {
                hasLateData = true;
                const dayStr = String(dayNum).padStart(2, '0');
                const monthStr = String(month).padStart(2, '0');
                const dateKey = `${monthStr}/${dayStr}/${year}`;
                
                const staffListStr = Object.entries(dayData.lateStaff)
                    .map(([name, count]) => `${name.toUpperCase()} (${count}x)`)
                    .join(" | ");
                
                csvContent += `"${dateKey}","${staffListStr}"\n`;
            }
        }
        
        if (!hasLateData) {
            showToast(`Tidak ada data rekap keterlambatan bulan ${selectedMonth || '-'} untuk diekspor.`, "warning");
            return;
        }
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `rekap_bulanan_${selectedMonth}.csv`);
        document.body.appendChild(link);
        
        link.click();
        document.body.removeChild(link);
        showToast(`Rekap bulanan ${selectedMonth} berhasil diunduh sebagai file CSV.`, "success");
    } else {
        // Ekspor Riwayat Harian (Default)
        const selectedDate = document.getElementById("reportDateFilter") ? document.getElementById("reportDateFilter").value : new Date().toLocaleDateString('sv-SE');
        
        let filteredExportLogs = state.logs;
        if (selectedDate) {
            filteredExportLogs = filteredExportLogs.filter(l => new Date(l.start_time).toLocaleDateString('sv-SE') === selectedDate);
        }
        
        if (filteredExportLogs.length === 0) {
            showToast(`Tidak ada data laporan tanggal ${selectedDate || '-'} untuk diekspor.`, "warning");
            return;
        }
        
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Nama Staff,Jabatan,Waktu Mulai,Waktu Selesai,Durasi Pakai (HH:MM:SS),Batas Durasi (HH:MM:SS),Status,Keterlambatan (HH:MM:SS)\n";
        
        filteredExportLogs.forEach(log => {
            const startTime = new Date(log.start_time).toLocaleString('id-ID');
            const endTime = new Date(log.end_time).toLocaleString('id-ID');
            const durationText = formatDurationSeconds(log.duration_seconds);
            const allowedText = formatDurationSeconds(log.allowed_duration_minutes);
            const overtimeText = log.status === 'Terlambat' ? formatDurationSeconds(log.overtime_seconds) : "00:00:00";
            
            csvContent += `"${log.staff_name}","${log.role}","${startTime}","${endTime}","${durationText}","${allowedText}","${log.status}","${overtimeText}"\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        
        link.setAttribute("download", `laporan_istirahat_${selectedDate}.csv`);
        document.body.appendChild(link);
        
        link.click();
        document.body.removeChild(link);
        showToast(`Laporan tanggal ${selectedDate} berhasil diunduh sebagai file CSV.`, "success");
    }
}

// 12. ADMIN PANEL: AUTENTIKASI (BYPASSED)
function showAdminAuthForm() {
    sessionStorage.setItem("restease_admin_auth", "true");
    const authSec = document.getElementById("adminAuthSection");
    const workSec = document.getElementById("adminWorkspaceSection");
    if (authSec) authSec.classList.add("hide");
    if (workSec) workSec.classList.remove("hide");
}

function authenticateAdmin() {
    sessionStorage.setItem("restease_admin_auth", "true");
    const authSec = document.getElementById("adminAuthSection");
    const workSec = document.getElementById("adminWorkspaceSection");
    if (authSec) authSec.classList.add("hide");
    if (workSec) workSec.classList.remove("hide");
    renderAdminStaff();
    renderAdminRoles();
}

function isAdminAuthenticated() {
    return sessionStorage.getItem("restease_admin_auth") === "true";
}

function lockAdminPanel() {
    sessionStorage.removeItem("restease_admin_auth");
    
    // Switch global view back to Izin Istirahat
    showView("izinView");
    const izinNavBtn = document.querySelector('.nav-item-main[data-target="izinView"]');
    if (izinNavBtn) {
        setActiveNav(izinNavBtn);
    }
    
    // Ensure Izin View tab resets to Papan Monitor
    const monitorBtn = document.querySelector('#izinTabMenu .btn-tab[data-izin-target="monitorView"]');
    if (monitorBtn) monitorBtn.click();
    
    showToast("Panel Admin terkunci.", "info");
}

// 13. ADMIN PANEL: CRUD STAFF
function renderAdminStaff() {
    const tbody = document.getElementById("adminStaffTableBody");
    tbody.innerHTML = "";
    
    const searchInput = document.getElementById("adminSearchStaff");
    const roleSelect = document.getElementById("adminFilterStaffRole");
    
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const selectedRole = roleSelect ? roleSelect.value : "";
    
    let list = state.staff;
    
    // 1. Filter nama
    if (searchQuery.length > 0) {
        list = list.filter(s => s.name.toLowerCase().includes(searchQuery));
    }
    
    // 2. Filter jabatan
    if (selectedRole) {
        list = list.filter(s => isSameRole(s.role, selectedRole));
    }
    
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="color:var(--text-muted)">Tidak ada staff yang cocok.</td></tr>';
        return;
    }
    
    list.forEach(staff => {
        // Buat daftar opsi jabatan dinamis
        let optionsHTML = "";
        getAllowedRoles().forEach(roleName => {
            const selected = isSameRole(roleName, staff.role) ? "selected" : "";
            optionsHTML += `<option value="${roleName}" ${selected}>${roleName}</option>`;
        });
        
        if (!isAllowedRole(staff.role)) {
            optionsHTML = `<option value="" selected disabled>Role lama: ${staff.role}</option>` + optionsHTML;
        }

        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${staff.name}</strong></td>
            <td>
                <select class="role-select-badge" onchange="updateStaffRole('${staff.id}', this.value)" title="Ganti Jabatan">
                    ${optionsHTML}
                </select>
            </td>
            <td class="text-right">
                <button class="btn-icon-danger" onclick="deleteStaff('${staff.id}', '${staff.name}')" title="Hapus Staff">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Fungsi Edit Jabatan Staff secara inline
window.updateStaffRole = async function(id, newRole) {
    if (!supabaseClient) return;
    if (!isAllowedRole(newRole)) {
        showToast("Jabatan tidak valid. Pilih salah satu jabatan resmi.", "error");
        renderAdminStaff();
        return;
    }
    
    try {
        const canonicalRoleName = getCanonicalRoleName(newRole);
        // 1. Update jabatan di tabel staff
        const { error: staffErr } = await supabaseClient
            .from('staff')
            .update({ role: canonicalRoleName })
            .eq('id', id);
            
        if (staffErr) throw staffErr;
        
        // 2. Update jabatan di tabel active_breaks jika staff tersebut sedang istirahat
        const { error: activeErr } = await supabaseClient
            .from('active_breaks')
            .update({ role: canonicalRoleName })
            .eq('staff_id', id);
            
        if (activeErr) throw activeErr;
        
        showToast("Jabatan staff berhasil diperbarui.", "success");
        // Catatan: Sinkronisasi data ke memory local di-handle secara otomatis oleh realtime subscription
    } catch (err) {
        console.error("Gagal mengubah jabatan staff:", err);
        showToast("Gagal memperbarui jabatan staff.", "error");
        renderAdminStaff(); // Refresh UI untuk merestore nilai dropdown lama
    }
};

function populateRoleDropdowns() {
    const selectRole = document.getElementById("selectStaffRole");
    selectRole.innerHTML = "";
    
    const filterRole = document.getElementById("adminFilterStaffRole");
    const prevSelectedFilter = filterRole ? filterRole.value : "";
    if (filterRole) {
        filterRole.innerHTML = '<option value="">Semua Jabatan</option>';
    }
    
    const absensiFilterRole = document.getElementById("absensiShiftFilterRole");
    const prevAbsensiFilter = absensiFilterRole ? absensiFilterRole.value : "";
    if (absensiFilterRole) {
        absensiFilterRole.innerHTML = '<option value="">Semua Jabatan</option>';
    }
    
    getAllowedRoles().forEach(roleName => {
        // Dropdown Form Tambah Staff
        const opt = document.createElement("option");
        opt.value = roleName;
        opt.textContent = roleName;
        selectRole.appendChild(opt);
        
        // Dropdown Filter Table Staff
        if (filterRole) {
            const optFilter = document.createElement("option");
            optFilter.value = roleName;
            optFilter.textContent = roleName;
            if (isSameRole(roleName, prevSelectedFilter)) {
                optFilter.selected = true;
            }
            filterRole.appendChild(optFilter);
        }
        
        // Dropdown Filter Jadwal Shift
        if (absensiFilterRole) {
            const optAbs = document.createElement("option");
            optAbs.value = roleName;
            optAbs.textContent = roleName;
            if (isSameRole(roleName, prevAbsensiFilter)) {
                optAbs.selected = true;
            }
            absensiFilterRole.appendChild(optAbs);
        }
    });
}

async function handleAddStaff(e) {
    e.preventDefault();
    if (!supabaseClient) return;
    
    const inputName = document.getElementById("inputStaffName");
    const selectRole = document.getElementById("selectStaffRole");
    
    const name = inputName.value.trim();
    const role = selectRole.value;
    
    if (!name || !role) {
        showToast("Isi nama dan pilih jabatan.", "warning");
        return;
    }
    
    if (!isAllowedRole(role)) {
        showToast("Jabatan tidak valid. Pilih dari daftar yang tersedia.", "error");
        return;
    }
    
    // Periksa apakah nama sudah terdaftar
    const exist = state.staff.some(s => s.name.toLowerCase() === name.toLowerCase());
    if (exist) {
        showToast("Nama staff sudah terdaftar.", "error");
        return;
    }
    
    try {
        const canonicalRoleName = getCanonicalRoleName(role);
        const { error } = await supabaseClient
            .from('staff')
            .insert({ name: name, role: canonicalRoleName });
            
        if (error) throw error;
        
        inputName.value = "";
        showToast(`Staff ${name} berhasil ditambahkan.`, "success");
    } catch (err) {
        console.error("Gagal menambahkan staff:", err);
        showToast("Kesalahan saat menyimpan data staff.", "error");
    }
}

// Dideklarasikan ke window agar onclick inline button berfungsi
window.deleteStaff = async function(id, name) {
    if (!supabaseClient) return;
    if (!await showCustomConfirm(`Hapus staff ${name}? Semua riwayat & status istirahat aktifnya akan ikut terhapus.`, "Hapus Staff", true)) return;
    
    try {
        // Hapus dari active_breaks jika sedang istirahat
        await supabaseClient.from('active_breaks').delete().eq('staff_id', id);
        
        // Hapus staff
        const { error } = await supabaseClient
            .from('staff')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        showToast(`Staff ${name} berhasil dihapus.`, "success");
    } catch (err) {
        console.error("Gagal menghapus staff:", err);
        showToast("Gagal menghapus staff dari database.", "error");
    }
};

// 14. ADMIN PANEL: CRUD JABATAN & SLOT
function renderAdminRoles() {
    const tbody = document.getElementById("adminRolesTableBody");
    tbody.innerHTML = "";
    
    getManagedRolesConfig().forEach(rc => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${rc.role}</strong></td>
            <td><span class="badge" style="background:var(--primary-glow); color:var(--primary)">${rc.max_slots} Slot</span></td>
            <td class="text-right">
                <span style="color: var(--text-muted); font-size: 0.75rem;">Tetap</span>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function handleAddRole(e) {
    e.preventDefault();
    if (!supabaseClient) return;
    
    const inputRole = document.getElementById("inputRoleName");
    const inputSlots = document.getElementById("inputRoleSlots");
    
    const roleName = getCanonicalRoleName(inputRole.value);
    const slots = parseInt(inputSlots.value);
    
    if (!roleName || isNaN(slots) || slots < 1) {
        showToast("Masukkan nama jabatan dan slot minimal 1.", "warning");
        return;
    }
    
    if (!isAllowedRole(roleName)) {
        showToast("Jabatan tidak valid. Gunakan salah satu dari 4 jabatan resmi.", "error");
        return;
    }
    
    try {
        // Gunakan upsert untuk membuat baru atau mengupdate jika sudah ada
        const { error } = await supabaseClient
            .from('roles_config')
            .upsert({ role: roleName, max_slots: slots });
            
        if (error) throw error;
        
        inputRole.value = getAllowedRoles()[0];
        inputSlots.value = 1;
        showToast(`Jabatan ${roleName} disimpan dengan ${slots} slot.`, "success");
    } catch (err) {
        console.error("Gagal menyimpan jabatan:", err);
        showToast("Kesalahan saat menyimpan jabatan.", "error");
    }
}

window.deleteRole = async function(roleName) {
    if (!supabaseClient) return;
    
    if (isAllowedRole(roleName)) {
        showToast("Empat jabatan utama tidak dapat dihapus.", "warning");
        return;
    }
    
    // Peringatan jika ada staff terdaftar dengan jabatan ini
    const countStaffInRole = state.staff.filter(s => isSameRole(s.role, roleName)).length;
    let confirmMsg = `Hapus jabatan ${roleName}?`;
    
    if (countStaffInRole > 0) {
        confirmMsg = `PERINGATAN: Ada ${countStaffInRole} staff dengan jabatan ${roleName}. Menghapus jabatan ini dapat menyebabkan konflik data. Tetap hapus?`;
    }
    
    if (!await showCustomConfirm(confirmMsg, "Hapus Jabatan", true)) return;
    
    try {
        const { error } = await supabaseClient
            .from('roles_config')
            .delete()
            .eq('role', roleName);
            
        if (error) throw error;
        showToast(`Jabatan ${roleName} berhasil dihapus.`, "success");
    } catch (err) {
        console.error("Gagal menghapus jabatan:", err);
        showToast("Gagal menghapus jabatan dari database. Pastikan tidak ada dependensi.", "error");
    }
};

// 14b. ADMIN PANEL: ROLE ACCESS (RBAC)
function renderAdminRoleAccess() {
    const container = document.getElementById("roleAccessContainer");
    if (!container) return;
    
    const allRoles = ["CS LINE", "CS LC", "KAPTEN KASIR", "KASIR"];
    const currentAccess = state.settings.role_access || DEFAULT_ROLE_ACCESS;
    
    // Inisialisasi temporary state untuk pemilihan staff sebelum di-save
    if (!window.tempStaffAccess) {
        window.tempStaffAccess = state.settings.staff_access ? JSON.parse(JSON.stringify(state.settings.staff_access)) : {};
    }
    
    // Clear container
    container.innerHTML = "";
    
    // Create luxurious matrix table wrapper
    const tableWrapper = document.createElement("div");
    tableWrapper.style.cssText = `
        overflow-x: auto;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.08);
        background: linear-gradient(145deg, rgba(15,23,42,0.6) 0%, rgba(0,0,0,0.4) 100%);
        box-shadow: 0 10px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
        backdrop-filter: blur(12px);
    `;

    let html = `
        <table style="width: 100%; border-collapse: collapse; min-width: 650px;">
            <thead>
                <tr>
                    <th style="text-align: left; padding: 18px 20px; background: rgba(255,255,255,0.03); color: #f8fafc; font-weight: 700; letter-spacing: 0.5px; border-bottom: 2px solid rgba(255,255,255,0.08); border-top-left-radius: 16px; text-transform: uppercase; font-size: 0.8rem;">Menu / Fitur</th>
    `;
    
    // Add column headers for roles
    allRoles.forEach(role => {
        let icon = "fa-user-tie";
        if (role.includes("LINE")) icon = "fa-headset";
        if (role.includes("LC")) icon = "fa-comments";
        if (role.includes("KASIR")) icon = "fa-cash-register";
        
        html += `
            <th style="text-align: center; padding: 18px 10px; background: rgba(255,255,255,0.03); color: #cbd5e1; font-weight: 600; font-size: 0.8rem; border-bottom: 2px solid rgba(255,255,255,0.08); width: 110px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
                    <i class="fa-solid ${icon}" style="color: var(--primary); font-size: 1.1rem; text-shadow: 0 0 10px var(--primary-glow);"></i>
                    <span>${role}</span>
                </div>
            </th>
        `;
    });
    
    // Add Individual Staff Column Header
    html += `
            <th style="text-align: center; padding: 18px 10px; background: rgba(255,255,255,0.03); color: #cbd5e1; font-weight: 600; font-size: 0.8rem; border-bottom: 2px solid rgba(255,255,255,0.08); width: 160px; border-left: 1px solid rgba(255,255,255,0.1);">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-users-gear" style="color: #38bdf8; font-size: 1.1rem; text-shadow: 0 0 10px rgba(56,189,248,0.5);"></i>
                    <span>Pengecualian Staff</span>
                </div>
            </th>
    `;
    
    html += `
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add rows for each menu
    RBAC_MENUS.forEach((menu, index) => {
        const menuAllowedRoles = currentAccess[menu.id] || [];
        const isLast = index === RBAC_MENUS.length - 1;
        const borderBottom = isLast ? 'none' : '1px solid rgba(255,255,255,0.05)';
        
        let menuIcon = "fa-shield-halved";
        if (menu.id.includes("chat")) menuIcon = "fa-comments";
        if (menu.id.includes("izin") || menu.id.includes("clock")) menuIcon = "fa-clock";
        if (menu.id.includes("absensi")) menuIcon = "fa-clipboard-user";
        if (menu.id.includes("paspor")) menuIcon = "fa-passport";
        if (menu.id.includes("bukti")) menuIcon = "fa-file-invoice-dollar";
        if (menu.id.includes("dataRekening")) menuIcon = "fa-credit-card";
        if (menu.id.includes("banding")) menuIcon = "fa-gavel";
        if (menu.id.includes("qris")) menuIcon = "fa-qrcode";
        if (menu.id.includes("serahTerima")) menuIcon = "fa-handshake";
        if (menu.id.includes("admin")) menuIcon = "fa-screwdriver-wrench";

        html += `
            <tr style="border-bottom: ${borderBottom}; transition: all 0.25s ease;" 
                onmouseover="this.style.background='rgba(255,255,255,0.04)'; this.style.transform='scale(1.002)';" 
                onmouseout="this.style.background='transparent'; this.style.transform='scale(1)';">
                <td style="padding: 16px 20px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.3); display: flex; align-items: center; justify-content: center; color: #c4b5fd; font-size: 0.9rem; flex-shrink: 0; box-shadow: 0 0 10px rgba(139,92,246,0.1);">
                            <i class="fa-solid ${menuIcon}"></i>
                        </div>
                        <span style="font-weight: 600; color: #f1f5f9; font-size: 0.95rem; letter-spacing: 0.2px;">${menu.label}</span>
                    </div>
                </td>
        `;
        
        // Add toggles for each role
        allRoles.forEach(role => {
            const isChecked = menuAllowedRoles.includes(role);
            html += `
                <td style="text-align: center; padding: 16px 10px;">
                    <label class="feature-toggle-switch" style="margin: 0 auto; display: inline-block;">
                        <input type="checkbox" class="rbac-checkbox" data-view="${menu.id}" data-role="${role}" ${isChecked ? 'checked' : ''}>
                        <span class="feature-toggle-slider" style="box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></span>
                    </label>
                </td>
            `;
        });
        
        // Add Individual Staff Access Button
        const staffCount = window.tempStaffAccess[menu.id] ? window.tempStaffAccess[menu.id].length : 0;
        const btnClass = staffCount > 0 ? 'btn-active-override' : 'btn-dim-override';
        const btnColor = staffCount > 0 ? '#38bdf8' : 'rgba(255,255,255,0.3)';
        const btnBg = staffCount > 0 ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.05)';
        const btnBorder = staffCount > 0 ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.1)';
        
        html += `
                <td style="text-align: center; padding: 16px 10px; border-left: 1px solid rgba(255,255,255,0.05);">
                    <button onclick="openRbacStaffModal('${menu.id}', '${menu.label}')" style="background: ${btnBg}; border: 1px solid ${btnBorder}; color: ${btnColor}; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                        <i class="fa-solid fa-user-plus" style="margin-right: 5px;"></i> ${staffCount > 0 ? staffCount + ' Staff' : 'Pilih'}
                    </button>
                </td>
        `;
        
        html += `</tr>`;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    tableWrapper.innerHTML = html;
    container.appendChild(tableWrapper);
}

window.saveRoleAccessSettings = async function() {
    if (!supabaseClient) return;

    const newRoleAccess = {};
    const checkboxes = document.querySelectorAll('.rbac-checkbox');
    
    checkboxes.forEach(cb => {
        const viewId = cb.dataset.view;
        const role = cb.dataset.role;
        if (!newRoleAccess[viewId]) {
            newRoleAccess[viewId] = [];
        }
        if (cb.checked) {
            newRoleAccess[viewId].push(role);
        }
    });

    const newSettingsVal = {
        ...state.settings,
        role_access: newRoleAccess,
        staff_access: window.tempStaffAccess || {}
    };

    try {
        const { error } = await supabaseClient
            .from('settings')
            .update({ value: newSettingsVal })
            .eq('key', 'general');

        if (error) throw error;
        
        state.settings = newSettingsVal;
        window.tempStaffAccess = null;
        updateRoleBasedSidebarAccess();
        showToast("Pengaturan akses menu berhasil disimpan!", "success");
    } catch (err) {
        console.error("Gagal menyimpan role access:", err);
        showToast("Terjadi kesalahan saat menyimpan pengaturan akses.", "error");
    }
};

window.openRbacStaffModal = function(viewId, menuLabel) {
    window.currentEditingMenuView = viewId;
    const modal = document.getElementById('rbacStaffModal');
    const titleEl = document.getElementById('rbacStaffModalTitle');
    const listEl = document.getElementById('rbacStaffList');
    const searchInput = document.getElementById('rbacStaffSearch');
    
    if (!modal || !titleEl || !listEl) return;
    
    titleEl.textContent = `Akses Khusus: ${menuLabel}`;
    listEl.innerHTML = '';
    if (searchInput) searchInput.value = ''; // Reset search
    
    // Ensure tempStaffAccess is initialized
    if (!window.tempStaffAccess) {
        window.tempStaffAccess = state.settings.staff_access ? JSON.parse(JSON.stringify(state.settings.staff_access)) : {};
    }
    
    const selectedStaffIds = window.tempStaffAccess[viewId] || [];
    
    if (!state.staff || state.staff.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px;">Belum ada data staff.</div>';
    } else {
        const sortedStaff = [...state.staff].sort((a, b) => a.name.localeCompare(b.name));
        
        sortedStaff.forEach(st => {
            const isChecked = selectedStaffIds.includes(st.id);
            const role = formatRoleNameUpper(st.role) || "TIDAK ADA ROLE";
            
            listEl.innerHTML += `
                <div class="rbac-staff-item" data-name="${st.name.toLowerCase()}" style="display:flex; align-items:center; justify-content:space-between; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display:flex; flex-direction:column; align-items:flex-start;">
                        <span style="font-weight:600; color:#fff; font-size:0.95rem; text-transform: uppercase;">${st.name}</span>
                        <span style="font-size:0.75rem; color:var(--text-muted); display:flex; align-items:center; gap:4px; margin-top:2px;">
                            <i class="fa-solid fa-user-tag"></i> ${role}
                        </span>
                    </div>
                    <label class="feature-toggle-switch" style="margin:0;">
                        <input type="checkbox" class="rbac-staff-cb" value="${st.id}" ${isChecked ? 'checked' : ''}>
                        <span class="feature-toggle-slider" style="box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></span>
                    </label>
                </div>
            `;
        });
    }
    
    modal.classList.remove('hide');
};

window.filterRbacStaffList = function() {
    const searchInput = document.getElementById('rbacStaffSearch');
    if (!searchInput) return;
    const filter = searchInput.value.toLowerCase();
    
    const items = document.querySelectorAll('.rbac-staff-item');
    items.forEach(item => {
        const name = item.getAttribute('data-name');
        if (name.includes(filter)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
};

window.closeRbacStaffModal = function() {
    const modal = document.getElementById('rbacStaffModal');
    if (modal) modal.classList.add('hide');
};

window.saveRbacStaffSelection = function() {
    if (!window.currentEditingMenuView) return;
    const viewId = window.currentEditingMenuView;
    
    if (!window.tempStaffAccess) window.tempStaffAccess = {};
    
    const selectedIds = [];
    const checkboxes = document.querySelectorAll('.rbac-staff-cb:checked');
    checkboxes.forEach(cb => {
        selectedIds.push(cb.value);
    });
    
    window.tempStaffAccess[viewId] = selectedIds;
    
    closeRbacStaffModal();
    // Re-render the matrix to update button counters
    renderAdminRoleAccess();
};

// 15. ADMIN PANEL: CONFIG UMUM
async function handleSaveSettings(e) {
    e.preventDefault();
    if (!supabaseClient) return;
    
    const durationStr = document.getElementById("inputDefaultDuration").value.trim();
    const quota = parseInt(document.getElementById("inputDailyQuota").value);
    const passcode = document.getElementById("inputAdminPasscode").value.trim();
    
    const durationPattern = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
    if (!durationPattern.test(durationStr)) {
        showToast("Format durasi istirahat salah. Harus HH:MM:SS (contoh: 00:20:59).", "warning");
        return;
    }
    
    if (isNaN(quota) || quota < 1 || !passcode) {
        showToast("Harap isi semua kolom dengan benar.", "warning");
        return;
    }
    
    const newSettingsVal = {
        ...state.settings,
        default_duration: durationStr,
        daily_quota: quota,
        admin_passcode: passcode
    };
    
    try {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({ key: 'general', value: newSettingsVal });
            
        if (error) throw error;
        showToast("Pengaturan umum berhasil disimpan.", "success");
    } catch (err) {
        console.error("Gagal menyimpan pengaturan:", err);
        showToast("Gagal menyimpan pengaturan ke database.", "error");
    }
}

// ----------------------------------------------------------------
// FEATURE TOGGLE: TEAM CHAT
// ----------------------------------------------------------------
async function handleChatToggle(enabled) {
    const toggle = document.getElementById('toggleChatEnabled');

    // Pastikan settings sudah ada
    if (!state.settings) state.settings = {};

    // Disable toggle sementara
    if (toggle) toggle.disabled = true;

    // 1. Simpan ke localStorage dulu agar persist saat refresh
    localStorage.setItem('chat_feature_enabled', JSON.stringify(enabled));

    // 2. Apply langsung ke UI
    applyChatEnabled(enabled);

    // 3. Update state.settings dulu sebelum save ke DB
    state.settings.chat_enabled = enabled;

    try {
        // 4. Simpan ke database
        const { data, error } = await supabaseClient
            .from('settings')
            .update({ value: state.settings })
            .eq('key', 'general')
            .select();

        if (error) throw error;

        showToast(`Team Chat ${enabled ? 'diaktifkan ✓' : 'dinonaktifkan ✓'}.`, enabled ? 'success' : 'info');
    } catch (err) {
        console.error('[Admin] Gagal simpan chat_enabled:', err);
        showToast('Tersimpan lokal, gagal sinkron DB: ' + err.message, 'warning');
        // Tetap biarkan UI sesuai pilihan — localStorage sudah tersimpan
    } finally {
        if (toggle) toggle.disabled = false;
    }
}

function applyChatEnabled(enabled) {
    const navBtn = document.getElementById('btnChatView');
    if (navBtn) {
        if (enabled) {
            navBtn.classList.remove('feature-hidden');
        } else {
            navBtn.classList.add('feature-hidden');
        }
    }
    
    // Update toggle state in admin panel if it exists
    const toggleChat = document.getElementById('toggleChatEnabled');
    if (toggleChat) {
        toggleChat.checked = enabled;
    }
    
    // Jika sedang di chat view dan dinonaktifkan, redirect ke izinView
    if (!enabled) {
        const chatView = document.getElementById('chatView');
        if (chatView && chatView.classList.contains('active')) {
            showView('izinView');
            const izinBtn = document.querySelector('.nav-item-main[data-target="izinView"]');
            if (izinBtn) setActiveNav(izinBtn);
        }
    }
}

// ----------------------------------------------------------------
// RULES CARD (INGAT YA TEMAN-TEMAN) — FEATURE TOGGLE + TEXT EDITOR
// ----------------------------------------------------------------

const RULES_CARD_DEFAULTS = {
    enabled: true,
    title: 'INGAT YA TEMAN-TEMAN',
    points: [
        'Dilarang melakukan tindak manipulasi dalam bentuk apa pun.',
        'Dilarang melakukan segala bentuk perjudian.',
        'Dilarang menggunakan, menyimpan, atau mengedarkan narkotika dan obat-obatan terlarang (narkoba).'
    ]
};

/** Show/hide the rules card in bioView and sync the toggle in admin panel */
function applyRulesCardSettings() {
    const s = (state.settings && state.settings.rules_card) ? state.settings.rules_card : RULES_CARD_DEFAULTS;
    const enabled = s.enabled !== false; // default true
    const title   = s.title  || RULES_CARD_DEFAULTS.title;
    const points  = Array.isArray(s.points) && s.points.length ? s.points : RULES_CARD_DEFAULTS.points;

    // 1. Show / hide the section wrapper
    const section = document.getElementById('rulesCardSection');
    if (section) section.style.display = enabled ? '' : 'none';

    // 2. Update title text in bioView
    const titleEl = document.getElementById('rulesCardTitle');
    if (titleEl) titleEl.textContent = title;

    // 3. Render rules points in bioView
    renderRulesPointsDisplay(points);

    // 4. Sync admin toggle
    const toggleEl = document.getElementById('toggleRulesCardEnabled');
    if (toggleEl) toggleEl.checked = enabled;

    // 5. Sync admin text editor
    syncRulesCardEditor(title, points);
}

/** Render the styled rules rows inside #rulesPointsList (bioView display) */
function renderRulesPointsDisplay(points) {
    const list = document.getElementById('rulesPointsList');
    if (!list) return;
    const colors = ['rgba(239,68,68', 'rgba(251,146,60', 'rgba(239,68,68'];
    const textColors = ['rgba(255,220,210', 'rgba(255,225,205', 'rgba(255,220,210'];
    const highlightColors = ['#fca5a5', '#fdba74', '#fca5a5'];
    list.innerHTML = points.map((pt, i) => {
        const ci = i % colors.length;
        const c  = colors[ci];
        const tc = textColors[ci];
        const hc = highlightColors[ci];
        return `
        <div style="display:flex;align-items:flex-start;gap:14px;background:${c},0.07);border:1px solid ${c},0.18);border-radius:12px;padding:13px 16px;">
            <div style="width:28px;height:28px;background:linear-gradient(135deg,${c},0.3),${c},0.15));border:1px solid ${c},0.45);border-radius:8px;display:flex;align-items:center;justify-content:center;color:${hc};font-size:0.75rem;flex-shrink:0;margin-top:1px;">
                <i class="fa-solid fa-ban"></i>
            </div>
            <span style="font-size:0.88rem;font-weight:600;color:${tc},0.92);line-height:1.6;letter-spacing:0.2px;">${escapeHtml(pt)}</span>
        </div>`;
    }).join('');
}

/** Sync the admin editor inputs with current data */
function syncRulesCardEditor(title, points) {
    const titleInput = document.getElementById('inputRulesCardTitle');
    if (titleInput) titleInput.value = title;

    // Re-render the points editor rows
    const container = document.getElementById('rulesPointsContainer');
    if (!container) return;
    container.innerHTML = '';
    points.forEach((pt, i) => addRulesPointRow(pt, i));
}

/** Add one point-row in the admin editor */
function addRulesPoint() {
    const container = document.getElementById('rulesPointsContainer');
    if (!container) return;
    addRulesPointRow('', container.children.length);
}

function addRulesPointRow(text, index) {
    const container = document.getElementById('rulesPointsContainer');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'rules-point-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.innerHTML = `
        <span style="font-size:0.75rem;color:rgba(255,255,255,0.35);min-width:20px;text-align:right;font-weight:700;">${index + 1}.</span>
        <input type="text" value="${escapeHtml(text)}"
               placeholder="Contoh: Dilarang melakukan tindak korupsi..."
               style="flex:1;padding:9px 12px;font-size:0.85rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:9px;color:white;outline:none;"
               oninput="renumberRulesPoints()">
        <button type="button" onclick="removeRulesPointRow(this)"
                style="width:30px;height:30px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#f87171;font-size:0.75rem;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
            <i class="fa-solid fa-trash"></i>
        </button>`;
    container.appendChild(row);
}

function removeRulesPointRow(btn) {
    const row = btn.closest('.rules-point-row');
    if (row) { row.remove(); renumberRulesPoints(); }
}

function renumberRulesPoints() {
    const container = document.getElementById('rulesPointsContainer');
    if (!container) return;
    Array.from(container.children).forEach((row, i) => {
        const num = row.querySelector('span');
        if (num) num.textContent = `${i + 1}.`;
    });
}

/** Escape HTML for safe rendering */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Toggle handler — ON/OFF */
async function handleRulesCardToggle(enabled) {
    const toggle = document.getElementById('toggleRulesCardEnabled');
    if (toggle) toggle.disabled = true;
    if (!state.settings) state.settings = {};
    if (!state.settings.rules_card) state.settings.rules_card = { ...RULES_CARD_DEFAULTS };
    state.settings.rules_card.enabled = enabled;

    applyRulesCardSettings();
    localStorage.setItem('rules_card_enabled', JSON.stringify(enabled));

    try {
        const { error } = await supabaseClient
            .from('settings')
            .update({ value: state.settings })
            .eq('key', 'general');
        if (error) throw error;
        showToast(`Kartu Pengingat ${enabled ? 'ditampilkan ✓' : 'disembunyikan ✓'}.`, enabled ? 'success' : 'info');
    } catch (err) {
        console.error('[Admin] Gagal simpan rules_card.enabled:', err);
        showToast('Tersimpan lokal, gagal sinkron DB: ' + err.message, 'warning');
    } finally {
        if (toggle) toggle.disabled = false;
    }
}

/** Save button — persist title + points text */
async function saveRulesCardSettings() {
    const spinner = document.getElementById('rulesCardSaveSpinner');
    const titleInput = document.getElementById('inputRulesCardTitle');
    const container  = document.getElementById('rulesPointsContainer');
    if (!titleInput || !container) return;

    const title  = titleInput.value.trim() || RULES_CARD_DEFAULTS.title;
    const points = Array.from(container.querySelectorAll('input[type="text"]'))
        .map(inp => inp.value.trim())
        .filter(v => v.length > 0);

    if (points.length === 0) {
        showToast('Tambahkan minimal 1 poin larangan.', 'warning'); return;
    }

    if (spinner) spinner.classList.remove('hide');
    if (!state.settings) state.settings = {};
    if (!state.settings.rules_card) state.settings.rules_card = { ...RULES_CARD_DEFAULTS };
    state.settings.rules_card.title  = title;
    state.settings.rules_card.points = points;

    applyRulesCardSettings();

    try {
        const { error } = await supabaseClient
            .from('settings')
            .update({ value: state.settings })
            .eq('key', 'general');
        if (error) throw error;
        showToast('Kartu Pengingat berhasil disimpan ✓', 'success');
    } catch (err) {
        console.error('[Admin] Gagal simpan rules_card:', err);
        showToast('Tersimpan lokal, gagal sinkron DB: ' + err.message, 'warning');
    } finally {
        if (spinner) spinner.classList.add('hide');
    }
}

// Expose globally
window.handleRulesCardToggle = handleRulesCardToggle;
window.saveRulesCardSettings = saveRulesCardSettings;
window.addRulesPoint         = addRulesPoint;
window.removeRulesPointRow   = removeRulesPointRow;
window.renumberRulesPoints   = renumberRulesPoints;

// ----------------------------------------------------------------
// 16. KUSTOMISASI BACKGROUND STYLING
function applyBackground(bgValue) {
    const overlay = document.getElementById("bgOverlay");
    if (!overlay || !bgValue) return;

    const normalizedBg = String(bgValue).trim();
    const isRawUrlOnly = /^url\((['"]?).*?\1\)$/i.test(normalizedBg);
    const isImageUrl = isRawUrlOnly || normalizedBg.startsWith('data:image');

    // Kalau ada tema aktif DAN bukan wallpaper gambar — jangan timpa tema
    const hasActiveTheme = ALL_THEME_CLASSES.some(cls => document.body.classList.contains(cls));
    if (hasActiveTheme && !isImageUrl) {
        // Cukup simpan sebagai fallback, tapi jangan terapkan ke overlay
        return;
    }

    if (!isImageUrl) {
        overlay.style.backgroundImage = "none";
        overlay.style.background = normalizedBg;
    } else {
        // Wallpaper gambar kustom — tetap terapkan, tema hanya ubah warna UI
        overlay.style.background = "none";
        overlay.style.backgroundImage = normalizedBg;
        overlay.style.backgroundSize = "cover";
        overlay.style.backgroundPosition = "center";
        overlay.style.backgroundRepeat = "no-repeat";
    }
}

// Sinkronisasi tombol pilihan background di UI
function syncBackgroundSelectorUI() {
    const bgSetting = state.settings.background;
    const bgPreviews = document.querySelectorAll(".bg-preview-item");
    bgPreviews.forEach(p => {
        if (p.getAttribute("data-bg") === bgSetting) {
            p.classList.add("active");
        } else {
            p.classList.remove("active");
        }
    });
}

async function saveBackgroundSetting(bgValue) {
    // 1. Terapkan langsung ke local state & UI secara instan (Optimistic UI)
    if (!state.settings) {
        state.settings = {};
    }
    state.settings.background = bgValue;
    applyBackground(bgValue);
    syncBackgroundSelectorUI();
    
    // 2. Simpan cadangan ke localStorage
    localStorage.setItem("restease_local_bg", bgValue);
    showToast("Background berhasil diterapkan.", "success");
    
    if (!supabaseClient) return;
    
    const newSettingsVal = {
        ...state.settings,
        background: bgValue
    };
    
    try {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({ key: 'general', value: newSettingsVal });
            
        if (error) throw error;
    } catch (err) {
        console.error("Gagal menyimpan background ke Supabase:", err);
    }
}

// Upload File Gambar Lokal & Convert ke Base64 (Maks 3MB)
function handleBackgroundFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 3 * 1024 * 1024) {
        showToast("Ukuran gambar maksimal adalah 3MB.", "error");
        e.target.value = "";
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        const base64Image = `url('${evt.target.result}')`;
        saveBackgroundSetting(base64Image);
        showToast("Background kustom berhasil diunggah dan diterapkan.", "success");
    };
    reader.onerror = function() {
        showToast("Gagal membaca berkas gambar.", "error");
    };
    reader.readAsDataURL(file);
}

// 17. ALAT SIMULASI & MAINTENANCE DATABASE
// Simulasi Ganti Hari: Menggeser seluruh waktu start_time di break_logs ke hari kemarin (24 jam lalu)
async function handleSimulateDayChange() {
    if (!supabaseClient) return;
    if (!await showCustomConfirm("Apakah Anda ingin melakukan simulasi ganti hari? Tindakan ini akan menggeser log hari ini menjadi kemarin sehingga jatah harian staff ter-reset penuh.", "Simulasi Ganti Hari", false)) return;
    
    try {
        // Muat log hari ini
        const todayLogs = state.logs.filter(l => isLogToday(l.start_time));
        
        if (todayLogs.length === 0) {
            showToast("Tidak ada log hari ini untuk di-reset.", "info");
            return;
        }
        
        // Loop dan update masing-masing log
        for (const log of todayLogs) {
            const currentStart = new Date(log.start_time);
            const currentEnd = new Date(log.end_time);
            
            // Kurangi 24 jam
            currentStart.setDate(currentStart.getDate() - 1);
            currentEnd.setDate(currentEnd.getDate() - 1);
            
            await supabaseClient
                .from('break_logs')
                .update({
                    start_time: currentStart.toISOString(),
                    end_time: currentEnd.toISOString()
                })
                .eq('id', log.id);
        }
        
        showToast("Simulasi ganti hari sukses. Seluruh jatah/kuota staff hari ini telah ter-reset!", "success");
        await loadAllData(); // reload
    } catch (err) {
        console.error("Simulasi ganti hari gagal:", err);
        showToast("Gagal memproses simulasi ganti hari.", "error");
    }
}

// Membuat data dummy untuk mempermudah testing instan
async function handleGenerateDummyData() {
    if (!supabaseClient) return;
    if (!await showCustomConfirm("Ingin membuat data staff & jabatan uji coba?", "Generate Dummy Data", false)) return;
    
    const dummyRoles = [
        { role: "CS", max_slots: 1 },
        { role: "ADMIN", max_slots: 2 },
        { role: "SUPERVISOR", max_slots: 1 },
        { role: "MARKETING", max_slots: 3 }
    ];
    
    const dummyStaff = [
        { name: "Andi Wijaya", role: "CS" },
        { name: "Siti Rahma", role: "CS" },
        { name: "Rian Hidayat", role: "ADMIN" },
        { name: "Fanya Aurelia", role: "ADMIN" },
        { name: "Bambang Pamungkas", role: "SUPERVISOR" },
        { name: "Clara Shinta", role: "MARKETING" }
    ];
    
    try {
        // Insert Jabatan
        for (const r of dummyRoles) {
            await supabaseClient.from('roles_config').upsert(r);
        }
        
        // Insert Staff
        for (const s of dummyStaff) {
            // Periksa jika sudah ada biar tidak error duplicate unique constraint
            const exist = state.staff.some(cur => cur.name.toLowerCase() === s.name.toLowerCase());
            if (!exist) {
                await supabaseClient.from('staff').insert(s);
            }
        }
        
        showToast("Data dummy berhasil di-generate!", "success");
        await loadAllData();
    } catch (err) {
        console.error("Gagal generate data dummy:", err);
        showToast("Gagal menyimpan beberapa data dummy.", "error");
    }
}

// Validasi Password Admin untuk hapus/delete
async function validateAdminPassword() {
    const input = await showCustomPrompt("Masukkan password admin untuk melanjutkan tindakan hapus/delete:", "Otorisasi Hapus Data");
    if (input === null) return false; // Dibatalkan oleh user
    if (input === "wdbos88") {
        return true;
    } else {
        showToast("Password salah! Tindakan dibatalkan.", "error");
        return false;
    }
}

// Menghapus satu log riwayat istirahat
async function deleteReportLog(logId) {
    if (!supabaseClient) {
        showToast("Koneksi database tidak tersedia.", "error");
        return;
    }
    try {
        const { error } = await supabaseClient
            .from('break_logs')
            .delete()
            .eq('id', logId);
            
        if (error) throw error;
        
        // Hapus dari state lokal
        state.logs = state.logs.filter(l => l.id !== logId);
        
        // Hapus langsung dari DOM secara instan (0ms)
        const rowEl = document.querySelector(`tr[data-id="${logId}"]`);
        if (rowEl) {
            rowEl.remove();
        }
        
        showToast("Log riwayat istirahat berhasil dihapus.", "success");
        
        // Render ulang UI
        renderReports();
        updateStatsSummary();
        if (state.currentStaff) {
            updateStaffConsoleUI();
        }
    } catch (err) {
        console.error("Gagal menghapus log riwayat:", err);
        showToast("Gagal menghapus log dari database.", "error");
    }
}

window.handleDeleteReportLogClick = async function(logId, staffName) {
    if (!await validateAdminPassword()) return;
    if (await showCustomConfirm(`Apakah Anda yakin ingin menghapus log istirahat ${staffName}? Jatah izin staff ini hari ini akan dikembalikan.`, "Hapus Log Istirahat")) {
        await deleteReportLog(logId);
    }
};

// Menghapus semua riwayat logs
async function handleClearLogs() {
    if (!supabaseClient) return;
    if (!await validateAdminPassword()) return;
    if (!await showCustomConfirm("PERINGATAN: Tindakan ini akan menghapus SELURUH LOG RIWAYAT ISTIRAHAT secara permanen dari database. Lanjutkan?", "Hapus Semua Log", true)) return;
    
    try {
        const { error } = await supabaseClient
            .from('break_logs')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
            
        if (error) throw error;
        state.logs = [];
        showToast("Seluruh riwayat log berhasil dihapus.", "success");
        renderReports();
        updateStatsSummary();
        if (state.currentStaff) {
            updateStaffConsoleUI();
        }
    } catch (err) {
        console.error("Gagal menghapus log:", err);
        showToast("Gagal mengosongkan log database.", "error");
    }
}

// Reset Pengaturan ke Default Pabrik
async function handleResetConfig() {
    if (!supabaseClient) return;
    if (!await showCustomConfirm("Apakah Anda ingin merestore semua konfigurasi umum ke pengaturan awal (durasi 00:20:00, kuota 4x, passcode wdbos88)?", "Reset Setelan", true)) return;
    
    const defaultSettingsVal = {
        default_duration: "00:20:00",
        daily_quota: 4,
        admin_passcode: "wdbos88",
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)"
    };
    
    try {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({ key: 'general', value: defaultSettingsVal });
            
        if (error) throw error;
        showToast("Setelan konfigurasi di-reset ke default.", "success");
    } catch (err) {
        console.error("Gagal me-reset setelan:", err);
        showToast("Gagal me-reset konfigurasi.", "error");
    }
}

// ─────────────────────────────────────────────────────────────
// HAPUS DATA PER BULAN — Admin Panel Tab "Hapus Data"
// ─────────────────────────────────────────────────────────────

// Helper: set status label di bawah tombol
function _setDeleteStatus(elId, msg, isError = false) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.style.display = 'block';
    el.style.color   = isError ? '#f87171' : '#34d399';
    el.textContent   = msg;
}

// Helper: validasi input bulan dan kembalikan string YYYY-MM atau null
function _getMonthInput(inputId, labelEl) {
    const val = (document.getElementById(inputId)?.value || '').trim();
    if (!val || !/^\d{4}-\d{2}$/.test(val)) {
        showToast('Pilih bulan yang valid terlebih dahulu.', 'warning');
        return null;
    }
    return val;   // format: "2026-06"
}

// 1. Hapus Log Riwayat Kedatangan (absensi_logs)
window.adminDeleteAbsensiByMonth = async function() {
    if (!supabaseClient) return;
    const monthStr = _getMonthInput('deleteAbsensiMonth');
    if (!monthStr) return;

    const [year, month] = monthStr.split('-');
    const label = `${new Date(monthStr + '-01').toLocaleDateString('id-ID', { month:'long', year:'numeric' })}`;

    if (!await showCustomConfirm(
        `Hapus SEMUA log kedatangan (absensi_logs) bulan ${label}? Data di Supabase akan terhapus permanen.`,
        'Hapus Log Kedatangan', true
    )) return;

    _setDeleteStatus('deleteAbsensiStatus', '⏳ Menghapus...');
    try {
        // absensi_logs punya kolom month_str format 'YYYY-MM'
        const { error, count } = await supabaseClient
            .from('absensi_logs')
            .delete({ count: 'exact' })
            .eq('month_str', monthStr);

        if (error) throw error;

        // Juga hapus jadwal shift bulan tersebut (opsional — bersamaan)
        const { error: shiftErr } = await supabaseClient
            .from('absensi_shifts')
            .delete()
            .eq('month_str', monthStr);
        if (shiftErr) console.warn('Gagal hapus absensi_shifts:', shiftErr);

        // Update local state jika bulan yang dihapus = bulan aktif
        if (state.absensiSelectedMonth === monthStr) {
            state.absensiLogs   = [];
            state.absensiShifts = [];
            renderAbsensi();
        }

        const deleted = count ?? '?';
        _setDeleteStatus('deleteAbsensiStatus', `✅ ${deleted} data log kedatangan bulan ${label} berhasil dihapus.`);
        showToast(`Log kedatangan ${label} berhasil dihapus.`, 'success');
    } catch (err) {
        console.error('Gagal hapus absensi_logs:', err);
        _setDeleteStatus('deleteAbsensiStatus', `❌ Gagal: ${err.message}`, true);
        showToast('Gagal menghapus log kedatangan.', 'error');
    }
};

// 2. Hapus Laporan Riwayat Istirahat (break_logs)
window.adminDeleteBreakLogsByMonth = async function() {
    if (!supabaseClient) return;
    const monthStr = _getMonthInput('deleteBreakLogsMonth');
    if (!monthStr) return;

    const label = new Date(monthStr + '-01').toLocaleDateString('id-ID', { month:'long', year:'numeric' });

    if (!await showCustomConfirm(
        `Hapus SEMUA laporan riwayat istirahat (break_logs) bulan ${label}? Data di Supabase akan terhapus permanen.`,
        'Hapus Log Istirahat', true
    )) return;

    _setDeleteStatus('deleteBreakLogsStatus', '⏳ Menghapus...');
    try {
        // break_logs punya kolom start_time (TIMESTAMPTZ) — filter range bulan
        const startDate = `${monthStr}-01T00:00:00.000Z`;
        const [year, month] = monthStr.split('-').map(Number);
        const nextMonth = month === 12
            ? `${year + 1}-01-01T00:00:00.000Z`
            : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`;

        const { error, count } = await supabaseClient
            .from('break_logs')
            .delete({ count: 'exact' })
            .gte('start_time', startDate)
            .lt('start_time',  nextMonth);

        if (error) throw error;

        // Update local state — buang log yang masuk dalam range tersebut
        state.logs = state.logs.filter(l => {
            if (!l.start_time) return true;
            const t = new Date(l.start_time).getTime();
            return t < new Date(startDate).getTime() || t >= new Date(nextMonth).getTime();
        });

        renderReports();
        updateStatsSummary();

        const deleted = count ?? '?';
        _setDeleteStatus('deleteBreakLogsStatus', `✅ ${deleted} data riwayat istirahat bulan ${label} berhasil dihapus.`);
        showToast(`Log istirahat ${label} berhasil dihapus.`, 'success');
    } catch (err) {
        console.error('Gagal hapus break_logs:', err);
        _setDeleteStatus('deleteBreakLogsStatus', `❌ Gagal: ${err.message}`, true);
        showToast('Gagal menghapus laporan istirahat.', 'error');
    }
};

// 3. Hapus History Chat (chat_messages)
window.adminDeleteChatByMonth = async function() {
    if (!supabaseClient) return;
    const monthStr = _getMonthInput('deleteChatMonth');
    if (!monthStr) return;

    const label = new Date(monthStr + '-01').toLocaleDateString('id-ID', { month:'long', year:'numeric' });

    if (!await showCustomConfirm(
        `Hapus SEMUA pesan chat (chat_messages) bulan ${label}? Seluruh pesan grup & DM bulan tersebut akan terhapus dari Supabase secara permanen.`,
        'Hapus History Chat', true
    )) return;

    _setDeleteStatus('deleteChatStatus', '⏳ Menghapus...');
    try {
        const startDate = `${monthStr}-01T00:00:00.000Z`;
        const [year, month] = monthStr.split('-').map(Number);
        const nextMonth = month === 12
            ? `${year + 1}-01-01T00:00:00.000Z`
            : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`;

        const { error, count } = await supabaseClient
            .from('chat_messages')
            .delete({ count: 'exact' })
            .gte('created_at', startDate)
            .lt('created_at',  nextMonth);

        if (error) throw error;

        const deleted = count ?? '?';
        _setDeleteStatus('deleteChatStatus', `✅ ${deleted} pesan bulan ${label} berhasil dihapus.`);
        showToast(`History chat ${label} berhasil dihapus.`, 'success');
    } catch (err) {
        console.error('Gagal hapus chat_messages:', err);
        _setDeleteStatus('deleteChatStatus', `❌ Gagal: ${err.message}`, true);
        showToast('Gagal menghapus history chat.', 'error');
    }
};

// 18. NOTIFIKASI TOAST & SOUND EFFECTS
let lastToastCache = { message: "", type: "", time: 0 };

function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    // Deduplicate identical toast messages shown within 1500ms
    const now = Date.now();
    if (lastToastCache.message === message && lastToastCache.type === type && (now - lastToastCache.time < 1500)) {
        return;
    }
    lastToastCache = { message, type, time: now };

    const DURATION = 4500;

    const typeMap = {
        success: { icon: "fa-circle-check",        title: "Berhasil"    },
        warning: { icon: "fa-triangle-exclamation", title: "Perhatian"   },
        error:   { icon: "fa-circle-xmark",         title: "Gagal"       },
        info:    { icon: "fa-circle-info",           title: "Informasi"   },
    };
    const t = typeMap[type] || typeMap.info;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-body">
            <div class="toast-icon-wrap"><i class="fa-solid ${t.icon}"></i></div>
            <div class="toast-text-wrap">
                <span class="toast-title">${t.title}</span>
                <span class="toast-message">${message}</span>
            </div>
            <button class="toast-close" onclick="this.closest('.toast').remove()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="toast-progress" style="animation-duration: ${DURATION}ms;"></div>
    `;

    // Click anywhere to dismiss
    toast.addEventListener("click", (e) => {
        if (!e.target.closest(".toast-close")) closeToast(toast);
    });

    container.appendChild(toast);

    const timer = setTimeout(() => closeToast(toast), DURATION);
    toast._timer = timer;
}
window.showToast = showToast;

function closeToast(toast) {
    if (!toast || toast._closing) return;
    toast._closing = true;
    clearTimeout(toast._timer);
    toast.classList.add("toast-closing");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
}

// Custom confirm dialog replacing native confirm()
function showConfirm({ title = "Konfirmasi", message = "Apakah Anda yakin?", type = "danger", okText = "Ya, Lanjutkan", cancelText = "Batal", onOk = () => {} }) {
    // Remove existing
    const existing = document.getElementById("customConfirmModal");
    if (existing) existing.remove();

    const iconMap = { danger: "fa-trash-can", warning: "fa-triangle-exclamation", info: "fa-circle-info" };
    const icon = iconMap[type] || "fa-circle-info";

    const modal = document.createElement("div");
    modal.id = "customConfirmModal";
    modal.innerHTML = `
        <div class="confirm-card">
            <div class="confirm-icon ${type}"><i class="fa-solid ${icon}"></i></div>
            <div class="confirm-title">${title}</div>
            <div class="confirm-message">${message}</div>
            <div class="confirm-actions">
                <button class="confirm-btn btn-cancel" id="confirmCancelBtn">${cancelText}</button>
                <button class="confirm-btn btn-ok-${type}" id="confirmOkBtn">${okText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const cleanup = () => {
        modal.style.animation = "none";
        modal.style.opacity = "0";
        modal.style.transition = "opacity 0.15s ease";
        setTimeout(() => modal.remove(), 150);
    };

    document.getElementById("confirmOkBtn").addEventListener("click", () => {
        cleanup();
        onOk();
    });
    document.getElementById("confirmCancelBtn").addEventListener("click", cleanup);
    modal.addEventListener("click", (e) => { if (e.target === modal) cleanup(); });
}


// Memutar Sound Effect secara aman
function playSound(soundType) {
    try {
        let snd = null;
        if (soundType === "success") {
            snd = document.getElementById("sndSuccess");
        } else if (soundType === "alert") {
            snd = document.getElementById("sndAlert");
        }
        
        if (snd) {
            snd.currentTime = 0;
            // Catch error jika auto-play diblokir browser
            snd.play().catch(e => console.warn("Autoplay sound diblokir browser:", e));
        }
    } catch (err) {
        console.warn("Gagal memutar audio feedback:", err);
    }
}

// ==========================================================================
// 15. MODUL ABSENSI STAFF WDBOS
// ==========================================================================

// Memuat data absensi dari Supabase (dengan fallback ke LocalStorage)
async function fetchAbsensiData() {
    if (!supabaseClient) {
        loadAbsensiLocal();
        return;
    }
    
    try {
        if (state.absensiUseLocalFallback) {
            loadAbsensiLocal();
            return;
        }
        
        // Ambil data Shift untuk bulan terpilih
        const { data: shifts, error: errS } = await supabaseClient
            .from('absensi_shifts')
            .select('*')
            .eq('month_str', state.absensiSelectedMonth);
            
        if (errS) {
            if (errS.code === '42P01') { // Tabel tidak ditemukan
                console.warn("Tabel 'absensi_shifts' tidak ditemukan di Supabase. Beralih ke LocalStorage.");
                state.absensiUseLocalFallback = true;
                loadAbsensiLocal();
                return;
            }
            throw errS;
        }
        
        // Ambil data Log Absensi untuk bulan terpilih
        const { data: logs, error: errL } = await supabaseClient
            .from('absensi_logs')
            .select('*')
            .eq('month_str', state.absensiSelectedMonth);
            
        if (errL) throw errL;
        
        state.absensiShifts = shifts || [];
        state.absensiLogs = logs || [];
        
        // Auto-sync any unsynced offline logs
        setTimeout(syncLocalLogsToSupabase, 500);
        
    } catch (err) {
        console.error("Gagal memuat data absensi dari Supabase, beralih ke LocalStorage:", err);
        state.absensiUseLocalFallback = true;
        loadAbsensiLocal();
    }
}

// Memuat data absensi secara lokal
function loadAbsensiLocal() {
    const cachedShifts = localStorage.getItem("restease_absensi_shifts");
    const cachedLogs = localStorage.getItem("restease_absensi_logs");
    
    let allShifts = cachedShifts ? JSON.parse(cachedShifts) : [];
    let allLogs = cachedLogs ? JSON.parse(cachedLogs) : [];
    
    // Filter hanya untuk bulan terpilih
    state.absensiShifts = allShifts.filter(s => s.month_str === state.absensiSelectedMonth);
    state.absensiLogs = allLogs.filter(l => l.month_str === state.absensiSelectedMonth);
}

// Menyimpan jadwal shift staff (Supabase / LocalStorage)
async function saveAbsensiShift(staffId, staffName, role, schedule) {
    const monthStr = state.absensiSelectedMonth;
    
    if (state.absensiUseLocalFallback || !supabaseClient) {
        let allShifts = [];
        const raw = localStorage.getItem("restease_absensi_shifts");
        if (raw) allShifts = JSON.parse(raw);
        
        // Cari dan hapus jadwal lama
        allShifts = allShifts.filter(s => !(s.staff_id === staffId && s.month_str === monthStr));
        
        allShifts.push({
            id: `local-shift-${staffId}-${monthStr}`,
            staff_id: staffId,
            staff_name: staffName,
            role: role,
            month_str: monthStr,
            schedule: schedule
        });
        
        localStorage.setItem("restease_absensi_shifts", JSON.stringify(allShifts));
        loadAbsensiLocal();
        renderAbsensi();
        return;
    }
    
    try {
        // Hapus jadwal staff pada bulan ini (jika ada) sebelum insert baru
        const { error: delErr } = await supabaseClient
            .from('absensi_shifts')
            .delete()
            .eq('staff_id', staffId)
            .eq('month_str', monthStr);
            
        if (delErr) throw delErr;
        
        const { error: insErr } = await supabaseClient
            .from('absensi_shifts')
            .insert({
                staff_id: staffId,
                staff_name: staffName,
                role: role,
                month_str: monthStr,
                schedule: schedule
            });
            
        if (insErr) throw insErr;
    } catch (err) {
        console.error("Gagal menyimpan shift ke Supabase, mengalihkan ke lokal:", err);
        showToast("Database error. Menyimpan jadwal secara lokal...", "warning");
        state.absensiUseLocalFallback = true;
        await saveAbsensiShift(staffId, staffName, role, schedule);
    }
}

// Menyimpan log kehadiran staff (Optimistic UI — Instant Response 0ms)
async function saveAbsensiLog(staffId, staffName, role, dayNum, shift, clockInTime, status) {
    const monthStr = state.absensiSelectedMonth;
    const numericDay = parseInt(dayNum);
    const tempId = `temp-log-${staffId}-${numericDay}-${monthStr}-${Date.now()}`;
    
    const newLog = {
        id: tempId,
        staff_id: staffId,
        staff_name: staffName,
        role: role,
        day_num: numericDay,
        month_str: monthStr,
        shift: shift,
        clock_in_time: clockInTime,
        status: status,
        timestamp: new Date().toISOString()
    };

    // 1. UPDATE LOCAL STATE & RENDER UI INSTANTLY (0ms Response Time)
    if (!Array.isArray(state.absensiLogs)) state.absensiLogs = [];
    state.absensiLogs = state.absensiLogs.filter(l => !(l.staff_id === staffId && parseInt(l.day_num) === numericDay && l.month_str === monthStr));
    state.absensiLogs.push(newLog);

    // Save copy to local storage cache
    try {
        let allLogs = [];
        const raw = localStorage.getItem("restease_absensi_logs");
        if (raw) allLogs = JSON.parse(raw);
        allLogs = allLogs.filter(l => !(l.staff_id === staffId && parseInt(l.day_num) === numericDay && l.month_str === monthStr));
        allLogs.push(newLog);
        localStorage.setItem("restease_absensi_logs", JSON.stringify(allLogs));
    } catch (e) {}

    // Instant UI Re-render!
    renderAbsensi();
    showToast(`Absen MASUK ${staffName} berhasil dicatat!`, "success");

    if (state.absensiUseLocalFallback || !supabaseClient) return;

    // 2. BACKGROUND ASYNC PUSH TO SUPABASE
    try {
        await supabaseClient
            .from('absensi_logs')
            .delete()
            .eq('staff_id', staffId)
            .eq('day_num', numericDay)
            .eq('month_str', monthStr);
            
        const { data: insData, error: insErr } = await supabaseClient
            .from('absensi_logs')
            .insert({
                staff_id: staffId,
                staff_name: staffName,
                role: role,
                day_num: numericDay,
                month_str: monthStr,
                shift: shift,
                clock_in_time: clockInTime,
                status: status
            })
            .select()
            .single();
            
        if (insErr) throw insErr;
        
        if (insData) {
            const idx = state.absensiLogs.findIndex(l => l.id === tempId);
            if (idx !== -1) state.absensiLogs[idx] = insData;
        }
    } catch (err) {
        console.error("Gagal sync log absensi ke Supabase:", err);
    }
}

// Menghapus log kehadiran staff (Optimistic UI — Instant Response 0ms)
async function deleteAbsensiLog(staffId, dayNum) {
    const monthStr = state.absensiSelectedMonth;
    const numericDay = parseInt(dayNum);

    // 1. UPDATE LOCAL STATE & RENDER UI INSTANTLY (0ms Response Time)
    if (Array.isArray(state.absensiLogs)) {
        state.absensiLogs = state.absensiLogs.filter(l => !(l.staff_id === staffId && parseInt(l.day_num) === numericDay && l.month_str === monthStr));
    }

    try {
        let allLogs = [];
        const raw = localStorage.getItem("restease_absensi_logs");
        if (raw) allLogs = JSON.parse(raw);
        allLogs = allLogs.filter(l => !(l.staff_id === staffId && parseInt(l.day_num) === numericDay && l.month_str === monthStr));
        localStorage.setItem("restease_absensi_logs", JSON.stringify(allLogs));
    } catch (e) {}

    // Instant UI Re-render!
    renderAbsensi();
    showToast("Log kehadiran berhasil dibatalkan.", "success");

    if (state.absensiUseLocalFallback || !supabaseClient) return;

    // 2. BACKGROUND ASYNC DELETE IN SUPABASE
    try {
        await supabaseClient
            .from('absensi_logs')
            .delete()
            .eq('staff_id', staffId)
            .eq('day_num', numericDay)
            .eq('month_str', monthStr);
    } catch (err) {
        console.error("Gagal membatalkan log absensi di Supabase:", err);
        showToast("Gagal menghapus log kehadiran.", "error");
    }
}

// Mengendalikan Rendering Utama view Absensi
function renderAbsensi() {
    const activeTabBtn = document.querySelector("#absensiView .btn-tab.active");
    if (!activeTabBtn) return;
    
    // Hide all sub-containers in absensi view
    document.querySelectorAll("#absensiView .absensi-tab-content").forEach(c => c.classList.add("hide"));
    
    if (activeTabBtn.id === "btnAbsensiDaily") {
        document.getElementById("absensiDailyContainer").classList.remove("hide");
        renderAbsensiDaily();
    } else if (activeTabBtn.id === "btnAbsensiSpreadsheet") {
        document.getElementById("absensiSpreadsheetContainer").classList.remove("hide");
        renderAbsensiSpreadsheet();
    } else if (activeTabBtn.id === "btnAbsensiLogs") {
        document.getElementById("absensiLogsContainer").classList.remove("hide");
        renderAbsensiLogs();
    } else if (activeTabBtn.id === "btnAbsensiShiftSettings") {
        document.getElementById("absensiShiftSettingsContainer").classList.remove("hide");
        renderShiftSettingsTable();
    }
}

// Render Tab 1: Dashboard Harian
function renderAbsensiDaily() {
    const morningBody = document.getElementById("morningAttendanceBody");
    const nightBody = document.getElementById("nightAttendanceBody");
    const absensiDailyDateDisplay = document.getElementById("absensiDailyDateDisplay");
    const absensiDailyDatePicker = document.getElementById("absensiDailyDatePicker");
    
    if (absensiDailyDateDisplay) {
        const [yy, mm] = state.absensiSelectedMonth.split('-');
        const dateObj = new Date(yy, parseInt(mm) - 1, state.absensiSelectedDay);
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        absensiDailyDateDisplay.textContent = dateObj.toLocaleDateString('id-ID', options).toUpperCase();
        if (absensiDailyDatePicker) {
            absensiDailyDatePicker.value = `${yy}-${mm}-${String(state.absensiSelectedDay).padStart(2, '0')}`;
        }
    }
    
    if (!morningBody || !nightBody) return;
    
    morningBody.innerHTML = "";
    nightBody.innerHTML = "";
    
    const dayNum = state.absensiSelectedDay;
    const shiftByStaffId = new Map();
    state.absensiShifts.forEach(shift => {
        if (!shiftByStaffId.has(shift.staff_id)) {
            shiftByStaffId.set(shift.staff_id, shift);
        }
    });
    
    const logTodayByStaffId = new Map();
    state.absensiLogs.forEach(log => {
        if (log.day_num !== dayNum) return;
        if (!logTodayByStaffId.has(log.staff_id)) {
            logTodayByStaffId.set(log.staff_id, log);
        }
    });
    
    // Filter staff yang memiliki jadwal shift hari ini
    const morningScheduled = [];
    const nightScheduled = [];
    
    state.staff.forEach(s => {
        // Cari shift bulanan staff
        const shiftConfig = shiftByStaffId.get(s.id);
        const shiftToday = shiftConfig ? shiftConfig.schedule[dayNum - 1] : "OFF";
        
        if (shiftToday === "1") {
            morningScheduled.push({ staff: s, shiftVal: "1" });
        } else if (shiftToday === "2") {
            nightScheduled.push({ staff: s, shiftVal: "2" });
        }
    });
    
    // Hitung jumlah kehadiran
    let morningPresent = 0;
    let nightPresent = 0;
    
    const categories = ["CS LINE", "CS LC", "KAPTEN KASIR", "KASIR"];
    
    const renderList = (list, tbody, shiftCode) => {
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color:var(--text-muted); font-size:0.75rem; padding:20px;">Tidak ada staff terjadwal untuk shift ini.</td></tr>';
            return;
        }
        
        const frag = document.createDocumentFragment();
        
        categories.forEach(cat => {
            // Filter staff yang termasuk kategori ini
            let matches = list.filter(item => {
                const r = item.staff.role.toUpperCase();
                if (cat === "CS LC") {
                    return r === "CS LC" || r === "CS";
                }
                return r === cat;
            });
            
            // Render Divider Row
            const trDivider = document.createElement("tr");
            trDivider.className = "category-divider-row";
            trDivider.innerHTML = `
                <td colspan="4" style="text-align: center; font-size: 0.72rem; font-weight: 800; letter-spacing: 1.5px; color: var(--accent); padding: 6px 10px; text-transform: uppercase;">
                    ⚡ ${cat} ⚡
                </td>
            `;
            frag.appendChild(trDivider);
            
            if (matches.length === 0) {
                const trEmpty = document.createElement("tr");
                trEmpty.innerHTML = `
                    <td colspan="4" style="text-align: center; font-size: 0.72rem; color: var(--text-muted); padding: 8px 10px; font-style: italic; background: rgba(0,0,0,0.15);">
                        Tidak ada staff yang terjadwal
                    </td>
                `;
                frag.appendChild(trEmpty);
            } else {
                matches.forEach(item => {
                    const tr = document.createElement("tr");
                    const s = item.staff;
                    const logToday = logTodayByStaffId.get(s.id);
                    
                    const shiftHours = (state.settings && state.settings.shift_hours) || defaultShiftHours;
                    const config = shiftHours[shiftCode];
                    const jamKerja = config ? `${config.start} - ${config.end}` : (shiftCode === "1" ? "07:45:00 - 19:45:00" : "19:45:00 - 07:45:00");
                    
                    let actionHTML = "";
                    let statusHTML = "";
                    
                    if (logToday) {
                        if (shiftCode === "1") morningPresent++; else nightPresent++;
                        
                        statusHTML = logToday.status === "ON TIME" 
                            ? '<span class="status-badge safe">ON TIME</span>' 
                            : '<span class="status-badge late">TERLAMBAT</span>';
                            
                        actionHTML = `
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                                <span style="font-family: monospace; font-size: 0.8rem; font-weight: 700; color: var(--accent); background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${logToday.clock_in_time}</span>
                                <div class="cancel-confirm-group" style="display: flex; gap: 6px; font-size: 0.72rem;">
                                    <button class="btn-cancel-confirm" onclick="confirmCancelAbsensi('${s.id}', '${s.name}', this)" style="background: none; border: none; color: var(--danger); font-weight: 700; cursor: pointer; text-transform: uppercase; padding: 0;">[ Batal ]</button>
                                </div>
                            </div>
                        `;
                    } else {
                        statusHTML = '<span class="status-badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.08);">WAITING</span>';
                        actionHTML = `<button class="btn btn-secondary" onclick="clockInStaffAbsensi('${s.id}', '${s.name}', '${s.role}', '${shiftCode}')" style="padding: 4px 10px !important; font-size: 0.72rem;"><i class="fa-solid fa-right-to-bracket"></i> MASUK</button>`;
                    }
                    
                    tr.innerHTML = `
                        <td><strong>${s.name}</strong><br><span style="font-size: 0.7rem; color: var(--text-muted);">${formatRoleNameUpper(s.role)}</span></td>
                        <td style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${jamKerja}</td>
                        <td style="text-align: center;">${actionHTML}</td>
                        <td style="text-align: center;">${statusHTML}</td>
                    `;
                    frag.appendChild(tr);
                });
            }
        });
        tbody.appendChild(frag);
    };
    
    renderList(morningScheduled, morningBody, "1");
    renderList(nightScheduled, nightBody, "2");
    
    // Update badge text
    document.getElementById("morningPresentCount").textContent = `${morningPresent} / ${morningScheduled.length} Masuk`;
    document.getElementById("nightPresentCount").textContent = `${nightPresent} / ${nightScheduled.length} Masuk`;

    // Render CUTI / OFF / 1/2 panel
    renderDailyStatusPanel();
}

// Render panel status CUTI / OFF / 1/2 untuk hari yang dipilih
function renderDailyStatusPanel() {
    // Guard: hanya render jika absensiView sedang aktif (hemat DOM ops)
    if (!isSectionActive("absensiView")) return;

    const cutiList  = document.getElementById("cutiList");
    const offList   = document.getElementById("offList");
    const halfList  = document.getElementById("halfList");
    const cutiCount = document.getElementById("cutiCount");
    const offCount  = document.getElementById("offCount");
    const halfCount = document.getElementById("halfCount");

    if (!cutiList || !offList || !halfList) return;

    const dayNum   = state.absensiSelectedDay;   // 1-31
    const monthStr = state.absensiSelectedMonth; // "YYYY-MM"

    const cuti = [];
    const off  = [];
    const half = [];
    const shiftByStaffId = new Map();
    
    // Build map of shifts for this month
    state.absensiShifts.forEach(shift => {
        // Match either by month_str OR by month field
        const matchesMonth = shift.month_str === monthStr || shift.month === monthStr;
        if (matchesMonth && !shiftByStaffId.has(shift.staff_id)) {
            shiftByStaffId.set(shift.staff_id, shift);
        }
    });

    state.staff.forEach(s => {
        // Cari jadwal shift staff untuk bulan yang sedang ditampilkan
        const shiftConfig = shiftByStaffId.get(s.id);

        // Jika tidak ada jadwal untuk bulan ini, anggap OFF (default)
        if (!shiftConfig) {
            // Staff tanpa jadwal = OFF
            off.push({ name: s.name, role: s.role });
            return;
        }

        const raw      = shiftConfig.schedule[dayNum - 1];
        const val      = String(raw || "OFF").toUpperCase().trim();
        const entry    = { name: s.name, role: s.role };

        if (val === "CUTI") {
            cuti.push(entry);
        } else if (val === "OFF") {
            off.push(entry);
        } else if (val === "1/2") {
            half.push(entry);
        }
    });

    const renderNames = (listEl, countEl, entries) => {
        countEl.textContent = entries.length;
        listEl.innerHTML = "";
        if (entries.length === 0) {
            listEl.innerHTML = '<span class="daily-status-empty">Tidak ada</span>';
            return;
        }

        // Urutkan berdasarkan urutan role: CS LINE -> CS LC -> KAPTEN KASIR -> KASIR, lalu berdasarkan nama
        entries.sort((a, b) => {
            const orderA = getRoleOrderScore(a.role);
            const orderB = getRoleOrderScore(b.role);
            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name);
        });

        const frag = document.createDocumentFragment();
        entries.forEach(e => {
            const chip = document.createElement("div");
            chip.className = "daily-status-chip";
            chip.innerHTML = `
                <span class="daily-status-name">${e.name}</span>
                <span class="daily-status-role">${formatRoleNameUpper(e.role)}</span>
            `;
            frag.appendChild(chip);
        });
        listEl.appendChild(frag);
    };

    renderNames(cutiList,  cutiCount,  cuti);
    renderNames(offList,   offCount,   off);
    renderNames(halfList,  halfCount,  half);
}

// Logika clock in harian
window.clockInStaffAbsensi = function(staffId, staffName, role, shiftCode) {
    const now = new Date();
    const clockInTime = now.toLocaleTimeString('id-ID'); // Format HH:MM:SS
    const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
    
    const shiftHours = (state.settings && state.settings.shift_hours) || defaultShiftHours;
    const config = shiftHours[shiftCode];
    let status = "ON TIME";
    if (config) {
        status = timeStr <= config.start ? "ON TIME" : "TERLAMBAT";
    } else {
        if (shiftCode === "1") {
            status = timeStr <= "07:45:59" ? "ON TIME" : "TERLAMBAT";
        } else {
            status = timeStr <= "19:45:59" ? "ON TIME" : "TERLAMBAT";
        }
    }
    
    saveAbsensiLog(staffId, staffName, role, state.absensiSelectedDay, shiftCode, clockInTime, status);
};

// Logika batal absen (konfirmasi 2-step inline)
window.confirmCancelAbsensi = async function(staffId, staffName, btnElement) {
    if (btnElement.textContent === "[ Batal ]") {
        btnElement.textContent = "Yakin?";
        btnElement.style.color = "#fff";
        btnElement.style.background = "var(--danger)";
        btnElement.style.padding = "2px 6px";
        btnElement.style.borderRadius = "4px";
        
        // Tambahkan tombol cancel "X"
        const group = btnElement.parentElement;
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "X";
        cancelBtn.style.cssText = "background: none; border: none; color: var(--text-muted); font-weight: bold; cursor: pointer; margin-left: 6px;";
        cancelBtn.onclick = () => {
            btnElement.textContent = "[ Batal ]";
            btnElement.style.color = "var(--danger)";
            btnElement.style.background = "none";
            btnElement.style.padding = "0";
            cancelBtn.remove();
        };
        group.appendChild(cancelBtn);
    } else {
        await deleteAbsensiLog(staffId, state.absensiSelectedDay);
    }
};

// Render Tab 2: Jadwal Shift Bulanan (Spreadsheet)
function renderAbsensiSpreadsheet() {
    const headerRow = document.getElementById("absensiSpreadsheetHeader");
    const bodyContainer = document.getElementById("absensiSpreadsheetBody");
    
    if (!headerRow || !bodyContainer) return;
    
    headerRow.innerHTML = "";
    bodyContainer.innerHTML = "";
    
    const [year, month] = state.absensiSelectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const shiftByStaffId = new Map();
    state.absensiShifts.forEach(shift => {
        if (!shiftByStaffId.has(shift.staff_id)) {
            shiftByStaffId.set(shift.staff_id, shift);
        }
    });
    
    // Render Table Header
    const thName = document.createElement("th");
    thName.textContent = "NAMA STAFF";
    headerRow.appendChild(thName);
    
    const thRole = document.createElement("th");
    thRole.textContent = "JABATAN";
    headerRow.appendChild(thRole);
    
    for (let d = 1; d <= daysInMonth; d++) {
        const th = document.createElement("th");
        th.style.width = "32px";
        th.style.minWidth = "32px";
        th.textContent = d;
        headerRow.appendChild(th);
    }
    
    const thAksi = document.createElement("th");
    thAksi.textContent = "AKSI";
    thAksi.style.width = "50px";
    headerRow.appendChild(thAksi);
    
    // Filter dan Urutkan Staff
    const searchQuery = document.getElementById("absensiShiftSearch").value.trim().toLowerCase();
    const roleFilter = document.getElementById("absensiShiftFilterRole").value;
    const shiftFilter = document.getElementById("absensiShiftFilterVal").value;
    
    let filteredStaff = state.staff;
    
    if (searchQuery) {
        filteredStaff = filteredStaff.filter(s => s.name.toLowerCase().includes(searchQuery));
    }
    
    if (roleFilter) {
        filteredStaff = filteredStaff.filter(s => s.role === roleFilter);
    }
    
    if (shiftFilter) {
        filteredStaff = filteredStaff.filter(s => {
            const shiftConfig = shiftByStaffId.get(s.id);
            if (!shiftConfig) return shiftFilter === "OFF"; // default OFF
            return shiftConfig.schedule.some(sc => sc === shiftFilter);
        });
    }
    
    filteredStaff.sort((a, b) => {
        const orderA = getRoleOrderScore(a.role);
        const orderB = getRoleOrderScore(b.role);
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
    });

    if (filteredStaff.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="${daysInMonth + 3}" class="text-center" style="color:var(--text-muted); padding:30px;">Tidak ada data staff cocok dengan filter.</td>`;
        bodyContainer.appendChild(tr);
        return;
    }
    
    // Render Table Body
    let currentCategory = "";
    filteredStaff.forEach(s => {
        const displayRole = formatRoleNameUpper(s.role);
        if (displayRole !== currentCategory) {
            currentCategory = displayRole;
            const trDivider = document.createElement("tr");
            trDivider.className = "category-divider-row";
            trDivider.innerHTML = `
                <td colspan="${daysInMonth + 3}" style="text-align: center; font-size: 0.75rem; font-weight: 800; letter-spacing: 1.5px; color: var(--accent); padding: 8px 10px; text-transform: uppercase; background: rgba(20, 184, 166, 0.05);">
                    ⚡ ${currentCategory} ⚡
                </td>
            `;
            bodyContainer.appendChild(trDivider);
        }
        
        const tr = document.createElement("tr");
        
        // Col Nama Staff
        const tdName = document.createElement("td");
        tdName.innerHTML = `<strong>${s.name}</strong>`;
        tr.appendChild(tdName);
        
        // Col Jabatan
        const tdRole = document.createElement("td");
        tdRole.innerHTML = `<span class="role-badge" style="margin: 0; font-size: 0.65rem;">${formatRoleNameUpper(s.role)}</span>`;
        tr.appendChild(tdRole);
        
        // Ambil array jadwal shift
        const shiftConfig = shiftByStaffId.get(s.id);
        const schedule = shiftConfig ? shiftConfig.schedule : Array(daysInMonth).fill("OFF");
        
        for (let d = 1; d <= daysInMonth; d++) {
            const td = document.createElement("td");
            td.className = "shift-cell";
            
            const val = schedule[d - 1] || "OFF";
            td.textContent = val;
            
            // Tambahkan pewarnaan shift
            if (val === "1") td.classList.add("shift-pagi");
            else if (val === "2") td.classList.add("shift-malam");
            else if (val === "1/2") td.classList.add("shift-half");
            else if (val === "OFF") td.classList.add("shift-off");
            else if (val === "CUTI") td.classList.add("shift-cuti");
            
            // Listener untuk mengubah shift secara berputar (cycle)
            td.addEventListener("click", async () => {
                const shiftCycle = ["1", "2", "1/2", "OFF", "CUTI"];
                let nextIdx = (shiftCycle.indexOf(val) + 1) % shiftCycle.length;
                const nextVal = shiftCycle[nextIdx];
                
                const updatedSchedule = [...schedule];
                updatedSchedule[d - 1] = nextVal;
                
                await saveAbsensiShift(s.id, s.name, s.role, updatedSchedule);
                
                // Animasi klik cepat
                td.textContent = nextVal;
                td.className = "shift-cell";
                if (nextVal === "1") td.classList.add("shift-pagi");
                else if (nextVal === "2") td.classList.add("shift-malam");
                else if (nextVal === "1/2") td.classList.add("shift-half");
                else if (nextVal === "OFF") td.classList.add("shift-off");
                else if (nextVal === "CUTI") td.classList.add("shift-cuti");
            });
            
            tr.appendChild(td);
        }
        
        // AKSI Hapus Shift Staff
        const tdAksi = document.createElement("td");
        const btnDeleteStaffShift = document.createElement("button");
        btnDeleteStaffShift.className = "btn";
        btnDeleteStaffShift.style = "padding: 4px 8px; font-size: 0.7rem; background: transparent; color: var(--danger); border: 1px solid var(--danger);";
        btnDeleteStaffShift.innerHTML = `<i class="fa-solid fa-trash"></i>`;
        btnDeleteStaffShift.title = `Hapus shift ${s.name} bulan ini`;
        
        btnDeleteStaffShift.addEventListener("click", async () => {
            const month = state.absensiSelectedMonth;
            if (!await showCustomConfirm(`Hapus jadwal shift ${s.name} untuk bulan ${month}?`, "Hapus Shift Staff", true)) return;
            
            try {
                btnDeleteStaffShift.disabled = true;
                btnDeleteStaffShift.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
                
                const { error } = await supabaseClient
                    .from('absensi_shifts')
                    .delete()
                    .eq('month', month)
                    .eq('staff_id', s.id);
                    
                if (error) throw error;
                
                showToast(`Shift ${s.name} berhasil dihapus.`, "success");
                await fetchAbsensiData();
                renderAbsensi();
            } catch (err) {
                console.error("Gagal menghapus shift staff:", err);
                showToast("Terjadi kesalahan.", "error");
                btnDeleteStaffShift.disabled = false;
                btnDeleteStaffShift.innerHTML = `<i class="fa-solid fa-trash"></i>`;
            }
        });
        
        tdAksi.appendChild(btnDeleteStaffShift);
        tr.appendChild(tdAksi);
        
        bodyContainer.appendChild(tr);
    });
}

// Render Tab 3: Log Riwayat Kedatangan
function renderAbsensiLogs() {
    const tbody = document.getElementById("absensiLogsBody");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    const searchQuery = document.getElementById("absensiLogSearch").value.trim().toLowerCase();
    const statusFilter = document.getElementById("absensiLogFilterStatus").value;
    
    let filteredLogs = state.absensiLogs.filter(l => l.day_num === state.absensiSelectedDay);
    
    if (searchQuery) {
        filteredLogs = filteredLogs.filter(l => l.staff_name.toLowerCase().includes(searchQuery));
    }
    
    if (statusFilter) {
        filteredLogs = filteredLogs.filter(l => l.status === statusFilter);
    }
    
    if (filteredLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--text-muted); padding:30px;">Tidak ada log kehadiran pada tanggal ${state.absensiSelectedMonth}-${String(state.absensiSelectedDay).padStart(2, '0')}.</td></tr>`;
        return;
    }
    
    // Urutkan berdasarkan hari terbaru dan jam absen terbaru
    filteredLogs.sort((a, b) => b.day_num - a.day_num || b.clock_in_time.localeCompare(a.clock_in_time));
    
    filteredLogs.forEach(log => {
        const tr = document.createElement("tr");
        const statusClass = log.status === "ON TIME" ? "safe" : "late";
        const dateStr = `${state.absensiSelectedMonth}-${String(log.day_num).padStart(2, '0')}`;
        
        let shiftText = log.shift;
        if (log.shift === "1") shiftText = "Shift 1 (Pagi)";
        else if (log.shift === "2") shiftText = "Shift 2 (Malam)";
        
        tr.innerHTML = `
            <td style="font-family: monospace; font-size: 0.8rem; font-weight: 700; color: var(--text-muted);"><i class="fa-solid fa-calendar-day" style="margin-right:6px;"></i>${dateStr}</td>
            <td><strong>${log.staff_name}</strong></td>
            <td><span class="role-badge" style="margin: 0;">${log.role.toUpperCase() === 'CS' ? 'CS LC' : log.role}</span></td>
            <td style="font-size: 0.75rem;">${shiftText}</td>
            <td style="font-family: monospace; font-weight: bold; color: var(--accent);">${log.clock_in_time}</td>
            <td style="text-align: center;"><span class="status-badge ${statusClass}">${log.status}</span></td>
            <td style="text-align: center;">
                <button class="btn-icon-danger" onclick="handleDeleteAbsensiLogClick('${log.staff_id}', ${log.day_num}, '${log.staff_name}')" title="Hapus Log">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Delete Log button click handler
window.handleDeleteAbsensiLogClick = async function(staffId, dayNum, staffName) {
    if (!await validateAdminPassword()) return;
    if (await showCustomConfirm(`Apakah Anda yakin ingin menghapus log kehadiran ${staffName} pada hari ke-${dayNum}?`, "Hapus Log Kehadiran")) {
        await deleteAbsensiLog(staffId, dayNum);
    }
};

// Ekspor Log Absensi ke CSV
function exportAbsensiLogsToCSV() {
    let filteredLogs = state.absensiLogs;
    if (filteredLogs.length === 0) {
        showToast("Tidak ada data log kehadiran untuk diekspor pada bulan ini.", "warning");
        return;
    }
    
    filteredLogs.sort((a, b) => b.day_num - a.day_num);
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Tanggal,Nama Staff,Jabatan,Shift,Jam Absen Masuk,Status Kehadiran\n";
    
    filteredLogs.forEach(l => {
        const dateStr = `${state.absensiSelectedMonth}-${String(l.day_num).padStart(2, '0')}`;
        const shiftText = l.shift === "1" ? "Shift 1 (Pagi)" : l.shift === "2" ? "Shift 2 (Malam)" : l.shift;
        csvContent += `"${dateStr}","${l.staff_name}","${l.role}","${shiftText}","${l.clock_in_time}","${l.status}"\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `log_absensi_wdbos_${state.absensiSelectedMonth}.csv`);
    document.body.appendChild(link);
    
    link.click();
    document.body.removeChild(link);
    showToast("Log kehadiran berhasil diekspor ke CSV.", "success");
}

// Reset data logs absensi
async function resetAbsensiLogs() {
    if (!await validateAdminPassword()) return;
    if (!await showCustomConfirm("Apakah Anda yakin ingin MENGHAPUS SEMUA LOG KEHADIRAN bulan ini secara permanen?", "Reset Log Kehadiran")) {
        return;
    }
    
    if (state.absensiUseLocalFallback || !supabaseClient) {
        localStorage.removeItem("restease_absensi_logs");
        loadAbsensiLocal();
        renderAbsensi();
        showToast("Semua log kehadiran lokal berhasil di-reset.", "success");
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('absensi_logs')
            .delete()
            .eq('month_str', state.absensiSelectedMonth);
            
        if (error) throw error;
        
        // Update local state instan
        state.absensiLogs = [];
        
        // Re-render UI instan tanpa refresh
        renderAbsensi();
        
        showToast("Semua log kehadiran database berhasil di-reset.", "success");
    } catch (err) {
        console.error("Gagal mereset log kehadiran di Supabase:", err);
        showToast("Gagal mengosongkan database log kehadiran.", "error");
    }
}

function togglePasswordVisibility(inputId, icon) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === "password") {
        input.type = "text";
        if (icon) {
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
        }
    } else {
        input.type = "password";
        if (icon) {
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");
        }
    }
}
window.togglePasswordVisibility = togglePasswordVisibility;

async function syncLocalLogsToSupabase() {
    if (!supabaseClient || state.absensiUseLocalFallback) return;
    
    const raw = localStorage.getItem("restease_absensi_logs");
    if (!raw) return;
    
    try {
        const localLogs = JSON.parse(raw);
        if (localLogs.length === 0) return;
        
        console.log(`Menyinkronkan ${localLogs.length} data absensi lokal ke database cloud...`);
        
        for (const log of localLogs) {
            await supabaseClient
                .from('absensi_logs')
                .delete()
                .eq('staff_id', log.staff_id)
                .eq('day_num', log.day_num)
                .eq('month_str', log.month_str);
                
            const { error } = await supabaseClient
                .from('absensi_logs')
                .insert({
                    staff_id: log.staff_id,
                    staff_name: log.staff_name,
                    role: log.role,
                    day_num: log.day_num,
                    month_str: log.month_str,
                    shift: log.shift,
                    clock_in_time: log.clock_in_time,
                    status: log.status
                });
            if (error) throw error;
        }
        
        localStorage.removeItem("restease_absensi_logs");
        console.log("Sinkronisasi absensi lokal selesai!");
        showToast("Sinkronisasi log kehadiran offline ke cloud sukses!", "success");
        
        // Refresh local memory and view
        const { data: latestLogs, error: fetchErr } = await supabaseClient
            .from('absensi_logs')
            .select('*')
            .eq('month_str', state.absensiSelectedMonth);
        if (!fetchErr && latestLogs) {
            state.absensiLogs = latestLogs;
            renderAbsensi();
            
            const clockInSec = document.getElementById("clockInView");
            if (clockInSec && clockInSec.classList.contains("active")) {
                const today = new Date();
                const currentDay = today.getDate();
                const currentMonthStr = today.toLocaleDateString('sv-SE').substring(0, 7);
                renderClockInStatus(currentDay);
                renderTodayAttendanceList(currentDay);
                renderAttendanceHistory(currentDay);
                renderPersonalAttendanceLogs(currentMonthStr);
            }
        }
    } catch (err) {
        console.error("Gagal menyinkronkan data absensi lokal ke cloud:", err);
    }
}
window.syncLocalLogsToSupabase = syncLocalLogsToSupabase;

// ==========================================================================
// 16. SELF-ATTENDANCE CLOCK IN LOGIC
// ==========================================================================

async function initClockInView() {
    if (!state.currentStaff) {
        showToast("Anda wajib login terlebih dahulu!", "warning");
        showView("izinView");
        const izinNavBtn = document.querySelector('.nav-item-main[data-target="izinView"]');
        if (izinNavBtn) setActiveNav(izinNavBtn);
        return;
    }

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonthStr = today.toLocaleDateString('sv-SE').substring(0, 7); // YYYY-MM

    // Sync selected date state to today
    state.absensiSelectedMonth = currentMonthStr;
    state.absensiSelectedDay = currentDay;

    // Load latest data
    await fetchAbsensiData();

    // Render components
    renderClockInStatus(currentDay);
    renderTodayAttendanceList(currentDay);
    renderAttendanceHistory(currentDay);
    renderPersonalAttendanceLogs(currentMonthStr);
}

function normalizeAbsensiLookupName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function getAbsensiLookupKeys(item) {
    const keys = [];
    if (item?.id) keys.push(`id:${item.id}`);
    if (item?.staff_id) keys.push(`id:${item.staff_id}`);
    
    const name = item?.name || item?.staff_name;
    if (name) {
        keys.push(`name:${normalizeAbsensiLookupName(name)}`);
    }
    
    return keys;
}

function buildClockInIndexes(currentDay, monthStr = state.absensiSelectedMonth) {
    const shiftByStaffKey = new Map();
    const logByStaffKey = new Map();
    const personalLogsByStaffKey = new Map();
    
    state.absensiShifts.forEach(shift => {
        if (monthStr && shift.month_str && shift.month_str !== monthStr) return;
        getAbsensiLookupKeys(shift).forEach(key => {
            if (!shiftByStaffKey.has(key)) {
                shiftByStaffKey.set(key, shift);
            }
        });
    });
    
    state.absensiLogs.forEach(log => {
        if (monthStr && log.month_str && log.month_str !== monthStr) return;
        
        const keys = getAbsensiLookupKeys(log);
        keys.forEach(key => {
            if (!personalLogsByStaffKey.has(key)) {
                personalLogsByStaffKey.set(key, []);
            }
            personalLogsByStaffKey.get(key).push(log);
            
            if (log.day_num === currentDay && !logByStaffKey.has(key)) {
                logByStaffKey.set(key, log);
            }
        });
    });
    
    return { shiftByStaffKey, logByStaffKey, personalLogsByStaffKey };
}

function renderClockInStatus(currentDay) {
    const staff = state.currentStaff;
    if (!staff) return;
    
    const currentMonthStr = state.absensiSelectedMonth;
    const { shiftByStaffKey, logByStaffKey } = buildClockInIndexes(currentDay, currentMonthStr);
    const staffKeys = getAbsensiLookupKeys(staff);

    document.getElementById("clockInStaffName").textContent = staff.name;
    document.getElementById("clockInStaffRole").textContent = staff.role;

    // Find shift config with defensive checks
    const shiftConfig = staffKeys.map(key => shiftByStaffKey.get(key)).find(Boolean);
    const shiftToday = (shiftConfig && Array.isArray(shiftConfig.schedule)) ? shiftConfig.schedule[currentDay - 1] : "OFF";

    const shiftHours = (state.settings && state.settings.shift_hours) || defaultShiftHours;
    const config = shiftHours[shiftToday];

    let shiftLabel = "-";
    if (config) {
        const startShort = config.start.substring(0, 5);
        shiftLabel = `${config.name} (${startShort})`;
    } else {
        if (shiftToday === "1") {
            shiftLabel = "Shift Pagi (07:45)";
        } else if (shiftToday === "2") {
            shiftLabel = "Shift Malam (19:45)";
        } else if (shiftToday === "1/2") {
            shiftLabel = "Shift Setengah Hari (07:45)";
        } else if (shiftToday === "OFF") {
            shiftLabel = "LIBUR (OFF)";
        } else if (shiftToday === "CUTI") {
            shiftLabel = "CUTI";
        } else if (shiftToday) {
            shiftLabel = shiftToday;
        }
    }

    document.getElementById("clockInShiftCode").textContent = shiftLabel;

    // Check if clocked in today
    const clockedInLog = staffKeys.map(key => logByStaffKey.get(key)).find(Boolean);
    const btn = document.getElementById("btnPerformClockIn");
    const msg = document.getElementById("clockInMessage");

    if (!btn || !msg) return;

    if (clockedInLog) {
        // Clocked in
        btn.disabled = true;
        btn.removeAttribute("style");
        btn.className = "btn-clock-in-disabled";
        btn.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> SUDAH ABSEN`;
        
        msg.style.color = clockedInLog.status === "ON TIME" ? "var(--success)" : "var(--danger)";
        msg.innerHTML = `Absen Masuk: <strong class="font-mono">${clockedInLog.clock_in_time}</strong> (${clockedInLog.status})`;
    } else if (shiftToday === "OFF" || shiftToday === "CUTI") {
        // Muted / No shift
        btn.disabled = true;
        btn.removeAttribute("style");
        btn.className = "btn-clock-in-disabled";
        btn.innerHTML = `<i class="fa-solid fa-ban"></i> LIBUR / CUTI`;
        
        msg.style.color = "var(--text-muted)";
        msg.textContent = "Tidak ada jadwal shift hari ini.";
    } else {
        // Ready to clock in
        btn.disabled = false;
        btn.removeAttribute("style");
        btn.className = "btn-clock-in";
        btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> CLOCK IN SEKARANG`;
        
        msg.style.color = "var(--accent)";
        msg.textContent = "Silakan klik tombol di atas untuk melakukan absensi mandiri.";
    }
}

function isWithinOneHourBeforeOrAfter(shiftStartStr) {
    if (!shiftStartStr) return false;
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentSec = now.getSeconds();
    const currentSecondsSinceMidnight = (currentHour * 3600) + (currentMin * 60) + currentSec;
    
    const parts = shiftStartStr.split(":");
    const startHour = parseInt(parts[0], 10);
    const startMin = parseInt(parts[1], 10);
    const startSec = parts[2] ? parseInt(parts[2], 10) : 0;
    
    const startSecondsSinceMidnight = (startHour * 3600) + (startMin * 60) + startSec;
    const oneHourBeforeSeconds = startSecondsSinceMidnight - 3600;
    
    return currentSecondsSinceMidnight >= oneHourBeforeSeconds;
}

function renderTodayAttendanceList(currentDay) {
    const clockedInList = document.getElementById("clockedInList");
    const notClockedInList = document.getElementById("notClockedInList");
    const selfPresentCount = document.getElementById("selfPresentCount");
    const selfAbsentCount = document.getElementById("selfAbsentCount");

    if (!clockedInList || !notClockedInList) return;

    clockedInList.innerHTML = "";
    notClockedInList.innerHTML = "";
    
    const currentMonthStr = state.absensiSelectedMonth;
    const { shiftByStaffKey, logByStaffKey } = buildClockInIndexes(currentDay, currentMonthStr);

    let presentStaff = [];
    let absentStaff = [];

    state.staff.forEach(s => {
        const staffKeys = getAbsensiLookupKeys(s);
        // Find config with defensive checks
        const shiftConfig = staffKeys.map(key => shiftByStaffKey.get(key)).find(Boolean);
        const shiftToday = (shiftConfig && Array.isArray(shiftConfig.schedule)) ? shiftConfig.schedule[currentDay - 1] : "OFF";

        // Hanya tampilkan staff dengan shift 1 (Pagi) dan 2 (Malam)
        // Ignore: OFF, CUTI, 1/2 HARI, dan shift lainnya
        if (shiftToday !== "1" && shiftToday !== "2") return;

        let shiftName = shiftToday === "1" ? "Shift Pagi" : "Shift Malam";

        // Find logs with defensive checks
        const log = staffKeys.map(key => logByStaffKey.get(key)).find(Boolean);

        if (log) {
            presentStaff.push({ staff: s, shift: shiftName, log: log });
        } else {
            // Get actual shift start time
            const shiftHours = (state.settings && state.settings.shift_hours) || defaultShiftHours;
            const config = shiftHours[shiftToday];
            const startTimeStr = config ? config.start : (shiftToday === "1" ? "07:45:00" : (shiftToday === "2" ? "19:45:00" : "07:45:00"));
            
            if (isWithinOneHourBeforeOrAfter(startTimeStr)) {
                absentStaff.push({ staff: s, shift: shiftName });
            }
        }
    });

    if (selfPresentCount) selfPresentCount.textContent = `${presentStaff.length} Staff`;
    if (selfAbsentCount) selfAbsentCount.textContent = `${absentStaff.length} Staff`;

    if (presentStaff.length === 0) {
        clockedInList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 20px;">Belum ada staff yang absen.</div>`;
    } else {
        presentStaff.forEach(p => {
            const item = document.createElement("div");
            item.style.cssText = "display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; background: rgba(255,255,255,0.03); padding: 10px 14px; border-radius: 8px; margin-bottom: 6px;";
            
            const badgeBg = p.log.status === "ON TIME" ? "#10b981 !important" : "#ef4444 !important";
            const badgeColor = "#ffffff !important";

            item.innerHTML = `
                <div style="display: flex; flex-direction: column; min-width: 0;">
                    <span style="font-weight: 700; color: white; font-size: 0.85rem; line-height: 1.3;">${p.staff.name}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${p.shift}</span>
                </div>
                <span style="font-size: 0.75rem; font-weight: 700; color: white; white-space: nowrap;" class="font-mono">${p.log.clock_in_time}</span>
                <span class="badge" style="background: ${badgeBg}; color: ${badgeColor}; font-size: 0.65rem; font-weight: 800; padding: 4px 8px; white-space: nowrap;">${p.log.status}</span>
            `;
            clockedInList.appendChild(item);
        });
    }

    if (absentStaff.length === 0) {
        notClockedInList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 20px;">Semua staff terjadwal sudah absen.</div>`;
    } else {
        absentStaff.forEach(a => {
            const item = document.createElement("div");
            item.style.cssText = "display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; background: rgba(255,255,255,0.03); padding: 10px 14px; border-radius: 8px; margin-bottom: 6px;";
            item.innerHTML = `
                <div style="display: flex; flex-direction: column; min-width: 0;">
                    <span style="font-weight: 700; color: white; font-size: 0.85rem; line-height: 1.3;">${a.staff.name}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${a.shift}</span>
                </div>
                <span class="badge" style="background: #f59e0b !important; color: #ffffff !important; font-size: 0.65rem; font-weight: 800; padding: 4px 8px; white-space: nowrap;">BELUM ABSEN</span>
            `;
            notClockedInList.appendChild(item);
        });
    }
}

// Render riwayat ON TIME dan TERLAMBAT di Clock In Mandiri
function renderAttendanceHistory(currentDay) {
    const onTimeList = document.getElementById("onTimeHistoryList");
    const lateList = document.getElementById("lateHistoryList");
    const onTimeCount = document.getElementById("selfOnTimeCount");
    const lateCount = document.getElementById("selfLateCount");

    if (!onTimeList || !lateList) return;

    onTimeList.innerHTML = "";
    lateList.innerHTML = "";

    const currentMonthStr = state.absensiSelectedMonth;
    const { logByStaffKey } = buildClockInIndexes(currentDay, currentMonthStr);

    let onTimeStaff = [];
    let lateStaff = [];

    // Cari semua logs hari ini
    state.absensiLogs.forEach(log => {
        if (log.day_num !== currentDay) return;
        
        // Cari staff yang sesuai
        const staff = state.staff.find(s => s.id === log.staff_id);
        if (!staff) return;

        // Cari shift untuk menampilkan nama shift
        const shiftByStaffId = new Map();
        state.absensiShifts.forEach(shift => {
            if (shift.month_str === currentMonthStr && !shiftByStaffId.has(shift.staff_id)) {
                shiftByStaffId.set(shift.staff_id, shift);
            }
        });

        const shiftConfig = shiftByStaffId.get(staff.id);
        const shiftToday = shiftConfig ? shiftConfig.schedule[currentDay - 1] : "";
        
        // Hanya tampilkan shift 1 dan 2 (sesuai filter yang sudah diterapkan)
        if (shiftToday !== "1" && shiftToday !== "2") return;

        const shiftName = shiftToday === "1" ? "Shift Pagi" : "Shift Malam";

        if (log.status === "ON TIME") {
            onTimeStaff.push({ staff: staff, shift: shiftName, log: log });
        } else if (log.status === "TERLAMBAT") {
            lateStaff.push({ staff: staff, shift: shiftName, log: log });
        }
    });

    // Update counters
    if (onTimeCount) onTimeCount.textContent = `${onTimeStaff.length} Staff`;
    if (lateCount) lateCount.textContent = `${lateStaff.length} Staff`;

    // Render ON TIME list
    if (onTimeStaff.length === 0) {
        onTimeList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 20px;">Belum ada data ON TIME.</div>`;
    } else {
        onTimeStaff.forEach(p => {
            const item = document.createElement("div");
            item.style.cssText = "display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; background: rgba(255,255,255,0.03); padding: 10px 14px; border-radius: 8px; margin-bottom: 6px;";
            item.innerHTML = `
                <div style="display: flex; flex-direction: column; min-width: 0;">
                    <span style="font-weight: 700; color: white; font-size: 0.85rem; line-height: 1.3;">${p.staff.name}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${p.shift}</span>
                </div>
                <span style="font-size: 0.75rem; font-weight: 700; color: white; white-space: nowrap;" class="font-mono">${p.log.clock_in_time}</span>
                <span class="badge" style="background: #10b981 !important; color: #ffffff !important; font-size: 0.65rem; font-weight: 800; padding: 4px 8px; white-space: nowrap;">ON TIME</span>
            `;
            onTimeList.appendChild(item);
        });
    }

    // Render TERLAMBAT list
    if (lateStaff.length === 0) {
        lateList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 20px;">Belum ada data TERLAMBAT.</div>`;
    } else {
        lateStaff.forEach(p => {
            const item = document.createElement("div");
            item.style.cssText = "display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; background: rgba(255,255,255,0.03); padding: 10px 14px; border-radius: 8px; margin-bottom: 6px;";
            item.innerHTML = `
                <div style="display: flex; flex-direction: column; min-width: 0;">
                    <span style="font-weight: 700; color: white; font-size: 0.85rem; line-height: 1.3;">${p.staff.name}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${p.shift}</span>
                </div>
                <span style="font-size: 0.75rem; font-weight: 700; color: white; white-space: nowrap;" class="font-mono">${p.log.clock_in_time}</span>
                <span class="badge" style="background: #ef4444 !important; color: #ffffff !important; font-size: 0.65rem; font-weight: 800; padding: 4px 8px; white-space: nowrap;">TERLAMBAT</span>
            `;
            lateList.appendChild(item);
        });
    }
}

function renderPersonalAttendanceLogs(currentMonthStr) {
    const tbody = document.getElementById("clockInHistoryTbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const staff = state.currentStaff;
    if (!staff) return;
    
    const { personalLogsByStaffKey } = buildClockInIndexes(state.absensiSelectedDay, currentMonthStr);
    const personalLogsMap = new Map();
    getAbsensiLookupKeys(staff).forEach(key => {
        const logs = personalLogsByStaffKey.get(key) || [];
        logs.forEach(log => {
            if (!personalLogsMap.has(log.id)) {
                personalLogsMap.set(log.id, log);
            }
        });
    });

    // Filter personal logs with defensive checks
    const personalLogs = Array.from(personalLogsMap.values());
    
    // Sort by day number descending
    personalLogs.sort((a, b) => b.day_num - a.day_num);

    if (personalLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Tidak ada riwayat kehadiran bulan ini.</td></tr>`;
        return;
    }

    personalLogs.forEach((log, index) => {
        const tr = document.createElement("tr");

        const dateStr = `${currentMonthStr}-${String(log.day_num).padStart(2, '0')}`;
        const shiftLabel = log.shift === "1" ? "Shift Pagi" : (log.shift === "2" ? "Shift Malam" : "Shift Setengah Hari");
        
        const badgeBg = log.status === "ON TIME" ? "#10b981 !important" : "#ef4444 !important";
        const badgeColor = "#ffffff !important";

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td class="font-mono">${dateStr}</td>
            <td><span class="badge" style="background: rgba(255,255,255,0.06); color: white; font-weight: 600;">${shiftLabel}</span></td>
            <td class="font-mono" style="font-weight: 700;">${log.clock_in_time}</td>
            <td><span class="badge" style="background: ${badgeBg}; color: ${badgeColor}; font-weight: 800; padding: 3px 8px;">${log.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

async function performSelfClockIn() {
    if (window.isClockingIn) return;
    window.isClockingIn = true;

    const staff = state.currentStaff;
    if (!staff) {
        window.isClockingIn = false;
        return;
    }

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonthStr = state.absensiSelectedMonth;
    const { shiftByStaffKey, logByStaffKey } = buildClockInIndexes(currentDay, currentMonthStr);
    const staffKeys = getAbsensiLookupKeys(staff);

    // Find shift config with defensive checks
    const shiftConfig = staffKeys.map(key => shiftByStaffKey.get(key)).find(Boolean);
    const shiftToday = (shiftConfig && Array.isArray(shiftConfig.schedule)) ? shiftConfig.schedule[currentDay - 1] : "OFF";

    if (shiftToday === "OFF" || shiftToday === "CUTI" || !shiftToday) {
        showToast("Jadwal Anda hari ini Libur / Cuti.", "warning");
        window.isClockingIn = false;
        return;
    }

    // Double check if already clocked in today with defensive checks
    const exists = staffKeys.some(key => logByStaffKey.has(key));
    if (exists) {
        showToast("Anda sudah melakukan absensi hari ini.", "info");
        window.isClockingIn = false;
        return;
    }

    const clockInTime = today.toLocaleTimeString('id-ID'); // HH:MM:SS
    const timeStr = today.toTimeString().split(' ')[0]; // HH:MM:SS

    const shiftHours = (state.settings && state.settings.shift_hours) || defaultShiftHours;
    const config = shiftHours[shiftToday];
    let status = "ON TIME";
    if (config) {
        status = timeStr <= config.start ? "ON TIME" : "TERLAMBAT";
    } else {
        if (shiftToday === "1") {
            status = timeStr <= "07:45:59" ? "ON TIME" : "TERLAMBAT";
        } else {
            status = timeStr <= "19:45:59" ? "ON TIME" : "TERLAMBAT";
        }
    }

    try {
        // Disable button to prevent double-clicks
        const btn = document.getElementById("btnPerformClockIn");
        if (btn) btn.disabled = true;

        await saveAbsensiLog(staff.id, staff.name, staff.role, currentDay, shiftToday, clockInTime, status);
        
        // Render instantly
        const currentMonthStr = today.toLocaleDateString('sv-SE').substring(0, 7);
        renderClockInStatus(currentDay);
        renderTodayAttendanceList(currentDay);
        renderAttendanceHistory(currentDay);
        renderPersonalAttendanceLogs(currentMonthStr);
        
        // Wait slightly for realtime broadcast or force refresh
        setTimeout(() => {
            renderClockInStatus(currentDay);
            renderTodayAttendanceList(currentDay);
            renderAttendanceHistory(currentDay);
            renderTodayAttendanceList(currentDay);
            renderPersonalAttendanceLogs(currentMonthStr);
        }, 1000);
    } catch (err) {
        console.error("Gagal melakukan absensi mandiri:", err);
        showToast("Gagal memproses absensi.", "error");
    } finally {
        // Release execution lock after 3 seconds safe window
        setTimeout(() => {
            window.isClockingIn = false;
        }, 3000);
    }
}

function renderShiftSettingsTable() {
    const tbody = document.getElementById("shiftSettingsTbody");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    const shiftHours = (state.settings && state.settings.shift_hours) || defaultShiftHours;
    
    Object.keys(shiftHours).forEach(code => {
        const config = shiftHours[code];
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><input type="text" class="form-control shift-code-input" value="${code}" placeholder="1" style="width: 80px; text-align: center; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px;"></td>
            <td><input type="text" class="form-control shift-name-input" value="${config.name}" placeholder="Shift Pagi" style="background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px; width: 100%;"></td>
            <td><input type="text" class="form-control shift-start-input font-mono" value="${config.start}" placeholder="07:45:00" style="background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px; width: 120px; text-align: center;"></td>
            <td><input type="text" class="form-control shift-end-input font-mono" value="${config.end}" placeholder="19:45:00" style="background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px; width: 120px; text-align: center;"></td>
            <td style="text-align: center;"><button onclick="this.closest('tr').remove()" class="btn btn-danger" style="padding: 4px 10px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-trash"></i> Hapus</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function addNewShiftRow() {
    const tbody = document.getElementById("shiftSettingsTbody");
    if (!tbody) return;
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td><input type="text" class="form-control shift-code-input" value="" placeholder="Kode (misal: 3)" style="width: 80px; text-align: center; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px;"></td>
        <td><input type="text" class="form-control shift-name-input" value="" placeholder="Shift Siang" style="background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px; width: 100%;"></td>
        <td><input type="text" class="form-control shift-start-input font-mono" value="12:00:00" placeholder="12:00:00" style="background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px; width: 120px; text-align: center;"></td>
        <td><input type="text" class="form-control shift-end-input font-mono" value="20:00:00" placeholder="20:00:00" style="background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px; width: 120px; text-align: center;"></td>
        <td style="text-align: center;"><button onclick="this.closest('tr').remove()" class="btn btn-danger" style="padding: 4px 10px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-trash"></i> Hapus</button></td>
    `;
    tbody.appendChild(tr);
}

async function saveShiftSettings() {
    const rows = document.querySelectorAll("#shiftSettingsTbody tr");
    const shiftHours = {};
    
    let isValid = true;
    rows.forEach(row => {
        const codeInput = row.querySelector(".shift-code-input");
        const nameInput = row.querySelector(".shift-name-input");
        const startInput = row.querySelector(".shift-start-input");
        const endInput = row.querySelector(".shift-end-input");
        
        if (codeInput && nameInput && startInput && endInput) {
            const code = codeInput.value.trim();
            const name = nameInput.value.trim();
            const start = startInput.value.trim();
            const end = endInput.value.trim();
            
            if (!code || !name || !start || !end) {
                isValid = false;
                return;
            }
            
            shiftHours[code] = {
                name: name,
                start: start,
                end: end
            };
        }
    });
    
    if (!isValid) {
        showToast("Semua kolom pengaturan shift wajib diisi!", "warning");
        return;
    }
    
    if (!state.settings) state.settings = {};
    state.settings.shift_hours = shiftHours;
    
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('settings')
                .update({ value: state.settings })
                .eq('key', 'general');
                
            if (error) throw error;
            showToast("Pengaturan jam kerja shift berhasil disimpan ke cloud!", "success");
        } catch (err) {
            console.error("Gagal menyimpan shift ke cloud:", err);
            localStorage.setItem("restease_local_settings", JSON.stringify(state.settings));
            showToast("Koneksi gagal. Pengaturan disimpan secara lokal.", "warning");
        }
    } else {
        localStorage.setItem("restease_local_settings", JSON.stringify(state.settings));
        showToast("Pengaturan disimpan secara lokal.", "success");
    }
    
    // Re-render Clock In View if it's currently active!
    const clockInSec = document.getElementById("clockInView");
    if (clockInSec && clockInSec.classList.contains("active")) {
        const today = new Date();
        const currentDay = today.getDate();
        renderClockInStatus(currentDay);
        renderTodayAttendanceList(currentDay);
    }
}

// Export functions to window
window.initClockInView = initClockInView;
window.performSelfClockIn = performSelfClockIn;
window.renderClockInStatus = renderClockInStatus;
window.renderTodayAttendanceList = renderTodayAttendanceList;
window.renderPersonalAttendanceLogs = renderPersonalAttendanceLogs;
window.renderShiftSettingsTable = renderShiftSettingsTable;
window.addNewShiftRow = addNewShiftRow;
window.saveShiftSettings = saveShiftSettings;


// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMER SERVICE GROUP TOGGLE
// ══════════════════════════════════════════════════════════════════════════════
function getActiveViewId() {
    return document.querySelector('.view-section.active')?.id || '';
}

function openFirstVisibleGroupView(menuId, allowedTargets = []) {
    const currentViewId = getActiveViewId();
    if (allowedTargets.includes(currentViewId)) return;

    const menu = document.getElementById(menuId);
    if (!menu) return;

    const targetBtn = Array.from(menu.querySelectorAll('.nav-item-main[data-target]'))
        .find(btn => btn.style.display !== 'none');

    if (targetBtn) {
        targetBtn.click();
    }
}

function toggleCsGroup() {
    const menu = document.getElementById('csGroupMenu');
    const arrow = document.getElementById('csGroupArrow');
    const toggleBtn = document.getElementById('btnCsGroupToggle');
    
    if (menu.classList.contains('cs-open')) {
        // Close
        menu.style.maxHeight = '0';
        menu.classList.remove('cs-open');
        arrow.style.transform = 'rotate(0deg)';
        toggleBtn.style.background = 'rgba(56,189,248,0.06)';
    } else {
        // Open
        menu.style.maxHeight = menu.scrollHeight + 'px';
        menu.classList.add('cs-open');
        arrow.style.transform = 'rotate(90deg)';
        toggleBtn.style.background = 'rgba(56,189,248,0.1)';
        openFirstVisibleGroupView('csGroupMenu', ['bandingView', 'qrisView']);
    }
}

window.toggleCsGroup = toggleCsGroup;

// ══════════════════════════════════════════════════════════════════════════════
// SERAH TERIMA GROUP TOGGLE
// ══════════════════════════════════════════════════════════════════════════════
function toggleSerahTerimaGroup() {
    const menu = document.getElementById('serahTerimaGroupMenu');
    const arrow = document.getElementById('serahTerimaGroupArrow');
    const toggleBtn = document.getElementById('btnSerahTerimaGroupToggle');
    
    if (menu.classList.contains('st-open')) {
        // Close
        menu.style.maxHeight = '0';
        menu.classList.remove('st-open');
        arrow.style.transform = 'rotate(0deg)';
        toggleBtn.style.background = 'rgba(168,85,247,0.06)';
    } else {
        // Open
        menu.style.maxHeight = menu.scrollHeight + 'px';
        menu.classList.add('st-open');
        arrow.style.transform = 'rotate(90deg)';
        toggleBtn.style.background = 'rgba(168,85,247,0.1)';
        openFirstVisibleGroupView('serahTerimaGroupMenu', ['serahTerimaCSLineView', 'serahTerimaKaptenView', 'serahTerimaKasirView']);
    }
}

window.toggleSerahTerimaGroup = toggleSerahTerimaGroup;

// ══════════════════════════════════════════════════════════════════════════════
// SIDEBAR COLLAPSE / EXPAND TOGGLE
// ══════════════════════════════════════════════════════════════════════════════
function toggleSidebarCollapse() {
    const sidebar = document.querySelector('.app-sidebar');
    if (!sidebar) return;

    const isCollapsed = sidebar.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');

    // Trigger canvas resize for smooth transition
    setTimeout(() => {
        if (typeof initTechParticleBackground === 'function') {
            window.dispatchEvent(new Event('resize'));
        }
    }, 320);
}

function initSidebarState() {
    const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    const sidebar = document.querySelector('.app-sidebar');
    if (sidebar && isCollapsed) {
        sidebar.classList.add('sidebar-collapsed');
    }
}

window.toggleSidebarCollapse = toggleSidebarCollapse;
window.initSidebarState = initSidebarState;

// ══════════════════════════════════════════════════════════════════════════════
// ANIMASI IT TECH PARTICLES (DIHAPUS PERMANEN DEMI PERFORMA)
// ══════════════════════════════════════════════════════════════════════════════
function initTechParticleBackground() {
    return null;
}
window.initTechParticleBackground = initTechParticleBackground;

document.addEventListener('DOMContentLoaded', () => {
    initSidebarState();
    updateRoleBasedSidebarAccess();
    setTimeout(initTechParticleBackground, 300);
    setTimeout(loadStaffPersonalBackground, 100);
});

// ══════════════════════════════════════════════════════════════════════════════
// KUSTOMISASI BACKGROUND PERSONAL STAFF
// ══════════════════════════════════════════════════════════════════════════════
function openStaffBgModal() {
    const modal = document.getElementById('modalStaffBg');
    if (modal) {
        modal.classList.remove('hide');
        highlightCurrentStaffBg();
        syncStaffBackgroundAnimationToggleUI(state.staffBackgroundAnimationEnabled);
        // Refresh radio state tema — pakai key per-staff, bukan key global lama
        const staffId = state.currentStaff?.id || localStorage.getItem('restease_current_staff_id');
        const themeKey = staffId ? `restease_theme_preset_${staffId}` : null;
        const savedTheme = themeKey ? (localStorage.getItem(themeKey) || 'default') : 'default';
        // Hanya sync visual radio button — jangan re-apply tema (agar tidak flash)
        document.querySelectorAll('.theme-preset-card').forEach(card => {
            const radio = card.querySelector('.theme-radio');
            const isActive = card.getAttribute('data-theme') === savedTheme;
            const themeInfo = THEME_DATA[savedTheme];
            if (isActive) {
                card.style.border     = `2px solid ${themeInfo ? themeInfo.primary : '#8b5cf6'}`;
                card.style.boxShadow  = `0 0 18px ${themeInfo ? themeInfo.primaryGlow : 'rgba(139,92,246,0.3)'}`;
                if (radio) {
                    radio.style.background  = themeInfo ? themeInfo.primary : '#8b5cf6';
                    radio.style.borderColor = themeInfo ? themeInfo.primary : '#8b5cf6';
                    radio.innerHTML = '<div style="width:6px;height:6px;border-radius:50%;background:white;"></div>';
                }
            } else {
                card.style.border    = '2px solid rgba(255,255,255,0.08)';
                card.style.boxShadow = '';
                if (radio) {
                    radio.style.background  = '';
                    radio.style.borderColor = 'rgba(255,255,255,0.3)';
                    radio.innerHTML         = '';
                }
            }
        });
    }
}

function closeStaffBgModal() {
    const modal = document.getElementById('modalStaffBg');
    if (modal) modal.classList.add('hide');
}

function getStaffBgStorageKey() {
    const staffId = state.currentStaff?.id || 'guest';
    return `restease_user_bg_${staffId}`;
}

function getStaffBgAnimationStorageKey(staffId = null) {
    const resolvedStaffId = staffId || state.currentStaff?.id || localStorage.getItem("restease_current_staff_id") || 'guest';
    return `restease_user_bg_animation_${resolvedStaffId}`;
}

function getLocalStaffBackgroundAnimationPreference(staffId = null) {
    const raw = localStorage.getItem(getStaffBgAnimationStorageKey(staffId));
    if (raw === null) return false;
    return raw === 'true';
}

function setLocalStaffBackgroundAnimationPreference(enabled, staffId = null) {
    localStorage.setItem(getStaffBgAnimationStorageKey(staffId), enabled ? 'true' : 'false');
}

function syncStaffBackgroundAnimationToggleUI(enabled) {
    const statusEl = document.getElementById('staffBgAnimationStatus');
    const toggleBtn = document.getElementById('btnToggleStaffBgAnimation');
    if (!statusEl || !toggleBtn) return;

    const isEnabled = Boolean(enabled);
    statusEl.textContent = isEnabled ? 'ON' : 'OFF';
    statusEl.style.background = isEnabled ? 'rgba(16, 185, 129, 0.16)' : 'rgba(244, 63, 94, 0.16)';
    statusEl.style.color = isEnabled ? '#34d399' : '#fb7185';
    statusEl.style.borderColor = isEnabled ? 'rgba(16, 185, 129, 0.24)' : 'rgba(244, 63, 94, 0.24)';

    toggleBtn.textContent = isEnabled ? 'ON' : 'OFF';
    toggleBtn.style.background = isEnabled ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.12)';
    toggleBtn.style.color = isEnabled ? '#34d399' : '#fb7185';
    toggleBtn.style.borderColor = isEnabled ? 'rgba(16, 185, 129, 0.28)' : 'rgba(244, 63, 94, 0.28)';
}

function applyStaffBackgroundAnimationPreference(enabled, options = {}) {
    state.staffBackgroundAnimationEnabled = false;
}

async function toggleStaffBackgroundAnimation() {
    if (!state.currentStaff) {
        const nextValue = !state.staffBackgroundAnimationEnabled;
        applyStaffBackgroundAnimationPreference(nextValue);
        showToast(`Animasi background ${nextValue ? 'diaktifkan' : 'dimatikan'} di perangkat ini.`, "success");
        return;
    }

    const nextValue = !state.staffBackgroundAnimationEnabled;
    applyStaffBackgroundAnimationPreference(nextValue, { staffId: state.currentStaff.id });

    const saveResult = await saveStaffAnimationPreference(state.currentStaff.id, nextValue);
    if (saveResult) {
        showToast(`Animasi background ${nextValue ? 'diaktifkan' : 'dimatikan'} untuk akun Anda.`, "success");
    } else {
        showToast("Animasi background berubah sementara, tetapi belum tersimpan ke akun.", "warning");
    }
}

function loadStaffPersonalBackground() {
    // Use new Supabase-based background system
    if (state.currentStaff && typeof loadAndApplyStaffBackground === 'function') {
        loadAndApplyStaffBackground(state.currentStaff.id).catch(err => {
            console.warn("Failed to load background from Supabase, using localStorage fallback:", err);
            // Fallback to localStorage
            const key = getStaffBgStorageKey();
            const savedBg = localStorage.getItem(key) || localStorage.getItem('restease_local_bg');
            const savedAnimationEnabled = getLocalStaffBackgroundAnimationPreference(state.currentStaff.id);
            if (savedBg) {
                applyBackground(savedBg);
            } else if (state.settings && state.settings.background) {
                applyBackground(state.settings.background);
            }
            applyStaffBackgroundAnimationPreference(savedAnimationEnabled, { staffId: state.currentStaff.id });
        });
    } else {
        // Fallback to localStorage if no staff logged in
        const key = getStaffBgStorageKey();
        const savedBg = localStorage.getItem(key) || localStorage.getItem('restease_local_bg');
        const savedAnimationEnabled = getLocalStaffBackgroundAnimationPreference();
        if (savedBg) {
            applyBackground(savedBg);
        } else if (state.settings && state.settings.background) {
            applyBackground(state.settings.background);
        }
        applyStaffBackgroundAnimationPreference(savedAnimationEnabled);
    }
}

async function saveAndApplyStaffBg(bgValue) {
    applyBackground(bgValue);
    const key = getStaffBgStorageKey();
    localStorage.setItem(key, bgValue);
    localStorage.setItem('restease_local_bg', bgValue);
    let saveResult = true;
    
    // Save to Supabase database
    if (state.currentStaff && typeof saveStaffBackgroundPreference === 'function') {
        // Determine background type and value for Supabase
        let bgType = 'custom';
        let bgValueForDb = bgValue;
        
        // Check if it's a preset
        for (const [presetName, presetValue] of Object.entries(BACKGROUND_PRESETS || {})) {
            if (presetValue === bgValue) {
                bgType = 'preset';
                bgValueForDb = presetName;
                break;
            }
        }
        
        // Check if it's an image URL
        if (bgValue.startsWith('url(')) {
            bgType = 'image';
            bgValueForDb = bgValue.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
        }
        
        saveResult = await saveStaffBackgroundPreference(state.currentStaff.id, bgType, bgValueForDb);
    }
    
    highlightCurrentStaffBg();
    if (!state.currentStaff) {
        showToast("Background berhasil diperbarui di perangkat ini.", "success");
        return;
    }

    if (saveResult) {
        showToast("Background berhasil diperbarui untuk akun Anda.", "success");
    } else {
        showToast("Background diterapkan, tetapi belum tersimpan ke akun. Cek izin tabel staff_preferences di Supabase.", "warning");
    }
}

function selectStaffBgPreset(cardEl) {
    const bg = cardEl.getAttribute('data-bg');
    if (bg) {
        saveAndApplyStaffBg(bg);
    }
}

function handleStaffBgFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showToast("Ukuran file gambar maksimal 2MB.", "warning");
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        const bgVal = `url(${e.target.result})`;
        saveAndApplyStaffBg(bgVal);
    };
    reader.readAsDataURL(file);
}

function applyStaffBgFromUrl() {
    const input = document.getElementById('inputStaffBgUrl');
    const url = (input?.value || '').trim();
    if (!url) {
        showToast("Masukkan URL gambar yang valid.", "warning");
        return;
    }
    const bgVal = `url(${url})`;
    saveAndApplyStaffBg(bgVal);
    if (input) input.value = '';
}

function resetStaffBgToDefault() {
    const key = getStaffBgStorageKey();
    const defaultBg = state.settings?.background || 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #31104b 100%)';
    localStorage.removeItem(key);
    saveAndApplyStaffBg(defaultBg);
}

function highlightCurrentStaffBg() {
    const key = getStaffBgStorageKey();
    const currentBg = localStorage.getItem(key) || localStorage.getItem('restease_local_bg') || state.settings?.background;
    const cards = document.querySelectorAll('.staff-bg-card');
    cards.forEach(c => {
        if (c.getAttribute('data-bg') === currentBg) {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });
}

window.openStaffBgModal = openStaffBgModal;
window.closeStaffBgModal = closeStaffBgModal;
window.selectStaffBgPreset = selectStaffBgPreset;
window.handleStaffBgFileUpload = handleStaffBgFileUpload;
window.applyStaffBgFromUrl = applyStaffBgFromUrl;
window.resetStaffBgToDefault = resetStaffBgToDefault;
window.loadStaffPersonalBackground = loadStaffPersonalBackground;
window.toggleStaffBackgroundAnimation = toggleStaffBackgroundAnimation;


// ================================================================
// STAFF BACKGROUND PREFERENCE MANAGEMENT
// ================================================================

// Background presets definition
const BACKGROUND_PRESETS = {
    'cosmic-purple': 'radial-gradient(circle at 15% 10%, rgba(139, 92, 246, 0.07) 0%, transparent 50%), radial-gradient(circle at 85% 90%, rgba(34, 211, 238, 0.05) 0%, transparent 50%), linear-gradient(160deg, #06080f 0%, #08090f 40%, #060810 70%, #070610 100%)',
    'ocean-blue': 'radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(14, 116, 144, 0.06) 0%, transparent 50%), linear-gradient(135deg, #0c1426 0%, #0f1e3d 50%, #0a1628 100%)',
    'forest-green': 'radial-gradient(circle at 30% 30%, rgba(34, 197, 94, 0.07) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(5, 78, 59, 0.05) 0%, transparent 50%), linear-gradient(135deg, #051810 0%, #0a2518 50%, #031209 100%)',
    'sunset-orange': 'radial-gradient(circle at 25% 15%, rgba(251, 146, 60, 0.08) 0%, transparent 50%), radial-gradient(circle at 75% 85%, rgba(194, 65, 12, 0.06) 0%, transparent 50%), linear-gradient(135deg, #1c0f08 0%, #2d1508 50%, #1a0c05 100%)',
    'midnight-dark': 'radial-gradient(circle at 50% 50%, rgba(71, 85, 105, 0.03) 0%, transparent 70%), linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e293b 100%)',
    'royal-gold': 'radial-gradient(circle at 40% 20%, rgba(251, 191, 36, 0.06) 0%, transparent 50%), radial-gradient(circle at 60% 80%, rgba(161, 98, 7, 0.05) 0%, transparent 50%), linear-gradient(135deg, #1c1408 0%, #2d2008 50%, #1a1205 100%)',
    'cyber-neon': 'radial-gradient(circle at 15% 25%, rgba(139, 92, 246, 0.09) 0%, transparent 50%), radial-gradient(circle at 85% 75%, rgba(236, 72, 153, 0.07) 0%, transparent 50%), linear-gradient(135deg, #0f0520 0%, #1a0b3d 50%, #0d0418 100%)',
    'aurora-sky': 'radial-gradient(circle at 50% 20%, rgba(20, 184, 166, 0.08) 0%, transparent 50%), radial-gradient(circle at 50% 80%, rgba(14, 116, 144, 0.06) 0%, transparent 50%), linear-gradient(180deg, #0a1e28 0%, #0e2838 50%, #0c1a26 100%)',
    'rose-pink': 'radial-gradient(circle at 30% 30%, rgba(244, 63, 94, 0.08) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(190, 18, 60, 0.06) 0%, transparent 50%), linear-gradient(135deg, #1a0810 0%, #2d0f1f 50%, #180609 100%)',
    'steel-gray': 'radial-gradient(circle at 40% 40%, rgba(148, 163, 184, 0.06) 0%, transparent 50%), radial-gradient(circle at 60% 60%, rgba(71, 85, 105, 0.05) 0%, transparent 50%), linear-gradient(135deg, #1a1f2e 0%, #242b3d 50%, #181d2a 100%)'
};

// Load staff background preference from Supabase
async function loadStaffBackgroundPreference(staffId) {
    if (!supabaseClient || !staffId) return null;
    
    try {
        const { data, error } = await supabaseClient
            .from('staff_preferences')
            .select('*')
            .eq('staff_id', staffId)
            .maybeSingle();
        
        if (error) {
            console.warn("Error loading background preference:", error);
            return null;
        }
        
        return data;
    } catch (err) {
        console.error("Failed to load background preference:", err);
        return null;
    }
}

// Save staff background preference to Supabase
async function saveStaffPreferences(staffId, updates = {}) {
    if (!supabaseClient || !staffId) return false;
    
    try {
        const { error } = await supabaseClient
            .from('staff_preferences')
            .upsert({
                staff_id: staffId,
                ...updates,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'staff_id'
            });
        
        if (error) throw error;
        return true;
    } catch (err) {
        console.error("Failed to save staff preferences:", err);
        return false;
    }
}

async function saveStaffBackgroundPreference(staffId, bgType, bgValue) {
    const result = await saveStaffPreferences(staffId, {
        background_type: bgType,
        background_value: bgValue
    });

    if (result) {
        console.log("Background preference saved successfully");
    }

    return result;
}

async function saveStaffAnimationPreference(staffId, enabled) {
    const result = await saveStaffPreferences(staffId, {
        animation_enabled: Boolean(enabled)
    });

    if (result) {
        console.log("Animation preference saved successfully");
    }

    return result;
}

function resolveStaffBackgroundStyle(bgType, bgValue) {
    if (bgType === 'preset' && BACKGROUND_PRESETS[bgValue]) {
        return BACKGROUND_PRESETS[bgValue];
    } else if (bgType === 'gradient') {
        return bgValue;
    } else if (bgType === 'image') {
        return `url('${bgValue}')`;
    } else if (bgType === 'custom') {
        return bgValue;
    }
    
    return BACKGROUND_PRESETS['cosmic-purple'];
}

// Apply background personal staff ke overlay utama dashboard
function applyStaffBackground(bgType, bgValue) {
    const backgroundStyle = resolveStaffBackgroundStyle(bgType, bgValue);
    applyBackground(backgroundStyle);

    const key = getStaffBgStorageKey();
    localStorage.setItem(key, backgroundStyle);
    localStorage.setItem('restease_local_bg', backgroundStyle);
}

// Initialize background customizer UI
function initBackgroundCustomizer() {
    // Tidak digunakan lagi - menggunakan UI di header button
    console.log("Background customizer using header modal");
}

// Load and apply background when staff logs in
async function loadAndApplyStaffBackground(staffId) {
    const preference = await loadStaffBackgroundPreference(staffId);
    
    const animationEnabled = preference?.animation_enabled ?? getLocalStaffBackgroundAnimationPreference(staffId);
    applyStaffBackgroundAnimationPreference(animationEnabled, { staffId });

    if (preference && preference.background_type && preference.background_value) {
        applyStaffBackground(preference.background_type, preference.background_value);
        highlightCurrentStaffBg();
    } else {
        const key = `restease_user_bg_${staffId}`;
        const fallbackBg = localStorage.getItem(key) || state.settings?.background || BACKGROUND_PRESETS['cosmic-purple'];
        applyBackground(fallbackBg);
        localStorage.setItem(key, fallbackBg);
        localStorage.setItem('restease_local_bg', fallbackBg);
        highlightCurrentStaffBg();
    }

    // Setelah background staff selesai di-load, re-apply tema staff
    // agar tema tidak ditimpa oleh background preference
    const themeKey = `restease_theme_preset_${staffId}`;
    const savedTheme = localStorage.getItem(themeKey);
    if (savedTheme && savedTheme !== 'default') {
        applyThemePreset(savedTheme, null, true);
    }
}

// Export functions
window.loadStaffBackgroundPreference = loadStaffBackgroundPreference;
window.saveStaffBackgroundPreference = saveStaffBackgroundPreference;
window.applyStaffBackground = applyStaffBackground;
window.initBackgroundCustomizer = initBackgroundCustomizer;
window.loadAndApplyStaffBackground = loadAndApplyStaffBackground;

// ==========================================
// MY BIO LOGIC
// ==========================================
// ================================================================
// MOTIVATIONAL QUOTES — dipisah per waktu
// PAGI  : 04.00–09.59  |  SIANG : 10.00–14.59
// SORE  : 15.00–17.59  |  MALAM : 18.00–03.59
// ================================================================
const MOTIVATIONAL_QUOTES_BY_TIME = {
    PAGI: [
        "Selamat pagi! Mulailah harimu dengan niat yang kuat dan tekad yang membara.",
        "Pagi yang baik dimulai dari pikiran yang positif — yuk semangat!",
        "Bangun lebih awal, karena pagi adalah awal dari segala kemungkinan.",
        "Setiap pagi adalah kesempatan baru untuk menjadi versi terbaik dirimu.",
        "Awali pagi dengan senyuman, hasilnya akan mewarnai sepanjang harimu.",
        "Pagi ini adalah anugerah. Gunakan sebaik-baiknya.",
        "Jangan tunggu semangat datang — bangkitlah dan semangat itu akan mengikuti.",
        "Pagi adalah waktu terbaik untuk menanamkan benih kerja keras.",
        "Satu langkah kecil di pagi hari menentukan arah seluruh harimu.",
        "Selamat pagi, hari ini kamu punya kesempatan yang belum pernah ada sebelumnya.",
        "Mulai hari dengan bismillah, niat yang baik, dan kerja yang ikhlas.",
        "Pagi-pagi sudah bersemangat? Itu tanda orang yang akan berhasil.",
        "Setiap pagi membawa harapan baru. Jangan sia-siakan.",
        "Kerja keras di pagi hari adalah investasi untuk ketenangan di malam hari.",
        "Pagi adalah momen emas — gunakan untuk hal-hal yang berarti.",
        "Bangun, bergerak, dan buat hari ini bermakna!",
        "Semangat pagi! Hari ini kamu lebih kuat dari yang kamu kira.",
        "Rezeki datang bagi mereka yang bergerak lebih pagi.",
        "Jangan mulai harimu dengan kemalasan — pagi adalah milik yang bersemangat.",
        "Pagi ini adalah kesempatan untuk membuktikan siapa dirimu.",
    ],
    SIANG: [
        "Sudah setengah hari berlalu — tetap fokus, kamu hampir di tujuan!",
        "Siang yang produktif adalah buah dari pagi yang bersemangat.",
        "Jika lelah di siang hari, ingat mengapa kamu memulai.",
        "Siang ini bukan waktunya menyerah, tapi waktunya mendorong lebih keras.",
        "Pertahankan momentum — kerja terbaikmu bisa terjadi di siang hari.",
        "Lelah di siang hari? Itu artinya kamu sudah bekerja keras — bangga!",
        "Fokus pada satu tugas, selesaikan, lalu lanjut ke berikutnya.",
        "Jangan biarkan kantuk siang menghentikan produktivitasmu.",
        "Siang adalah saat untuk membuktikan daya tahanmu.",
        "Setengah hari sudah kamu lalui dengan baik — pertahankan!",
        "Kerja keras di siang hari, nikmati hasilnya nanti.",
        "Kalau siang ini terasa berat, ingat: kamu sudah melewati yang lebih berat.",
        "Tetap semangat di siang hari — itu tanda profesionalisme.",
        "Siang ini adalah waktu untuk menyelesaikan yang belum selesai.",
        "Satu tugas selesai di siang hari sudah merupakan kemenangan.",
        "Jaga fokus, jaga energi — siang ini masih panjang.",
        "Produktivitas siang hari menentukan seberapa puas kamu di akhir shift.",
        "Jangan tergoda malas-malasan — siang ini masih banyak yang bisa dicapai.",
        "Kamu sudah di tengah perjalanan — terus jalan, jangan berbalik.",
        "Rasa lelah siang ini adalah bukti kamu bekerja sungguh-sungguh.",
    ],
    SORE: [
        "Sore ini, tutup harimu dengan hasil terbaik yang kamu bisa.",
        "Sore mengingatkan kita bahwa hari hampir usai — gunakan waktu yang tersisa.",
        "Jelang penghujung hari, berikan yang terbaik sampai akhir.",
        "Sore yang indah dimulai dari pekerjaan yang diselesaikan dengan baik.",
        "Masih ada waktu — manfaatkan setiap menitnya sebelum hari berakhir.",
        "Sore ini adalah kesempatanmu untuk menyelesaikan yang tertunda.",
        "Jangan kendur di sore hari — penyelesaian yang baik memberi kepuasan luar biasa.",
        "Sore adalah waktu untuk refleksi: sudah apa kamu hari ini?",
        "Tutup harimu dengan kepala tegak — kamu sudah bekerja keras.",
        "Di penghujung sore, pertahankan semangat yang sama seperti di pagi hari.",
        "Sore ini adalah bab terakhir dari hari kerjamu — tuliskan dengan baik.",
        "Lelah di sore hari adalah tanda hari yang produktif.",
        "Jangan berhenti di sore hari — sedikit lagi, kamu pasti bisa.",
        "Sore hari adalah milik mereka yang bertahan hingga akhir.",
        "Kamu sudah melalui pagi dan siang dengan baik — selesaikan sorenya juga!",
        "Istirahat boleh, tapi jangan biarkan sore berlalu tanpa hasil.",
        "Di ujung hari, yang tersisa adalah kebanggaan atas kerja kerasmu.",
        "Sore adalah momen untuk sprint terakhir — keluarkan sisa energimu.",
        "Tutup shift dengan senyuman — kamu layak bangga!",
        "Setiap sore yang produktif adalah hadiah untuk dirimu sendiri.",
    ],
    MALAM: [
        "Selamat malam! Shift malam adalah ujian dedikasi yang sesungguhnya.",
        "Malam yang hening adalah waktu terbaik untuk kerja fokus tanpa gangguan.",
        "Saat yang lain tidur, kamu berkarya — itulah yang membedakanmu.",
        "Malam ini, berikan yang terbaik untuk mereka yang mengandalkanmu.",
        "Cahaya paling terang sering bersinar di tengah kegelapan malam.",
        "Pekerja malam adalah pahlawan yang tidak semua orang lihat.",
        "Malam membawa ketenangan — gunakan untuk produktivitas yang luar biasa.",
        "Di malam hari, pikiran jernih membawa solusi terbaik.",
        "Kamu memilih hadir saat orang lain istirahat — itu sebuah keberanian.",
        "Malam ini mungkin panjang, tapi tekadmu lebih panjang dari itu.",
        "Shift malam mengajarkan kita: kualitas kerja tidak bergantung waktu.",
        "Terima kasih sudah hadir di saat yang tidak banyak orang mau.",
        "Malam ini, dedikasi dan tanggung jawabmu adalah inspirasi.",
        "Tidak ada yang sia-sia dari kerja keras di malam hari.",
        "Malam ini kamu menjaga agar roda terus berputar — itu bermakna besar.",
        "Kelelahan malam ini akan berbuah kebanggaan di pagi hari.",
        "Bintang hanya terlihat di malam hari — seperti kamu, bersinar saat dibutuhkan.",
        "Jaga semangatmu malam ini — karena apa yang kamu lakukan penting.",
        "Di bawah langit malam, kamu membuktikan bahwa kerja keras tidak mengenal waktu.",
        "Selamat bekerja malam ini — dedikasi terbaikmu tidak akan terlupakan.",
    ]
};

// Helper: ambil pool sesuai jam sekarang
function getQuotePoolByTime() {
    const period = getRealtimeGreeting(); // 'PAGI' | 'SIANG' | 'SORE' | 'MALAM'
    return MOTIVATIONAL_QUOTES_BY_TIME[period] || MOTIVATIONAL_QUOTES_BY_TIME.PAGI;
}

// Helper: hitung index deterministik dari seed (per hari + per staff + per periode)
function getDailyQuoteIndex(pool, staff) {
    const now = new Date();
    const period = getRealtimeGreeting();
    const seed = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${period}${staff ? staff.id : ''}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % pool.length;
}

// Kept for backward compatibility (used in edge cases)
const MOTIVATIONAL_QUOTES = [
    ...MOTIVATIONAL_QUOTES_BY_TIME.PAGI,
    ...MOTIVATIONAL_QUOTES_BY_TIME.SIANG,
    ...MOTIVATIONAL_QUOTES_BY_TIME.SORE,
    ...MOTIVATIONAL_QUOTES_BY_TIME.MALAM,
];

// ----------------------------------------------------------------
// REALTIME GREETING CLOCK — update setiap menit selama bioView aktif
// ----------------------------------------------------------------
let _bioGreetingTimer = null;

function getRealtimeGreeting() {
    const hour = new Date().getHours();
    if (hour >= 4  && hour < 10) return 'PAGI';
    if (hour >= 10 && hour < 15) return 'SIANG';
    if (hour >= 15 && hour < 18) return 'SORE';
    return 'MALAM';
}

function _renderGreetingEl() {
    const el = document.getElementById('bioGreetingTime');
    if (!el) return;
    const greeting = getRealtimeGreeting();
    el.innerHTML = `
        <span style="display:inline-block;width:28px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,191,36,0.6));"></span>
        HAI, SELAMAT ${greeting}
        <span style="display:inline-block;width:28px;height:1px;background:linear-gradient(90deg,rgba(251,191,36,0.6),transparent);"></span>
    `;
    // Also refresh quote when the greeting period changes
    const quoteEl = document.getElementById('bioMotivationQuote');
    if (quoteEl && window._bioStaffRef) {
        const pool = getQuotePoolByTime();
        const idx  = getDailyQuoteIndex(pool, window._bioStaffRef);
        quoteEl.textContent = `"${pool[idx]}"`;
    }
}

function startBioGreetingClock() {
    _renderGreetingEl(); // render langsung
    clearInterval(_bioGreetingTimer);
    // hitung sisa detik ke menit berikutnya agar tick tepat di detik ke-0
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(() => {
        _renderGreetingEl();
        _bioGreetingTimer = setInterval(_renderGreetingEl, 60_000);
    }, msToNextMinute);
}

function stopBioGreetingClock() {
    clearInterval(_bioGreetingTimer);
    _bioGreetingTimer = null;
}

function updateBioView() {
    const greetingTimeEl = document.getElementById("bioGreetingTime");
    const greetingNameEl = document.getElementById("bioGreetingName");
    const motivationQuoteEl = document.getElementById("bioMotivationQuote");
    
    if (!greetingTimeEl || !greetingNameEl || !motivationQuoteEl) return;
    
    const staff = state.currentStaff;
    
    if (!staff) {
        greetingTimeEl.textContent = "HALO, SELAMAT DATANG";
        greetingNameEl.textContent = "SILAKAN LOGIN DAHULU";
        motivationQuoteEl.textContent = '"Silakan masuk melalui menu Izin Istirahat untuk melihat biodata Anda."';
        return;
    }
    
    // Store staff ref for the greeting clock (used by _renderGreetingEl)
    window._bioStaffRef = staff;

    // Determine greeting based on realtime clock (updates every minute via startBioGreetingClock)
    startBioGreetingClock(); // sets innerHTML immediately and starts auto-refresh timer
    greetingNameEl.textContent = staff.name.toUpperCase();
    
    // Pick quote from the pool matching current time period.
    // Seed = YYYYMMDD + period + staff.id → same quote all day per period,
    // changes at 00:00 (day change) AND at 10:00, 15:00, 18:00 (period change).
    const quotePool = getQuotePoolByTime();
    const quoteIdx  = getDailyQuoteIndex(quotePool, staff);
    motivationQuoteEl.textContent = `"${quotePool[quoteIdx]}"`;

    // Apply rules card visibility + content from settings
    applyRulesCardSettings();
}

window.updateBioView = updateBioView;
