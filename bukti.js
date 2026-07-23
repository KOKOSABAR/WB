/**
 * ==========================================================================
 * BUKTI LOGIC - DOC BUKTI WORKSPACE
 * ==========================================================================
 */

// Helper Constants
const BANK_OPTIONS = ["BCA", "BNI", "BRI", "BSI", "CIMB", "DANA", "DANAMON", "GOPAY", "JAGO", "LINKAJA", "MANDIRI", "MAYBANK", "OVO", "SEABANK"];
const WALLET_SHORTCUTS = { DANA: "3901", OVO: "39358", LINKAJA: "09110", GOPAY: "70001" };
const DEFAULT_KETERANGAN = ["REK TIDAK VALID", "REK BEDA NAMA", "KONFIRMASI NAMA REK", "REVISI BEDA NAMA REK", "WITHDRAW BELUM PREMIUM", "WITHDRAW PL LIMIT", "NAMA KURANG LENGKAP", "REKENING TERDORMANT", "BUTUH BUKTI", "REVISI NAMA", "CEK LIMIT PL", "DONE"];
const DEFAULT_KET_TAMBAHAN = ["KENDALA SELESAI", "KENDALA BELUM SELESAI"];
const DEFAULT_LOCKED_BY = ["OPERATOR 1", "OPERATOR 2", "OPERATOR 3", "SUPERVISOR 1", "SUPERVISOR 2", "ADMIN", "SYSTEM"];
const DEFAULT_UNLOCKED_BY = ["SUPERVISOR 1", "SUPERVISOR 2", "SUPERVISOR 3", "ADMIN", "OWNER"];

// State Variables
let buktiState = {
    validation: [],
    lockPl: [],
    geserG: [],
    wdBesar: [],
    categories: [],
    options: {
        keterangan: [],
        ketTambahan: [],
        lockedBy: [],
        unlockedBy: []
    },
    authorized: false,
    filterDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0]
};

// Calculate Shortcut code for bank and account number
function calculateShortcut(bank, norek) {
    const acc = norek ? String(norek).trim() : "";
    if (!acc) return "";
    const bankUpper = bank ? String(bank).trim().toUpperCase() : "";
    const prefix = WALLET_SHORTCUTS[bankUpper];
    return prefix ? `${prefix}${acc}` : acc;
}

// Get operator name helper
function getOperatorName() {
    const el = document.getElementById("headerStaffName");
    const val = el ? el.innerText : "";
    return (val && val !== "Nama Staff") ? val.toUpperCase() : "OPERATOR 1";
}

// Clean currency/nominal string helper to handle decimals like .00 or ,00
function cleanNominalValue(str) {
    if (!str) return "";
    let clean = String(str).trim();
    if (clean.length > 3) {
        const last3 = clean.substring(clean.length - 3);
        if ((last3.startsWith(".") || last3.startsWith(",")) && /^[0-9]{2}$/.test(last3.substring(1))) {
            clean = clean.substring(0, clean.length - 3);
        }
    }
    return clean.replace(/[^0-9]/g, "");
}

// Utility to copy to clipboard
function copyToClipboard(text, message = "Teks berhasil disalin!") {
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') {
            showToast(message, "success");
        } else {
            alert(message);
        }
    }).catch(err => {
        console.error("Gagal menyalin:", err);
    });
}

// Open screenshot preview in a dashboard modal instead of tab
function openBuktiScreenshot(url) {
    if (!url) return;
    const modal = document.getElementById("modalBuktiImagePreview");
    const img = document.getElementById("buktiPreviewImage");
    const iframe = document.getElementById("buktiPreviewFrame");
    const notice = document.getElementById("buktiPreviewNotice");
    const noticeBtn = document.getElementById("buktiPreviewNoticeBtn");
    const label = document.getElementById("buktiPreviewUrlLabel");
    const openBtn = document.getElementById("buktiPreviewOpenBtn");
    
    if (modal) {
        if (label) label.innerText = url;
        if (openBtn) openBtn.href = url;
        
        // Hide all initially
        if (img) img.style.display = "none";
        if (iframe) iframe.style.display = "none";
        if (notice) notice.style.display = "none";
        
        const lowercaseUrl = url.toLowerCase();
        
        // Determine if it is a direct image URL based on extensions
        const isDirectImage = lowercaseUrl.endsWith(".png") || 
                              lowercaseUrl.endsWith(".jpg") || 
                              lowercaseUrl.endsWith(".jpeg") || 
                              lowercaseUrl.endsWith(".gif") || 
                              lowercaseUrl.endsWith(".webp") ||
                              lowercaseUrl.startsWith("data:image/");
                              
        if (isDirectImage) {
            if (img) {
                img.src = url;
                img.style.display = "block";
            }
            modal.classList.remove("hide");
        } else {
            // Check if the domain is known to block iframe embedding (like Lightshot/Imgur/Postimages)
            const isIframeBlocked = lowercaseUrl.includes("prnt.sc") || 
                                    lowercaseUrl.includes("prntscr.com") || 
                                    lowercaseUrl.includes("imgur.com") || 
                                    lowercaseUrl.includes("postimg.cc") || 
                                    lowercaseUrl.includes("postimages.org") ||
                                    lowercaseUrl.includes("ibb.co");
                                    
            if (isIframeBlocked) {
                if (label) label.innerText = "Mengambil gambar pratinjau...";
                
                // Fetch the HTML via a free CORS proxy to parse the og:image
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
                fetch(proxyUrl)
                    .then(res => {
                        if (!res.ok) throw new Error("Proxy error");
                        return res.json();
                    })
                    .then(data => {
                        const html = data.contents;
                        // Search for og:image meta tags or screenshot image class/id
                        const match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                                      html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i) ||
                                      html.match(/id=["']screenshot-image["'][^>]+src=["']([^"']+)["']/i) ||
                                      html.match(/class=["']no-click screenshot-image["'][^>]+src=["']([^"']+)["']/i);
                                      
                        if (match && match[1]) {
                            let imgSrc = match[1];
                            if (imgSrc.startsWith("//")) {
                                imgSrc = "https:" + imgSrc;
                            }
                            // Check if retrieved image is not just page itself (sometimes og:image equals page url on error)
                            if (imgSrc === url) throw new Error("Direct image URL not found");
                            
                            if (img) {
                                img.src = imgSrc;
                                img.style.display = "block";
                            }
                            if (label) label.innerText = url;
                        } else {
                            throw new Error("Direct image tag not found");
                        }
                    })
                    .catch(err => {
                        console.error("Gagal scraping gambar:", err);
                        if (label) label.innerText = "Gagal memuat gambar secara langsung.";
                        if (notice) {
                            notice.style.display = "flex";
                            if (noticeBtn) noticeBtn.href = url;
                        }
                    });
            } else {
                // Non-blocked page (like sleekshot), display inside iframe
                if (iframe) {
                    iframe.src = url;
                    iframe.style.display = "block";
                }
            }
            modal.classList.remove("hide");
        }
    }
}

// Self-healing fallback if image fails to load (switches to iframe)
function handlePreviewImageError() {
    const img = document.getElementById("buktiPreviewImage");
    const iframe = document.getElementById("buktiPreviewFrame");
    const openBtn = document.getElementById("buktiPreviewOpenBtn");
    
    if (img && iframe && openBtn && img.style.display !== "none") {
        img.style.display = "none";
        iframe.src = openBtn.href;
        iframe.style.display = "block";
    }
}

// Helper to check if Supabase is connected
function isSupabaseConnected() {
    return typeof supabaseClient !== 'undefined' && supabaseClient !== null;
}

// Sync local data with Supabase database
async function syncWithSupabase() {
    if (!isSupabaseConnected()) return;
    
    console.log("Menghubungkan ke Supabase untuk sinkronisasi...");
    
    // 1. Fetch Categories
    try {
        const { data: catData, error: catError } = await supabaseClient.from('bukti_categories').select('*');
        if (!catError && catData) {
            buktiState.categories = catData.map(c => ({ id: c.id, name: c.name, color: c.color }));
            localStorage.setItem("validation_categories", JSON.stringify(buktiState.categories));
        }
    } catch (err) {
        console.error("Gagal sinkronisasi kategori dari Supabase:", err);
    }
    
    // 2. Fetch Options
    try {
        const { data: optData, error: optError } = await supabaseClient.from('bukti_options').select('*');
        if (!optError && optData) {
            buktiState.options.keterangan = optData.filter(o => o.type === 'keterangan').map(o => o.value);
            buktiState.options.ketTambahan = optData.filter(o => o.type === 'ketTambahan').map(o => o.value);
            buktiState.options.lockedBy = optData.filter(o => o.type === 'lockedBy').map(o => o.value);
            buktiState.options.unlockedBy = optData.filter(o => o.type === 'unlockedBy').map(o => o.value);
            
            localStorage.setItem("lockpl_keterangan_options_v2", JSON.stringify(buktiState.options.keterangan));
            localStorage.setItem("lockpl_ket_tambahan_options_v2", JSON.stringify(buktiState.options.ketTambahan));
            localStorage.setItem("lockpl_locked_by_options", JSON.stringify(buktiState.options.lockedBy));
            localStorage.setItem("lockpl_unlocked_by_options", JSON.stringify(buktiState.options.unlockedBy));
        }
    } catch (err) {
        console.error("Gagal sinkronisasi opsi dari Supabase:", err);
    }
    
    // 3. Fetch Validation records
    try {
        const { data: valData, error: valError } = await supabaseClient.from('bukti_validation').select('*').limit(300);
        if (!valError && valData) {
            buktiState.validation = valData.map(v => ({
                id: v.id,
                nomorRekening: v.nomor_rekening,
                jenisBank: v.jenis_bank,
                namaRekening: v.nama_rekening,
                screenshotSesama: v.screenshot_sesama,
                screenshotCimb: v.screenshot_cimb,
                screenshotBca: v.screenshot_bca,
                createdAt: v.created_at
            }));
            localStorage.setItem("bukti_validation_records", JSON.stringify(buktiState.validation));
            renderValidationTable();
        }
    } catch (err) {
        console.error("Gagal sinkronisasi data validasi dari Supabase:", err);
    }
    
    // 4. Fetch Lock PL records
    try {
        const { data: lpData, error: lpError } = await supabaseClient.from('bukti_lock_pl').select('*').limit(300);
        if (!lpError && lpData) {
            buktiState.lockPl = lpData.map(l => ({
                id: l.id,
                tanggal: l.tanggal,
                userId: l.user_id,
                username: l.username,
                bank: l.bank,
                noRek: l.no_rek,
                nominal: Number(l.nominal),
                keterangan: l.keterangan,
                ketTambahan: l.ket_tambahan,
                status: l.status,
                lockedBy: l.locked_by,
                unlockedBy: l.unlocked_by,
                keteranganDetail: l.keterangan_detail,
                operator: l.operator,
                screenshotBca: l.screenshot_bca || "",
                screenshotCimb: l.screenshot_cimb || "",
                screenshotLain: l.screenshot_lain || ""
            }));
            localStorage.setItem("bukti_lock_pl_records", JSON.stringify(buktiState.lockPl));
            renderLockPlTable();
            updateLockPlStats();
        }
    } catch (err) {
        console.error("Gagal sinkronisasi data lock PL dari Supabase:", err);
    }
    
    // 5. Fetch Geser G records
    try {
        const { data: ggData, error: ggError } = await supabaseClient.from('bukti_geser_g').select('*').limit(300);
        if (!ggError && ggData) {
            buktiState.geserG = ggData.map(g => ({
                id: g.id,
                tanggal: g.tanggal,
                bank: g.bank,
                status: g.status,
                operator: g.operator,
                jam: g.jam,
                sebelumNorek: g.norek_lama,
                sebelumNama: g.nama_lama,
                sesudahNorek: g.norek_baru,
                sesudahNama: g.nama_baru
            }));
            localStorage.setItem("bukti_geser_g_records", JSON.stringify(buktiState.geserG));
            renderGeserGTable();
        }
    } catch (err) {
        console.error("Gagal sinkronisasi data geser G dari Supabase:", err);
    }
    
    // 6. Fetch WD Besar records
    try {
        const { data: wdBData, error: wdBError } = await supabaseClient.from('bukti_wd_besar').select('*').limit(300);
        if (!wdBError && wdBData) {
            buktiState.wdBesar = wdBData.map(w => ({
                id: w.id,
                tanggal: w.tanggal,
                userId: w.username,
                bank: w.bank,
                noRek: w.no_rek,
                namaRek: w.nama_rek,
                nominal: Number(w.nominal),
                status: w.status,
                operator: w.operator,
                jam: w.jam,
                keterangan: w.keterangan
            }));
            localStorage.setItem("bukti_wd_kendala_records", JSON.stringify(buktiState.wdBesar));
            renderWdKendalaTable();
        }
    } catch (err) {
        console.error("Gagal sinkronisasi data WD besar dari Supabase:", err);
    }
}

// Reset form fields to select mode
function resetFieldToSelect(baseId) {
    const wrapper = document.getElementById(`${baseId}Wrapper`);
    if (!wrapper) return;
    wrapper.innerHTML = "";
    const select = document.createElement("select");
    select.id = baseId;
    select.className = "form-control";
    select.style.width = "100%";
    select.style.background = "#1e1b4b";
    select.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    select.style.color = "white";
    select.style.borderRadius = "8px";
    select.style.height = "42px";
    wrapper.appendChild(select);
}

// Toggle field between select options and manual text input
function toggleFieldMode(baseId) {
    const wrapper = document.getElementById(`${baseId}Wrapper`);
    if (!wrapper) return;
    
    const currentControl = wrapper.firstElementChild;
    if (!currentControl) return;
    
    const isSelect = currentControl.tagName.toLowerCase() === "select";
    
    if (isSelect) {
        // Switch to Input
        const input = document.createElement("input");
        input.type = "text";
        input.id = baseId;
        input.className = "form-control";
        input.placeholder = "Ketik manual...";
        input.style.width = "100%";
        input.style.background = "rgba(255, 255, 255, 0.05)";
        input.style.border = "1px solid rgba(255, 255, 255, 0.1)";
        input.style.color = "white";
        input.style.borderRadius = "8px";
        input.style.padding = "10px 12px";
        input.style.height = "42px";
        input.style.boxSizing = "border-box";
        
        wrapper.innerHTML = "";
        wrapper.appendChild(input);
        input.focus();
    } else {
        // Switch to Select
        const select = document.createElement("select");
        select.id = baseId;
        select.className = "form-control";
        select.style.width = "100%";
        select.style.background = "#1e1b4b";
        select.style.border = "1px solid rgba(255, 255, 255, 0.1)";
        select.style.color = "white";
        select.style.borderRadius = "8px";
        select.style.height = "42px";
        
        wrapper.innerHTML = "";
        wrapper.appendChild(select);
        
        // Populate select options
        if (baseId === "lpLockedBy") {
            select.innerHTML = `<option value="">-- PENDING / NONE --</option>` + buktiState.options.lockedBy.map(x => `<option value="${x}">${x}</option>`).join("");
        } else if (baseId === "lpUnlockedBy") {
            select.innerHTML = `<option value="">-- PENDING / NONE --</option>` + buktiState.options.unlockedBy.map(x => `<option value="${x}">${x}</option>`).join("");
        } else if (baseId === "lpKeterangan") {
            select.innerHTML = buktiState.options.keterangan.map(x => `<option value="${x}">${x}</option>`).join("");
        } else if (baseId === "lpKetTambahan") {
            select.innerHTML = `<option value="">-- PENDING / NONE --</option>` + buktiState.options.ketTambahan.map(x => `<option value="${x}">${x}</option>`).join("");
        }
    }
}

// Helper to set Lock PL field value, switching to manual input mode if value is custom
function setLockPlFieldWithValue(baseId, value) {
    const wrapper = document.getElementById(`${baseId}Wrapper`);
    if (!wrapper) {
        const input = document.getElementById(baseId);
        if (input) {
            input.value = value ? String(value).trim() : "";
        }
        return;
    }
    
    const val = value ? String(value).trim() : "";
    
    // Check if options contains the value
    let options = [];
    if (baseId === "lpLockedBy") {
        options = buktiState.options.lockedBy;
    } else if (baseId === "lpUnlockedBy") {
        options = buktiState.options.unlockedBy;
    } else if (baseId === "lpKeterangan") {
        options = buktiState.options.keterangan;
    } else if (baseId === "lpKetTambahan") {
        options = buktiState.options.ketTambahan;
    }
    
    const exists = options.some(opt => opt.toUpperCase() === val.toUpperCase()) || val === "";
    
    if (exists) {
        // Render as Select
        wrapper.innerHTML = "";
        const select = document.createElement("select");
        select.id = baseId;
        select.className = "form-control";
        select.style.width = "100%";
        select.style.background = "#1e1b4b";
        select.style.border = "1px solid rgba(255, 255, 255, 0.1)";
        select.style.color = "white";
        select.style.borderRadius = "8px";
        select.style.height = "42px";
        wrapper.appendChild(select);
        
        // Populate options
        if (baseId === "lpLockedBy") {
            select.innerHTML = `<option value="">-- PENDING / NONE --</option>` + buktiState.options.lockedBy.map(x => `<option value="${x}">${x}</option>`).join("");
        } else if (baseId === "lpUnlockedBy") {
            select.innerHTML = `<option value="">-- PENDING / NONE --</option>` + buktiState.options.unlockedBy.map(x => `<option value="${x}">${x}</option>`).join("");
        } else if (baseId === "lpKeterangan") {
            select.innerHTML = buktiState.options.keterangan.map(x => `<option value="${x}">${x}</option>`).join("");
        } else if (baseId === "lpKetTambahan") {
            select.innerHTML = `<option value="">-- PENDING / NONE --</option>` + buktiState.options.ketTambahan.map(x => `<option value="${x}">${x}</option>`).join("");
        }
        
        select.value = val;
    } else {
        // Render as Input
        wrapper.innerHTML = "";
        const input = document.createElement("input");
        input.type = "text";
        input.id = baseId;
        input.className = "form-control";
        input.placeholder = "Ketik manual...";
        input.style.width = "100%";
        input.style.background = "rgba(255, 255, 255, 0.05)";
        input.style.border = "1px solid rgba(255, 255, 255, 0.1)";
        input.style.color = "white";
        input.style.borderRadius = "8px";
        input.style.padding = "10px 12px";
        input.style.height = "42px";
        input.style.boxSizing = "border-box";
        wrapper.appendChild(input);
        
        input.value = val;
    }
}

// Set Lock PL date field to today
function setLockPlDateToday() {
    const el = document.getElementById("lpTanggal");
    if (el) {
        el.value = new Date().toISOString().split("T")[0];
    }
}

// Dynamically render validation category pills
function renderQuickCategoryPills() {
    const container = document.getElementById("valQuickCategoryPills");
    if (!container) return;
    container.innerHTML = "";
    
    buktiState.categories.forEach(cat => {
        const pill = document.createElement("button");
        pill.className = `category-pill category-pill-${cat.color || 'slate'}`;
        pill.type = "button";
        pill.innerHTML = `<i class="fa-solid fa-circle"></i> ${cat.name}`;
        
        pill.onclick = () => {
            const nameInput = document.getElementById("valNama");
            if (nameInput) {
                let currentVal = nameInput.value.trim();
                buktiState.categories.forEach(c => {
                    currentVal = currentVal.replace(new RegExp(`\\s*-\\s*${c.name}`, "gi"), "");
                });
                
                if (currentVal) {
                    nameInput.value = `${currentVal} - ${cat.name}`;
                } else {
                    nameInput.value = cat.name;
                }
                
                nameInput.dispatchEvent(new Event("change"));
            }
        };
        container.appendChild(pill);
    });
}

// Dynamically update the live shortcut code preview in validation modal
function updateValidationShortcutPreview() {
    const norek = document.getElementById("valNorek")?.value || "";
    const bank = document.getElementById("valBank")?.value || "";
    const previewEl = document.getElementById("valShortcutPreview");
    if (!previewEl) return;
    
    if (!norek.trim()) {
        previewEl.innerText = "Masukkan nomor rekening untuk melihat shortcut";
        previewEl.style.color = "rgba(255, 255, 255, 0.4)";
    } else {
        const sc = calculateShortcut(bank, norek);
        previewEl.innerText = sc;
        previewEl.style.color = "#f59e0b";
    }
}

// Initialize View
function initBuktiView() {
    loadBuktiData();
    setupBuktiTabs();
    
    // Bind global date selector
    const dateInput = document.getElementById("buktiFilterDate");
    if (dateInput) {
        dateInput.value = buktiState.filterDate;
        dateInput.addEventListener("change", (e) => {
            buktiState.filterDate = e.target.value;
            renderValidationTable();
            renderLockPlTable();
            renderGeserGTable();
            renderWdKendalaTable();
        });
    }
    
    // Render all tables
    renderValidationTable();
    renderLockPlTable();
    renderGeserGTable();
    renderWdKendalaTable();
    updateLockPlStats();
    
    // Setup event listeners for forms and actions
    setupBuktiEventListeners();
    
    // Check Sheets Authorization state
    const isAuth = sessionStorage.getItem("google_sheets_authorized") === "true";
    buktiState.authorized = isAuth;
    updateSheetsAuthorizationUI();
    
    // Asynchronously load data from Supabase
    syncWithSupabase();
}

// Load data from LocalStorage
function loadBuktiData() {
    buktiState.validation = JSON.parse(localStorage.getItem("bukti_validation_records")) || [];
    buktiState.lockPl = JSON.parse(localStorage.getItem("bukti_lock_pl_records")) || [];
    buktiState.geserG = JSON.parse(localStorage.getItem("bukti_geser_g_records")) || [];
    buktiState.wdBesar = JSON.parse(localStorage.getItem("bukti_wd_kendala_records")) || [];
    
    // Load categories
    buktiState.categories = JSON.parse(localStorage.getItem("validation_categories")) || [
        { id: "cat-1", name: "TIDAK VALID", color: "red" },
        { id: "cat-2", name: "BELUM PREMIUM", color: "amber" },
        { id: "cat-3", name: "TERDORMANT", color: "purple" }
    ];
    
    // Load Dropdown Options
    buktiState.options.keterangan = JSON.parse(localStorage.getItem("lockpl_keterangan_options_v2")) || DEFAULT_KETERANGAN;
    buktiState.options.ketTambahan = JSON.parse(localStorage.getItem("lockpl_ket_tambahan_options_v2")) || DEFAULT_KET_TAMBAHAN;
    buktiState.options.lockedBy = JSON.parse(localStorage.getItem("lockpl_locked_by_options")) || DEFAULT_LOCKED_BY;
    buktiState.options.unlockedBy = JSON.parse(localStorage.getItem("lockpl_unlocked_by_options")) || DEFAULT_UNLOCKED_BY;
}

// Save data to LocalStorage
defSave = (key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
};

async function saveBuktiData(type) {
    if (type === 'validation') defSave("bukti_validation_records", buktiState.validation);
    if (type === 'lockPl') defSave("bukti_lock_pl_records", buktiState.lockPl);
    if (type === 'geserG') defSave("bukti_geser_g_records", buktiState.geserG);
    if (type === 'wdBesar') defSave("bukti_wd_kendala_records", buktiState.wdBesar);
    if (type === 'categories') defSave("validation_categories", buktiState.categories);
    if (type === 'options') {
        defSave("lockpl_keterangan_options_v2", buktiState.options.keterangan);
        defSave("lockpl_ket_tambahan_options_v2", buktiState.options.ketTambahan);
        defSave("lockpl_locked_by_options", buktiState.options.lockedBy);
        defSave("lockpl_unlocked_by_options", buktiState.options.unlockedBy);
    }
    
    // Synchronize to Supabase in background
    if (!isSupabaseConnected()) return;
    if (typeof supabaseClient.from !== 'function') return;
    
    try {
        if (type === 'validation') {
            const rows = buktiState.validation.filter(v => v).map(v => ({
                id: v.id,
                nomor_rekening: v.nomorRekening,
                jenis_bank: v.jenisBank,
                nama_rekening: v.namaRekening,
                screenshot_sesama: v.screenshotSesama || "",
                screenshot_cimb: v.screenshotCimb || "",
                screenshot_bca: v.screenshotBca || "",
                created_at: v.createdAt || new Date().toISOString()
            }));
            if (rows.length > 0) {
                await supabaseClient.from('bukti_validation').upsert(rows);
            }
        }
        if (type === 'lockPl') {
            const rows = buktiState.lockPl.filter(l => l).map(l => ({
                id: l.id,
                tanggal: l.tanggal,
                user_id: l.userId || "",
                username: l.username,
                bank: l.bank,
                no_rek: l.noRek || "",
                nominal: Number(l.nominal || 0),
                keterangan: l.keterangan || "",
                ket_tambahan: l.ketTambahan || "",
                status: l.status || "PENDING",
                locked_by: l.lockedBy || "",
                unlocked_by: l.unlockedBy || "",
                keterangan_detail: l.keteranganDetail || "",
                operator: l.operator || "",
                screenshot_bca: l.screenshotBca || "",
                screenshot_cimb: l.screenshotCimb || "",
                screenshot_lain: l.screenshotLain || ""
            }));
            if (rows.length > 0) {
                await supabaseClient.from('bukti_lock_pl').upsert(rows);
            }
        }
        if (type === 'geserG') {
            const rows = buktiState.geserG.filter(g => g).map(g => ({
                id: g.id,
                tanggal: g.tanggal,
                bank: g.bank,
                status: g.status,
                operator: g.operator || "",
                jam: g.jam || "",
                norek_lama: g.sebelumNorek || "",
                nama_lama: g.sebelumNama || "",
                norek_baru: g.sesudahNorek || "",
                nama_baru: g.sesudahNama || ""
            }));
            if (rows.length > 0) {
                await supabaseClient.from('bukti_geser_g').upsert(rows);
            }
        }
        if (type === 'wdBesar') {
            const rows = buktiState.wdBesar.filter(w => w).map(w => ({
                id: w.id,
                tanggal: w.tanggal,
                username: w.userId,
                bank: w.bank,
                no_rek: w.noRek || "",
                nama_rek: w.namaRek || "",
                nominal: Number(w.nominal || 0),
                status: w.status || "PENDING",
                operator: w.operator || "",
                jam: w.jam || "",
                keterangan: w.keterangan || ""
            }));
            if (rows.length > 0) {
                await supabaseClient.from('bukti_wd_besar').upsert(rows);
            }
        }
        if (type === 'categories') {
            const rows = buktiState.categories.map(c => ({
                id: c.id,
                name: c.name,
                color: c.color
            }));
            if (rows.length > 0) {
                await supabaseClient.from('bukti_categories').upsert(rows);
            }
        }
        if (type === 'options') {
            let rows = [];
            buktiState.options.keterangan.forEach((v, i) => rows.push({ id: `opt-ket-${i}`, type: 'keterangan', value: v }));
            buktiState.options.ketTambahan.forEach((v, i) => rows.push({ id: `opt-tamb-${i}`, type: 'ketTambahan', value: v }));
            buktiState.options.lockedBy.forEach((v, i) => rows.push({ id: `opt-lock-${i}`, type: 'lockedBy', value: v }));
            buktiState.options.unlockedBy.forEach((v, i) => rows.push({ id: `opt-unlock-${i}`, type: 'unlockedBy', value: v }));
            
            // Delete old options and insert fresh ones
            await supabaseClient.from('bukti_options').delete().neq('id', '');
            if (rows.length > 0) {
                await supabaseClient.from('bukti_options').insert(rows);
            }
        }
    } catch (err) {
        console.error("Gagal sinkronisasi data ke Supabase:", err);
    }
}

// Tab Switching
function setupBuktiTabs() {
    const tabBtns = document.querySelectorAll("#buktiTabMenu .btn-tab");
    tabBtns.forEach(btn => {
        // Remove existing listener to prevent duplicate triggers
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
    });
    
    const freshTabBtns = document.querySelectorAll("#buktiTabMenu .btn-tab");
    freshTabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-bukti-target");
            
            freshTabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const contentSections = document.querySelectorAll("#buktiView .absensi-tab-content");
            contentSections.forEach(sec => sec.classList.remove("active"));
            
            const targetSec = document.getElementById(targetId);
            if (targetSec) {
                targetSec.classList.add("active");
            }
        });
    });
}

// ==========================================================================
// 1. VALIDASI LOGIC
// ==========================================================================
// Bank badge styling helper matching screenshot aesthetics
function getBankBadge(bank) {
    const b = String(bank || "").toUpperCase().trim();
    let bg = "rgba(255, 255, 255, 0.08)";
    let color = "white";
    let border = "1px solid rgba(255, 255, 255, 0.1)";
    
    if (b === "BCA") {
        bg = "rgba(59, 130, 246, 0.15)";
        color = "#60a5fa";
        border = "1px solid rgba(59, 130, 246, 0.2)";
    } else if (b === "BNI") {
        bg = "rgba(249, 115, 22, 0.15)";
        color = "#fb923c";
        border = "1px solid rgba(249, 115, 22, 0.2)";
    } else if (b === "BRI") {
        bg = "rgba(29, 78, 216, 0.15)";
        color = "#93c5fd";
        border = "1px solid rgba(29, 78, 216, 0.2)";
    } else if (b === "MANDIRI") {
        bg = "rgba(234, 179, 8, 0.15)";
        color = "#facc15";
        border = "1px solid rgba(234, 179, 8, 0.2)";
    } else if (b === "CIMB") {
        bg = "rgba(220, 38, 38, 0.15)";
        color = "#f87171";
        border = "1px solid rgba(220, 38, 38, 0.2)";
    } else if (b === "DANA") {
        bg = "rgba(6, 182, 212, 0.15)";
        color = "#22d3ee";
        border = "1px solid rgba(6, 182, 212, 0.2)";
    } else if (b === "GOPAY") {
        bg = "rgba(16, 185, 129, 0.15)";
        color = "#34d399";
        border = "1px solid rgba(16, 185, 129, 0.2)";
    } else if (b === "OVO") {
        bg = "rgba(168, 85, 247, 0.15)";
        color = "#c084fc";
        border = "1px solid rgba(168, 85, 247, 0.2)";
    } else if (b === "LINKAJA") {
        bg = "rgba(225, 29, 72, 0.15)";
        color = "#fb7185";
        border = "1px solid rgba(225, 29, 72, 0.2)";
    }
    
    return `<span class="badge" style="background: ${bg}; color: ${color}; border: ${border}; font-weight: 800; padding: 4px 10px; border-radius: 6px; font-size: 0.72rem; letter-spacing: 0.5px;">${b}</span>`;
}

// Screenshot cell icon layout helper
function getScreenshotCell(url) {
    if (!url) return '-';
    return `
        <div style="display: inline-flex; gap: 10px; align-items: center; justify-content: center;">
            <span onclick="openBuktiScreenshot('${url}')" style="cursor: pointer; color: #94a3b8; font-size: 0.95rem; display: inline-flex; align-items: center; transition: color 0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='#94a3b8'" title="Pratinjau Bukti"><i class="fa-regular fa-eye"></i></span>
            <a href="${url}" target="_blank" style="color: #64748b; font-size: 0.85rem; display: inline-flex; align-items: center; transition: color 0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='#64748b'" title="Buka di Tab Baru"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        </div>
    `;
}

function renderValidationTable() {
    const tbody = document.getElementById("buktiValidasiTbody");
    if (!tbody) return;
    
    const searchVal = (document.getElementById("searchValidasi")?.value || "").toLowerCase().trim();
    const filterBank = document.getElementById("filterValidasiBank")?.value || "ALL";
    
    tbody.innerHTML = "";
    
    const filtered = buktiState.validation.filter(r => {
        const acc = String(r.nomorRekening || "");
        const name = String(r.namaRekening || "");
        const sc = String(r.shortcut || "");
        
        const matchSearch = acc.toLowerCase().includes(searchVal) || name.toLowerCase().includes(searchVal) || sc.toLowerCase().includes(searchVal);
        const matchBank = filterBank === "ALL" || r.jenisBank === filterBank;
        
        const rDate = r.createdAt ? r.createdAt.substring(0, 10) : "";
        const matchDate = rDate === buktiState.filterDate;
        
        return matchSearch && matchBank && matchDate;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">Tidak ada data validasi ditemukan.</td></tr>`;
        return;
    }
    
    const frag = document.createDocumentFragment();
    filtered.forEach((r, idx) => {
        const tr = document.createElement("tr");
        
        // Highlight logic based on categories matching account name
        const nameUpper = (r.namaRekening || "").toUpperCase().trim();
        let bgStyle = "";
        let borderLeft = "";
        let textColor = "";
        let isValid = true;
        let isUnvalidated = false;
        
        if (!nameUpper) {
            // Not validated yet (Nama Rekening is empty)
            isUnvalidated = true;
            bgStyle = "rgba(148, 163, 184, 0.05)";
            borderLeft = "4px solid #64748b"; // Slate/grey border
            textColor = "#94a3b8"; // Muted text
        } else {
            for (const cat of buktiState.categories) {
                if (nameUpper.includes(cat.name.toUpperCase())) {
                    isValid = false;
                    if (cat.color === "red") {
                        bgStyle = "rgba(239, 68, 68, 0.06)";
                        borderLeft = "4px solid #ef4444";
                        textColor = "#fecaca";
                    } else if (cat.color === "amber") {
                        bgStyle = "rgba(245, 158, 11, 0.06)";
                        borderLeft = "4px solid #f59e0b";
                        textColor = "#fef3c7";
                    } else if (cat.color === "purple") {
                        bgStyle = "rgba(168, 85, 247, 0.06)";
                        borderLeft = "4px solid #a855f7";
                        textColor = "#f3e8ff";
                    } else if (cat.color === "blue") {
                        bgStyle = "rgba(59, 130, 246, 0.06)";
                        borderLeft = "4px solid #3b82f6";
                        textColor = "#dbeafe";
                    } else if (cat.color === "emerald") {
                        bgStyle = "rgba(16, 185, 129, 0.06)";
                        borderLeft = "4px solid #10b981";
                        textColor = "#d1fae5";
                    } else {
                        bgStyle = "rgba(148, 163, 184, 0.06)";
                        borderLeft = "4px solid #94a3b8";
                        textColor = "#f1f5f9";
                    }
                    break;
                }
            }
        }
        
        if (isValid && !isUnvalidated) {
            bgStyle = "rgba(16, 185, 129, 0.06)";
            borderLeft = "4px solid #10b981";
            textColor = "#d1fae5";
        }
        
        tr.style.background = bgStyle;
        tr.style.borderLeft = borderLeft;
        if (textColor) tr.style.color = textColor;
        
        tr.innerHTML = `
            <td>${getBankBadge(r.jenisBank)}</td>
            <td class="copyable-cell font-mono" onclick="copyToClipboard('${r.nomorRekening}', 'Nomor Rekening disalin!')" style="font-weight: 500;">${r.nomorRekening}</td>
            <td class="copyable-cell font-mono" onclick="copyToClipboard('${r.shortcut}', 'Shortcut disalin!')" style="font-weight: 700; color: #fbbf24;">
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                    ${r.shortcut} <i class="fa-regular fa-copy" style="font-size: 0.75rem; opacity: 0.6;"></i>
                </span>
            </td>
            <td class="copyable-cell" onclick="copyToClipboard('${r.namaRekening}', 'Nama Rekening disalin!')" style="font-weight: bold;">${r.namaRekening || '-'}</td>
            <td style="text-align: center;">${getScreenshotCell(r.screenshotSesama)}</td>
            <td style="text-align: center;">${getScreenshotCell(r.screenshotCimb)}</td>
            <td style="text-align: center;">${getScreenshotCell(r.screenshotBca)}</td>
            <td>
                <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
                    <button class="btn" style="width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; color: #3b82f6; cursor: pointer; transition: all 0.2s;" onclick="editValidationRecord('${r.id}')"><i class="fa-solid fa-pen" style="font-size: 0.75rem;"></i></button>
                    <button class="btn btn-danger" style="width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; cursor: pointer; transition: all 0.2s;" onclick="deleteValidationRecord('${r.id}')"><i class="fa-solid fa-trash-can" style="font-size: 0.75rem;"></i></button>
                </div>
            </td>
        `;
        frag.appendChild(tr);
    });
    tbody.appendChild(frag);
}

function openAddValidationModal() {
    document.getElementById("validationModalTitle").innerText = "Tambah Record Validasi";
    document.getElementById("validationRecordId").value = "";
    if (document.getElementById("valTanggal")) document.getElementById("valTanggal").value = buktiState.filterDate;
    document.getElementById("valNorek").value = "";
    document.getElementById("valBank").value = "BCA";
    document.getElementById("valNama").value = "";
    document.getElementById("valScSesama").value = "";
    document.getElementById("valScCimb").value = "";
    document.getElementById("valScBca").value = "";
    
    renderQuickCategoryPills();
    updateValidationShortcutPreview();
    document.getElementById("modalBuktiValidasiForm").classList.remove("hide");
}

function editValidationRecord(id) {
    const r = buktiState.validation.find(item => item.id === id);
    if (!r) return;
    
    document.getElementById("validationModalTitle").innerText = "Edit Record Validasi";
    document.getElementById("validationRecordId").value = r.id;
    if (document.getElementById("valTanggal")) {
        document.getElementById("valTanggal").value = r.createdAt ? r.createdAt.substring(0, 10) : buktiState.filterDate;
    }
    document.getElementById("valNorek").value = r.nomorRekening || "";
    document.getElementById("valBank").value = r.jenisBank || "BCA";
    document.getElementById("valNama").value = r.namaRekening || "";
    document.getElementById("valScSesama").value = r.screenshotSesama || "";
    document.getElementById("valScCimb").value = r.screenshotCimb || "";
    document.getElementById("valScBca").value = r.screenshotBca || "";
    
    renderQuickCategoryPills();
    updateValidationShortcutPreview();
    document.getElementById("modalBuktiValidasiForm").classList.remove("hide");
}

function saveValidationForm() {
    try {
        const id = document.getElementById("validationRecordId").value;
        const norek = document.getElementById("valNorek").value.trim();
        const bank = document.getElementById("valBank").value;
        const nama = document.getElementById("valNama").value.trim().toUpperCase();
        const scSesama = document.getElementById("valScSesama").value.trim();
        const scCimb = document.getElementById("valScCimb").value.trim();
        const scBca = document.getElementById("valScBca").value.trim();
        
        if (!norek) {
            alert("Nomor rekening wajib diisi!");
            return;
        }
        
        const sc = calculateShortcut(bank, norek);
        
        const dateVal = document.getElementById("valTanggal") ? document.getElementById("valTanggal").value : "";
        const formattedDate = dateVal ? dateVal + "T12:00:00.000Z" : new Date().toISOString();

        if (id) {
            // Edit mode
            const idx = buktiState.validation.findIndex(item => item.id === id);
            if (idx !== -1) {
                buktiState.validation[idx] = {
                    ...buktiState.validation[idx],
                    nomorRekening: norek,
                    jenisBank: bank,
                    namaRekening: nama,
                    screenshotSesama: scSesama,
                    screenshotCimb: scCimb,
                    screenshotBca: scBca,
                    shortcut: sc,
                    createdAt: formattedDate
                };
                showToast("Record validasi berhasil diperbarui!", "success");
            }
        } else {
            // Add mode
            const newRecord = {
                id: "val-" + Date.now(),
                nomorRekening: norek,
                jenisBank: bank,
                namaRekening: nama,
                screenshotSesama: scSesama,
                screenshotCimb: scCimb,
                screenshotBca: scBca,
                shortcut: sc,
                createdAt: formattedDate
            };
            buktiState.validation.push(newRecord);
            showToast("Record validasi baru berhasil ditambahkan!", "success");
        }
        
        saveBuktiData('validation');
        document.getElementById("modalBuktiValidasiForm").classList.add("hide");
        renderValidationTable();
    } catch (err) {
        alert("Terjadi kesalahan saat menyimpan: " + err.message + "\nStack: " + err.stack);
    }
}

function deleteValidationRecord(id) {
    showConfirm({
        title: 'Hapus Data Validasi',
        message: 'Data validasi ini akan dihapus permanen dan tidak bisa dikembalikan.',
        type: 'danger',
        okText: 'Ya, Hapus',
        onOk: () => {
            buktiState.validation = buktiState.validation.filter(item => item.id !== id);
            if (isSupabaseConnected()) {
                supabaseClient.from('bukti_validation').delete().eq('id', id).then();
            }
            saveBuktiData('validation');
            renderValidationTable();
            showToast('Record validasi berhasil dihapus.', 'success');
        }
    });
}

// Validation Categories Highlight Manager
function populateCategoriesModal() {
    const list = document.getElementById("categoriesListContainer");
    if (!list) return;
    list.innerHTML = "";
    
    buktiState.categories.forEach(cat => {
        const item = document.createElement("div");
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 8px;";
        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${cat.color === 'red' ? '#ef4444' : cat.color === 'amber' ? '#f59e0b' : cat.color === 'purple' ? '#a855f7' : cat.color === 'blue' ? '#3b82f6' : cat.color === 'emerald' ? '#10b981' : '#94a3b8'}"></span>
                <span style="font-weight: bold; font-size: 0.85rem;">${cat.name}</span>
            </div>
            <button class="btn btn-danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="deleteHighlightCategory('${cat.id}')"><i class="fa-solid fa-times"></i></button>
        `;
        list.appendChild(item);
    });
}

function addHighlightCategory() {
    const name = document.getElementById("catNameInput").value.trim().toUpperCase();
    const color = document.getElementById("catColorSelect").value;
    
    if (!name) {
        alert("Nama kategori highlight tidak boleh kosong!");
        return;
    }
    
    if (buktiState.categories.some(c => c.name.toUpperCase() === name)) {
        alert("Kategori highlight sudah terdaftar!");
        return;
    }
    
    buktiState.categories.push({
        id: "cat-" + Date.now(),
        name: name,
        color: color
    });
    
    saveBuktiData('categories');
    document.getElementById("catNameInput").value = "";
    populateCategoriesModal();
    renderValidationTable();
    showToast("Kategori highlight baru ditambahkan!", "success");
}

function deleteHighlightCategory(id) {
    buktiState.categories = buktiState.categories.filter(c => c.id !== id);
    if (isSupabaseConnected()) {
        supabaseClient.from('bukti_categories').delete().eq('id', id).then();
    }
    saveBuktiData('categories');
    populateCategoriesModal();
    renderValidationTable();
    showToast("Kategori highlight berhasil dihapus.", "success");
}

// ==========================================================================
// 2. LOCK PL LOGIC
// ==========================================================================
function updateLockPlStats() {
    const stats = {
        locked: 0,
        pending: 0,
        unlocked: 0
    };
    buktiState.lockPl.forEach(r => {
        const s = (r.status || "").toUpperCase();
        if (s === "LOCKED") stats.locked++;
        else if (s === "UNLOCKED") stats.unlocked++;
        else stats.pending++;
    });
    
    const countLocked = document.getElementById("countLockPlLocked");
    const countPending = document.getElementById("countLockPlPending");
    const countUnlocked = document.getElementById("countLockPlUnlocked");
    
    if (countLocked) countLocked.innerText = `${stats.locked} Record`;
    if (countPending) countPending.innerText = `${stats.pending} Record`;
    if (countUnlocked) countUnlocked.innerText = `${stats.unlocked} Record`;
}

function renderLockPlTable() {
    const tbody = document.getElementById("buktiLockPlTbody");
    if (!tbody) return;
    
    const searchVal = (document.getElementById("searchLockPl")?.value || "").toLowerCase().trim();
    const filterBank = document.getElementById("filterLockPlBank")?.value || "ALL";
    const filterStatus = document.getElementById("filterLockPlStatus")?.value || "ALL";
    
    tbody.innerHTML = "";
    
    const filtered = buktiState.lockPl.filter(r => {
        const id = String(r.userId || "");
        const username = String(r.username || "");
        const norek = String(r.noRek || "");
        const op = String(r.operator || "");
        const name = String(r.keteranganDetail || "");
        
        const matchSearch = id.toLowerCase().includes(searchVal) || username.toLowerCase().includes(searchVal) || norek.toLowerCase().includes(searchVal) || op.toLowerCase().includes(searchVal) || name.toLowerCase().includes(searchVal);
        const matchBank = filterBank === "ALL" || r.bank === filterBank;
        const matchStatus = filterStatus === "ALL" || r.status === filterStatus;
        
        const rDate = r.tanggal ? r.tanggal.substring(0, 10) : "";
        const matchDate = rDate === buktiState.filterDate;
        
        return matchSearch && matchBank && matchStatus && matchDate;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; color: var(--text-muted); padding: 20px;">Tidak ada data Lock PL ditemukan.</td></tr>`;
        return;
    }
    
    const frag = document.createDocumentFragment();
    filtered.forEach((r, idx) => {
        const tr = document.createElement("tr");
        
        // Row styling based on status
        let statusBadge = "";
        let trBackground = "";
        let borderLeft = "";
        const s = (r.status || "").toUpperCase();
        
        if (s === "LOCKED") {
            statusBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); font-weight: bold; padding: 3px 8px; border-radius: 6px; font-size: 0.65rem; text-transform: uppercase;">LOCKED</span>`;
            trBackground = "rgba(239, 68, 68, 0.04)";
            borderLeft = "4px solid #ef4444";
        } else if (s === "UNLOCKED") {
            statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); font-weight: bold; padding: 3px 8px; border-radius: 6px; font-size: 0.65rem; text-transform: uppercase;">UNLOCKED</span>`;
            trBackground = "rgba(16, 185, 129, 0.04)";
            borderLeft = "4px solid #10b981";
        } else {
            statusBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); font-weight: bold; padding: 3px 8px; border-radius: 6px; font-size: 0.65rem; text-transform: uppercase;">PENDING</span>`;
            trBackground = "rgba(245, 158, 11, 0.04)";
            borderLeft = "4px solid #f59e0b";
        }
        
        tr.style.background = trBackground;
        tr.style.borderLeft = borderLeft;
        
        // Date format helper
        let dateFormatted = "-";
        if (r.tanggal) {
            dateFormatted = r.tanggal.split("T")[0];
        }
        
        // Keterangan Tambahan formatting
        let ketTambahanHtml = '<span style="color: rgba(255,255,255,0.4); font-style: italic; font-size: 0.75rem;">Tidak ada</span>';
        if (r.ketTambahan && r.ketTambahan !== "PENDING" && r.ketTambahan !== "-- PENDING / NONE --" && r.ketTambahan.trim() !== "") {
            let badgeBg = "rgba(255,255,255,0.08)";
            let badgeColor = "white";
            let border = "1px solid rgba(255,255,255,0.15)";
            
            if (s === "LOCKED" || r.ketTambahan.toUpperCase().includes("BELUM") || r.ketTambahan.toUpperCase().includes("KENDALA")) {
                badgeBg = "#ef4444"; // solid bright red
                badgeColor = "white";
                border = "none";
            }
            
            ketTambahanHtml = `<span class="badge" style="background: ${badgeBg}; color: ${badgeColor}; border: ${border}; font-weight: 800; padding: 4px 8px; border-radius: 4px; font-size: 0.68rem; letter-spacing: 0.5px; text-transform: uppercase;">${r.ketTambahan}</span>`;
        }

        // Combined BY column: show locked by + unlocked by stacked
        const lockedByText = r.lockedBy && r.lockedBy !== "-- PENDING / NONE --" ? r.lockedBy : "-";
        const unlockedByText = r.unlockedBy && r.unlockedBy !== "-- PENDING / NONE --" ? r.unlockedBy : null;
        const byHtml = `<div style="display:flex;flex-direction:column;gap:2px;font-size:0.68rem;">
            <span style="color:#94a3b8;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.3px;">🔒</span>
            <span>${lockedByText}</span>
            ${unlockedByText ? `<span style="color:#94a3b8;font-size:0.6rem;margin-top:2px;">🔓</span><span>${unlockedByText}</span>` : ''}
        </div>`;
        
        tr.innerHTML = `
            <td style="padding:6px 5px;">${dateFormatted}</td>
            <td class="copyable-cell" onclick="copyToClipboard('${r.username}', 'Username disalin!')" style="font-weight: bold; padding:6px 5px;">${r.username || '-'}</td>
            <td class="copyable-cell" onclick="copyToClipboard('${r.keteranganDetail}', 'Nama Rekening disalin!')" style="font-weight: 500; padding:6px 5px;">${r.keteranganDetail || '-'}</td>
            <td style="padding:6px 5px;">${getBankBadge(r.bank)}</td>
            <td class="copyable-cell font-mono" onclick="copyToClipboard('${r.noRek}', 'Nomor rekening disalin!')" style="padding:6px 5px;">${r.noRek || '-'}</td>
            <td style="text-align: center; padding:6px 4px;">${getScreenshotCell(r.screenshotBca)}</td>
            <td style="text-align: center; padding:6px 4px;">${getScreenshotCell(r.screenshotCimb)}</td>
            <td style="text-align: center; padding:6px 4px;">${getScreenshotCell(r.screenshotLain)}</td>
            <td style="padding:6px 5px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    ${statusBadge}
                    ${s !== 'UNLOCKED' ? `<a href="#" onclick="event.preventDefault(); unlockPlFromTable('${r.id}')" style="color: #10b981; font-size: 0.65rem; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 3px; margin-top: 2px;"><i class="fa-solid fa-lock-open" style="font-size: 0.6rem;"></i> Unlock FL</a>` : ''}
                </div>
            </td>
            <td style="font-weight: bold; font-size: 0.75rem; padding:6px 5px;">${r.keterangan || '-'}</td>
            <td style="padding:6px 5px;">${ketTambahanHtml}</td>
            <td style="padding:6px 5px;">${byHtml}</td>
            <td style="padding:6px 5px;">
                <div style="display: flex; gap: 5px; justify-content: center; align-items: center;">
                    <button class="btn" style="width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; color: #3b82f6; cursor: pointer; transition: all 0.2s;" onclick="editLockPlRecord('${r.id}')"><i class="fa-solid fa-pen" style="font-size: 0.7rem;"></i></button>
                    <button class="btn" style="width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: rgba(20, 184, 166, 0.15); border: 1px solid #14b8a6; color: #14b8a6; cursor: pointer; transition: all 0.2s;" onclick="copyLockPlSummary('${r.id}')"><i class="fa-solid fa-copy" style="font-size: 0.7rem;"></i></button>
                    <button class="btn btn-danger" style="width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; cursor: pointer; transition: all 0.2s;" onclick="deleteLockPlRecord('${r.id}')"><i class="fa-solid fa-trash-can" style="font-size: 0.7rem;"></i></button>
                </div>
            </td>
        `;
        frag.appendChild(tr);
    });
    tbody.appendChild(frag);
}

function updateLockPlStatus(id, newStatus) {
    const idx = buktiState.lockPl.findIndex(item => item.id === id);
    if (idx !== -1) {
        buktiState.lockPl[idx].status = newStatus;
        saveBuktiData('lockPl');
        updateLockPlStats();
        renderLockPlTable();
        showToast(`Status berhasil diubah ke ${newStatus}`, "success");
    }
}

function copyLockPlSummary(id) {
    const r = buktiState.lockPl.find(item => item.id === id);
    if (!r) return;
    
    const formattedNominal = Number(r.nominal || 0).toLocaleString("id-ID");
    const summary = `🔒 LOCK PL BERKENDALA [${r.bank}]
User ID: ${r.userId} (${r.username || ''})
Nominal: Rp ${formattedNominal}
No Rekening: ${r.noRek || '-'}
Keterangan: ${r.keterangan || '-'}
Keterangan Detail: ${r.keteranganDetail || '-'}
Status: ${r.status} | Operator: ${r.operator || ''}`;

    copyToClipboard(summary, "Ringkasan Lock PL berhasil disalin!");
}

function parseLockPlPastedText() {
    const txt = document.getElementById("lockPlPasteBox").value;
    const msg = document.getElementById("lockPlParseMessage");
    if (!txt.trim()) {
        msg.innerText = "";
        return;
    }
    
    try {
        let isSingleLine = !txt.trim().includes("\n");
        let cols = [];
        if (isSingleLine) {
            if (txt.includes("\t")) {
                cols = txt.split("\t").map(x => x.trim()).filter(Boolean);
            } else {
                cols = txt.split(/\s{2,}/).map(x => x.trim()).filter(Boolean);
            }
            
            if (cols.length >= 3) {
                let username = "";
                let namaRek = "";
                let noRek = "";
                let bank = "BCA";
                let nominal = "0";

                // Find Bank
                let bankIdx = cols.findIndex(c => BANK_OPTIONS.some(b => b.toLowerCase() === c.toLowerCase()));
                if (bankIdx !== -1) {
                    bank = BANK_OPTIONS.find(b => b.toLowerCase() === cols[bankIdx].toLowerCase());
                    cols.splice(bankIdx, 1);
                }

                // Find Nomor Rekening (mostly digits, length >= 5)
                let noRekIdx = cols.findIndex(c => {
                    const digits = c.replace(/[^0-9]/g, "");
                    return digits.length >= 5;
                });
                if (noRekIdx !== -1) {
                    noRek = cols[noRekIdx].replace(/[^0-9]/g, "");
                    cols.splice(noRekIdx, 1);
                }

                // If one of the remaining columns is purely numeric, it could be nominal
                let nominalIdx = cols.findIndex(c => {
                    return /^\d+$/.test(c) && Number(c) > 0;
                });
                if (nominalIdx !== -1) {
                    nominal = cols[nominalIdx];
                    cols.splice(nominalIdx, 1);
                }

                // Now we have the remaining cols. If there are 2:
                if (cols.length >= 2) {
                    // Decide which is username and which is namaRekening
                    const containsSpace0 = cols[0].includes(" ");
                    const containsSpace1 = cols[1].includes(" ");
                    if (containsSpace0 && !containsSpace1) {
                        namaRek = cols[0];
                        username = cols[1];
                    } else if (containsSpace1 && !containsSpace0) {
                        namaRek = cols[1];
                        username = cols[0];
                    } else {
                        if (cols[0].length < cols[1].length) {
                            username = cols[0];
                            namaRek = cols[1];
                        } else {
                            username = cols[1];
                            namaRek = cols[0];
                        }
                    }
                } else if (cols.length === 1) {
                    username = cols[0];
                }

                // Populate fields
                if (username) document.getElementById("lpUsername").value = username;
                if (bank) document.getElementById("lpBank").value = bank;
                if (noRek) document.getElementById("lpNoRek").value = noRek;
                if (namaRek) document.getElementById("lpKetDetail").value = namaRek.toUpperCase();
                
                // Keep nominal and userId populated in hidden inputs
                document.getElementById("lpNominal").value = nominal;
                document.getElementById("lpUserId").value = username.toUpperCase();

                msg.style.color = "var(--success)";
                msg.innerText = "Data baris excel berhasil diparse otomatis!";
                return;
            }
        }
        
        // Multi-line labels parse
        const lines = txt.split("\n");
        let userId = "", username = "", bank = "BCA", noRek = "", nominal = "", ketDetail = "";
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase().trim();
            if (line.includes("user id") || line === "user id") {
                const parts = lines[i].split(/user id/i)[1];
                userId = parts ? parts.replace(/[:\s]/g, "").trim() : (lines[i+1] ? lines[i+1].trim() : "");
            }
            if (line.includes("username") || line === "username") {
                const parts = lines[i].split(/username/i)[1];
                username = parts ? parts.replace(/[:\s]/g, "").trim() : (lines[i+1] ? lines[i+1].trim() : "");
            }
            if (line.includes("bank") || line === "bank") {
                const parts = lines[i].split(/bank/i)[1];
                const cleanBank = parts ? parts.replace(/[:\s]/g, "").trim() : (lines[i+1] ? lines[i+1].trim() : "");
                const bMatch = BANK_OPTIONS.find(b => b.toLowerCase() === cleanBank.toLowerCase());
                if (bMatch) bank = bMatch;
            }
            if (line.includes("nomor rekening") || line.includes("no rek") || line.includes("norek")) {
                const parts = lines[i].split(/rekening|no rek|norek/i)[1];
                const cleanNorek = parts ? parts.replace(/[:\s]/g, "").trim() : (lines[i+1] ? lines[i+1].trim() : "");
                noRek = cleanNorek.replace(/[^0-9]/g, "");
            }
            if (line.includes("nominal") || line.includes("withdraw") || line.includes("jumlah")) {
                const parts = lines[i].split(/nominal|withdraw|jumlah/i)[1];
                const cleanNom = parts ? parts.replace(/[:\srp]/gi, "").trim() : (lines[i+1] ? lines[i+1].trim() : "");
                nominal = cleanNominalValue(cleanNom);
            }
            if (line.includes("keterangan") || line === "keterangan") {
                const parts = lines[i].split(/keterangan/i)[1];
                ketDetail = parts ? parts.replace(/[:\s]/g, "").trim() : (lines[i+1] ? lines[i+1].trim() : "");
            }
        }
        
        if (userId || username || noRek || nominal) {
            if (userId) document.getElementById("lpUserId").value = userId.toUpperCase();
            if (username) document.getElementById("lpUsername").value = username;
            document.getElementById("lpBank").value = bank;
            if (noRek) document.getElementById("lpNoRek").value = noRek;
            if (nominal) document.getElementById("lpNominal").value = nominal;
            if (ketDetail) document.getElementById("lpKetDetail").value = ketDetail;
            
            msg.style.color = "var(--success)";
            msg.innerText = "Data rincian berhasil diparse otomatis!";
        } else {
            msg.style.color = "var(--danger)";
            msg.innerText = "Format teks tidak dikenali. Silakan isi form manual.";
        }
    } catch(err) {
        console.error(err);
        msg.style.color = "var(--danger)";
        msg.innerText = "Gagal memproses teks tempel.";
    }
}

// Populate the custom select options inside the modals
function populateLockPlSelectDropdowns() {
    const ketSelect = document.getElementById("lpKeterangan");
    const tambSelect = document.getElementById("lpKetTambahan");
    const lockSelect = document.getElementById("lpLockedBy");
    const unlockSelect = document.getElementById("lpUnlockedBy");
    
    if (ketSelect) {
        ketSelect.innerHTML = buktiState.options.keterangan.map(x => `<option value="${x}">${x}</option>`).join("");
    }
    if (tambSelect) {
        tambSelect.innerHTML = `<option value="">-- PENDING / NONE --</option>` + buktiState.options.ketTambahan.map(x => `<option value="${x}">${x}</option>`).join("");
    }
    if (lockSelect && lockSelect.tagName.toLowerCase() === "select") {
        lockSelect.innerHTML = `<option value="">-- PENDING / NONE --</option>` + buktiState.options.lockedBy.map(x => `<option value="${x}">${x}</option>`).join("");
    }
    if (unlockSelect) {
        unlockSelect.innerHTML = `<option value="">-- PENDING / NONE --</option>` + buktiState.options.unlockedBy.map(x => `<option value="${x}">${x}</option>`).join("");
    }
}

function openAddLockPlModal() {
    resetFieldToSelect("lpLockedBy");
    resetFieldToSelect("lpUnlockedBy");
    resetFieldToSelect("lpKeterangan");
    resetFieldToSelect("lpKetTambahan");
    populateLockPlSelectDropdowns();
    
    document.getElementById("lockPlModalTitle").innerText = "Tambah Laporan Lock PL Berkendala Baru";
    document.getElementById("lockPlRecordId").value = "";
    document.getElementById("lockPlPasteBox").value = "";
    document.getElementById("lockPlParseMessage").innerText = "";
    
    document.getElementById("lpTanggal").value = buktiState.filterDate;
    document.getElementById("lpUserId").value = "";
    document.getElementById("lpUsername").value = "";
    document.getElementById("lpBank").value = "BCA";
    document.getElementById("lpNoRek").value = "";
    document.getElementById("lpNominal").value = "";
    document.getElementById("lpKetDetail").value = "";
    document.getElementById("lpStatus").value = "PENDING";
    const lockedByInput = document.getElementById("lpLockedBy");
    if (lockedByInput) {
        lockedByInput.value = getOperatorName();
    }
    if (document.getElementById("lpKetTambahan")) document.getElementById("lpKetTambahan").value = "";
    if (document.getElementById("lpScBca")) document.getElementById("lpScBca").value = "";
    if (document.getElementById("lpScCimb")) document.getElementById("lpScCimb").value = "";
    if (document.getElementById("lpScSesama")) document.getElementById("lpScSesama").value = "";
    
    // Set default operator to current logged-in staff
    const opVal = getOperatorName();
    document.getElementById("lpOperator").value = opVal;
    
    document.getElementById("modalBuktiLockPlForm").classList.remove("hide");
}

function editLockPlRecord(id) {
    const r = buktiState.lockPl.find(item => item.id === id);
    if (!r) return;
    
    resetFieldToSelect("lpLockedBy");
    resetFieldToSelect("lpUnlockedBy");
    resetFieldToSelect("lpKeterangan");
    resetFieldToSelect("lpKetTambahan");
    populateLockPlSelectDropdowns();
    
    document.getElementById("lockPlModalTitle").innerText = "Edit Record Lock PL";
    document.getElementById("lockPlRecordId").value = r.id;
    document.getElementById("lockPlPasteBox").value = "";
    document.getElementById("lockPlParseMessage").innerText = "";
    
    document.getElementById("lpTanggal").value = r.tanggal ? r.tanggal.split("T")[0] : new Date().toISOString().split("T")[0];
    document.getElementById("lpUserId").value = r.userId || "";
    document.getElementById("lpUsername").value = r.username || "";
    document.getElementById("lpBank").value = r.bank || "BCA";
    document.getElementById("lpNoRek").value = r.noRek || "";
    document.getElementById("lpNominal").value = r.nominal || "";
    
    setLockPlFieldWithValue("lpKeterangan", r.keterangan || "");
    setLockPlFieldWithValue("lpKetTambahan", r.ketTambahan || "");
    document.getElementById("lpStatus").value = r.status || "PENDING";
    setLockPlFieldWithValue("lpLockedBy", r.lockedBy || "");
    setLockPlFieldWithValue("lpUnlockedBy", r.unlockedBy || "");
    
    document.getElementById("lpKetDetail").value = r.keteranganDetail || "";
    document.getElementById("lpOperator").value = r.operator || "";
    
    if (document.getElementById("lpScBca")) document.getElementById("lpScBca").value = r.screenshotBca || "";
    if (document.getElementById("lpScCimb")) document.getElementById("lpScCimb").value = r.screenshotCimb || "";
    if (document.getElementById("lpScSesama")) document.getElementById("lpScSesama").value = r.screenshotLain || "";
    
    document.getElementById("modalBuktiLockPlForm").classList.remove("hide");
}

function saveLockPlForm() {
    try {
        const id = document.getElementById("lockPlRecordId").value;
        const tanggal = document.getElementById("lpTanggal").value;
        let userId = document.getElementById("lpUserId").value.trim().toUpperCase();
        const username = document.getElementById("lpUsername").value.trim();
        const bank = document.getElementById("lpBank").value;
        const noRek = document.getElementById("lpNoRek").value.trim();
        let nominal = document.getElementById("lpNominal").value.trim();
        const keterangan = document.getElementById("lpKeterangan") ? document.getElementById("lpKeterangan").value : "";
        const ketTambahan = document.getElementById("lpKetTambahan") ? document.getElementById("lpKetTambahan").value : "";
        const status = document.getElementById("lpStatus").value;
        const lockedBy = document.getElementById("lpLockedBy") ? document.getElementById("lpLockedBy").value : "";
        const unlockedBy = document.getElementById("lpUnlockedBy") ? document.getElementById("lpUnlockedBy").value : "";
        const keteranganDetail = document.getElementById("lpKetDetail").value.trim();
        let operator = document.getElementById("lpOperator").value.trim().toUpperCase();
        
        const screenshotBca = document.getElementById("lpScBca") ? document.getElementById("lpScBca").value.trim() : "";
        const screenshotCimb = document.getElementById("lpScCimb") ? document.getElementById("lpScCimb").value.trim() : "";
        const screenshotLain = document.getElementById("lpScSesama") ? document.getElementById("lpScSesama").value.trim() : "";
        
        if (!tanggal || !username || !noRek || !keteranganDetail) {
            alert("Harap isi semua kolom wajib (*)!");
            return;
        }
        
        // Auto-fill hidden fields if not populated
        if (!userId) {
            userId = username.toUpperCase();
        }
        if (!nominal) {
            nominal = "0";
        }
        if (!operator) {
            operator = lockedBy.toUpperCase() || getOperatorName();
        }
        
        if (id) {
            // Edit Mode
            const idx = buktiState.lockPl.findIndex(item => item.id === id);
            if (idx !== -1) {
                buktiState.lockPl[idx] = {
                    ...buktiState.lockPl[idx],
                    tanggal,
                    userId,
                    username,
                    bank,
                    noRek,
                    nominal: Number(nominal),
                    keterangan,
                    ketTambahan,
                    status,
                    lockedBy,
                    unlockedBy,
                    keteranganDetail,
                    operator,
                    screenshotBca,
                    screenshotCimb,
                    screenshotLain
                };
                showToast("Record Lock PL berhasil diperbarui!", "success");
            }
        } else {
            // Add Mode
            const newRecord = {
                id: "lp-" + Date.now(),
                tanggal,
                userId,
                username,
                bank,
                noRek,
                nominal: Number(nominal),
                keterangan,
                ketTambahan,
                status,
                lockedBy,
                unlockedBy,
                keteranganDetail,
                operator,
                screenshotBca,
                screenshotCimb,
                screenshotLain
            };
            buktiState.lockPl.push(newRecord);
            showToast("Record Lock PL baru ditambahkan!", "success");
        }
        
        saveBuktiData('lockPl');
        document.getElementById("modalBuktiLockPlForm").classList.add("hide");
        updateLockPlStats();
        renderLockPlTable();
    } catch (err) {
        alert("Terjadi kesalahan saat menyimpan: " + err.message + "\nStack: " + err.stack);
    }
}

function deleteLockPlRecord(id) {
    showConfirm({
        title: 'Hapus Data Lock PL',
        message: 'Data Lock PL berkendala ini akan dihapus permanen dan tidak bisa dikembalikan.',
        type: 'danger',
        okText: 'Ya, Hapus',
        onOk: () => {
            buktiState.lockPl = buktiState.lockPl.filter(item => item.id !== id);
            if (isSupabaseConnected()) {
                supabaseClient.from('bukti_lock_pl').delete().eq('id', id).then();
            }
            saveBuktiData('lockPl');
            updateLockPlStats();
            renderLockPlTable();
            showToast('Record Lock PL berhasil dihapus.', 'success');
        }
    });
}

function unlockPlFromTable(id) {
    const idx = buktiState.lockPl.findIndex(item => item.id === id);
    if (idx !== -1) {
        const currentOp = getOperatorName();
        buktiState.lockPl[idx].status = "UNLOCKED";
        buktiState.lockPl[idx].unlockedBy = currentOp;
        showToast("Record Lock PL berhasil di-unlock!", "success");
        saveBuktiData('lockPl');
        updateLockPlStats();
        renderLockPlTable();
    }
}

// Option Manager Dialog Functions
function openOptionsManager(optionType) {
    document.getElementById("optionTypeIdentifier").value = optionType;
    let titleText = "";
    let dataList = [];
    
    if (optionType === "keterangan") {
        titleText = "Kelola Opsi Keterangan";
        dataList = buktiState.options.keterangan;
    } else if (optionType === "ketTambahan") {
        titleText = "Kelola Opsi Ket Tambahan";
        dataList = buktiState.options.ketTambahan;
    } else if (optionType === "lockedBy") {
        titleText = "Kelola Opsi Locked By";
        dataList = buktiState.options.lockedBy;
    } else if (optionType === "unlockedBy") {
        titleText = "Kelola Opsi Unlocked By";
        dataList = buktiState.options.unlockedBy;
    }
    
    document.getElementById("optionsModalTitle").innerText = titleText;
    populateOptionsList(dataList);
    document.getElementById("modalManageOptions").classList.remove("hide");
}

function populateOptionsList(list) {
    const container = document.getElementById("optionsListContainer");
    if (!container) return;
    container.innerHTML = "";
    
    list.forEach((opt, idx) => {
        const item = document.createElement("div");
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 8px;";
        item.innerHTML = `
            <span style="font-weight: 600; font-size: 0.85rem;">${opt}</span>
            <button class="btn btn-danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="deleteOptionItem('${idx}')"><i class="fa-solid fa-times"></i></button>
        `;
        container.appendChild(item);
    });
}

function addOptionItem() {
    const type = document.getElementById("optionTypeIdentifier").value;
    const inputVal = document.getElementById("optionItemInput").value.trim();
    
    if (!inputVal) {
        alert("Opsi baru tidak boleh kosong!");
        return;
    }
    
    let list = [];
    if (type === "keterangan") {
        if (buktiState.options.keterangan.includes(inputVal)) return;
        buktiState.options.keterangan.push(inputVal);
        list = buktiState.options.keterangan;
    } else if (type === "ketTambahan") {
        if (buktiState.options.ketTambahan.includes(inputVal)) return;
        buktiState.options.ketTambahan.push(inputVal);
        list = buktiState.options.ketTambahan;
    } else if (type === "lockedBy") {
        const valUpper = inputVal.toUpperCase();
        if (buktiState.options.lockedBy.includes(valUpper)) return;
        buktiState.options.lockedBy.push(valUpper);
        list = buktiState.options.lockedBy;
    } else if (type === "unlockedBy") {
        const valUpper = inputVal.toUpperCase();
        if (buktiState.options.unlockedBy.includes(valUpper)) return;
        buktiState.options.unlockedBy.push(valUpper);
        list = buktiState.options.unlockedBy;
    }
    
    saveBuktiData('options');
    document.getElementById("optionItemInput").value = "";
    populateOptionsList(list);
    showToast("Opsi berhasil ditambahkan!", "success");
}

function deleteOptionItem(index) {
    const type = document.getElementById("optionTypeIdentifier").value;
    const idx = Number(index);
    let list = [];
    
    if (type === "keterangan") {
        buktiState.options.keterangan.splice(idx, 1);
        list = buktiState.options.keterangan;
    } else if (type === "ketTambahan") {
        buktiState.options.ketTambahan.splice(idx, 1);
        list = buktiState.options.ketTambahan;
    } else if (type === "lockedBy") {
        buktiState.options.lockedBy.splice(idx, 1);
        list = buktiState.options.lockedBy;
    } else if (type === "unlockedBy") {
        buktiState.options.unlockedBy.splice(idx, 1);
        list = buktiState.options.unlockedBy;
    }
    
    saveBuktiData('options');
    populateOptionsList(list);
    showToast("Opsi berhasil dihapus.", "success");
}

function resetOptionsToDefault() {
    showConfirm({
        title: 'Reset ke Default',
        message: 'Semua opsi kustom akan dikembalikan ke bawaan pabrik. Perubahan yang Anda simpan sebelumnya akan hilang.',
        type: 'warning',
        okText: 'Ya, Reset',
        onOk: () => {
            const type = document.getElementById("optionTypeIdentifier").value;
            let list = [];

            if (type === "keterangan") {
                buktiState.options.keterangan = [...DEFAULT_KETERANGAN];
                list = buktiState.options.keterangan;
            } else if (type === "ketTambahan") {
                buktiState.options.ketTambahan = [...DEFAULT_KET_TAMBAHAN];
                list = buktiState.options.ketTambahan;
            } else if (type === "lockedBy") {
                buktiState.options.lockedBy = [...DEFAULT_LOCKED_BY];
                list = buktiState.options.lockedBy;
            } else if (type === "unlockedBy") {
                buktiState.options.unlockedBy = [...DEFAULT_UNLOCKED_BY];
                list = buktiState.options.unlockedBy;
            }

            saveBuktiData('options');
            populateOptionsList(list);
            showToast("Opsi disetel kembali ke bawaan pabrik.", "success");
        }
    });
}

// ==========================================================================
// 3. GESER / GANTI G LOGIC
// ==========================================================================
function renderGeserGTable() {
    const tbody = document.getElementById("buktiGeserGTbody");
    if (!tbody) return;
    
    const searchVal = (document.getElementById("searchGeserG")?.value || "").toLowerCase().trim();
    
    tbody.innerHTML = "";
    
    const filtered = buktiState.geserG.filter(r => {
        const beforeNorek = String(r.sebelumNorek || "");
        const beforeNama = String(r.sebelumNama || "");
        const afterNorek = String(r.sesudahNorek || "");
        const afterNama = String(r.sesudahNama || "");
        const op = String(r.operator || "");
        
        const matchSearch = beforeNorek.includes(searchVal) || beforeNama.toLowerCase().includes(searchVal) || afterNorek.includes(searchVal) || afterNama.toLowerCase().includes(searchVal) || op.toLowerCase().includes(searchVal) || r.bank.toLowerCase().includes(searchVal);
        
        const rDate = r.tanggal ? r.tanggal.substring(0, 10) : "";
        const matchDate = rDate === buktiState.filterDate;
        
        return matchSearch && matchDate;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 20px;">Tidak ada data geser/ganti G ditemukan.</td></tr>`;
        return;
    }
    
    const frag = document.createDocumentFragment();
    filtered.forEach((r, idx) => {
        const tr = document.createElement("tr");
        
        // Status styling
        const s = (r.status || "").toUpperCase();
        let statusBadge = "";
        let trBackground = "";
        
        if (s === "DONE" || s === "SUCCESS") {
            statusBadge = `<span class="badge" style="background: var(--success); font-weight: bold; cursor: default;">DONE ✓</span>`;
            trBackground = "rgba(16, 185, 129, 0.05)";
        } else {
            statusBadge = `<span class="badge badge-pending-dbl" title="Klik untuk tandai DONE" onclick="quickDoneGeserG('${r.id}', this)" style="background: var(--warning); font-weight: bold; cursor: pointer; user-select: none;">PENDING</span>`;
            trBackground = "rgba(245, 158, 11, 0.05)";
        }
        
        tr.style.background = trBackground;
        
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td><span class="badge" style="background: rgba(255,255,255,0.08); font-weight: bold;">${r.bank}</span></td>
            <td>
                <div style="display: flex; flex-direction: column;">
                    <span class="copyable-cell" onclick="copyToClipboard('${r.sebelumNama}', 'Nama sebelum disalin!')" style="font-weight: bold;">${r.sebelumNama}</span>
                    <span class="copyable-cell font-mono" onclick="copyToClipboard('${r.sebelumNorek}', 'Norek sebelum disalin!')" style="font-size: 0.8rem; color: var(--text-muted);">${r.sebelumNorek}</span>
                </div>
            </td>
            <td>
                <div style="display: flex; flex-direction: column;">
                    <span class="copyable-cell" onclick="copyToClipboard('${r.sesudahNama}', 'Nama sesudah disalin!')" style="font-weight: bold;">${r.sesudahNama}</span>
                    <span class="copyable-cell font-mono" onclick="copyToClipboard('${r.sesudahNorek}', 'Norek sesudah disalin!')" style="font-size: 0.8rem; color: var(--text-muted);">${r.sesudahNorek}</span>
                </div>
            </td>
            <td>${statusBadge}</td>
            <td><small>${r.operator || '-'}</small></td>
            <td class="font-mono">${r.jam || '-'}</td>
            <td>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="btn" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(99, 102, 241, 0.2); border: 1px solid #6366f1;" onclick="editGeserGRecord('${r.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(20, 184, 166, 0.2); border: 1px solid #14b8a6;" onclick="copyGeserGSummary('${r.id}')"><i class="fa-solid fa-copy"></i></button>
                    <button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444;" onclick="deleteGeserGRecord('${r.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        frag.appendChild(tr);
    });
    tbody.appendChild(frag);
}

// Single-click PENDING badge → instant DOM update, deferred save, background Supabase
function quickDoneGeserG(id, badgeEl) {
    const idx = buktiState.geserG.findIndex(item => item.id === id);
    if (idx === -1) return;

    const operatorName = getOperatorName();
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

    // 1. Update in-memory state (zero cost)
    buktiState.geserG[idx].status   = 'DONE';
    buktiState.geserG[idx].operator = operatorName;
    buktiState.geserG[idx].jam      = timeStr;

    // 2. Update only the clicked badge cell — NO full table re-render
    if (badgeEl) {
        const td = badgeEl.closest('td');
        badgeEl.outerHTML = `<span class="badge" style="background: var(--success); font-weight: bold; cursor: default;">DONE ✓</span>`;
        // Update operator & jam cells in same row
        const row = td ? td.closest('tr') : null;
        if (row) {
            row.style.background = 'rgba(16, 185, 129, 0.05)';
            row.style.borderLeft = '4px solid #10b981';
            const cells = row.querySelectorAll('td');
            // operator = 6th cell (index 5), jam = 7th (index 6)
            if (cells[5]) cells[5].innerHTML = `<small>${operatorName}</small>`;
            if (cells[6]) cells[6].textContent = timeStr;
        }
    }

    // 3. Show toast immediately
    showToast(`✅ DONE — ${operatorName}`, 'success');

    // 4. Defer localStorage save (non-blocking, runs when browser is idle)
    const saveId = id;
    (window.requestIdleCallback || setTimeout)(function() {
        localStorage.setItem('bukti_geser_g_records', JSON.stringify(buktiState.geserG));
    }, { timeout: 2000 });

    // 5. Fire-and-forget Supabase sync
    if (typeof supabase !== 'undefined') {
        supabase.from('bukti_geser_g').update({
            status: 'DONE',
            operator: operatorName,
            jam: timeStr
        }).eq('id', id).then(({ error }) => {
            if (error) console.warn('Supabase sync quickDoneGeserG:', error);
        });
    }
}

// Single-click status badge → cycle status instantly in memory, DOM, and Supabase for WD Besar
function quickToggleWdStatus(id, badgeEl) {
    const idx = buktiState.wdBesar.findIndex(item => item.id === id);
    if (idx === -1) return;

    const currentStatus = (buktiState.wdBesar[idx].status || 'PENDING').toUpperCase();
    let newStatus = 'PENDING';
    if (currentStatus === 'PENDING') newStatus = 'PROSES';
    else if (currentStatus === 'PROSES') newStatus = 'TAHAN';
    else if (currentStatus === 'TAHAN') newStatus = 'SUCCESS';
    else if (currentStatus === 'SUCCESS') newStatus = 'PENDING';

    const operatorName = getOperatorName();
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

    // 1. Update state
    buktiState.wdBesar[idx].status = newStatus;
    buktiState.wdBesar[idx].operator = operatorName;
    buktiState.wdBesar[idx].jam = timeStr;

    // 2. Surgical DOM update
    if (badgeEl) {
        let badgeBg = 'var(--warning)';
        let trBg = 'rgba(245, 158, 11, 0.05)';
        if (newStatus === 'PROSES') {
            badgeBg = '#3b82f6';
            trBg = 'rgba(59, 130, 246, 0.05)';
        } else if (newStatus === 'TAHAN') {
            badgeBg = '#ef4444';
            trBg = 'rgba(239, 68, 68, 0.05)';
        } else if (newStatus === 'SUCCESS') {
            badgeBg = 'var(--success)';
            trBg = 'rgba(16, 185, 129, 0.05)';
        }

        badgeEl.textContent = newStatus;
        badgeEl.style.background = badgeBg;

        const tr = badgeEl.closest('tr');
        if (tr) {
            tr.style.background = trBg;
            const cells = tr.querySelectorAll('td');
            // operator = 6th cell (index 5), jam = 7th (index 6)
            if (cells[5]) cells[5].innerHTML = `<small>${operatorName}</small>`;
            if (cells[6]) cells[6].textContent = timeStr;
        }
    }

    showToast(`✅ Status WD diubah ke ${newStatus} — ${operatorName}`, 'success');

    // 3. Defer localStorage save
    (window.requestIdleCallback || setTimeout)(function() {
        localStorage.setItem('bukti_wd_kendala_records', JSON.stringify(buktiState.wdBesar));
    }, { timeout: 2000 });

    // 4. Supabase sync in background
    if (typeof supabase !== 'undefined') {
        supabase.from('bukti_wd_besar').update({
            status: newStatus,
            operator: operatorName,
            jam: timeStr
        }).eq('id', id).then(({ error }) => {
            if (error) console.warn('Supabase sync quickToggleWdStatus:', error);
        });
    }
}


function copyGeserGSummary(id) {
    const r = buktiState.geserG.find(item => item.id === id);
    if (!r) return;
    
    const summary = `🔄 GESER/GANTI G [${r.bank}]
Sebelum: ${r.sebelumNama} (${r.sebelumNorek})
Sesudah: ${r.sesudahNama} (${r.sesudahNorek})
Status: ${r.status}${r.operator ? ` | Operator: ${r.operator}` : ""} | Jam: ${r.jam || ''}`;

    copyToClipboard(summary, "Ringkasan Geser G disalin!");
}

function openAddGeserGModal() {
    document.getElementById("geserGModalTitle").innerText = "Tambah Record Geser G";
    document.getElementById("geserGRecordId").value = "";
    document.getElementById("ggBank").value = "BCA";
    document.getElementById("ggSebelumNama").value = "";
    document.getElementById("ggSebelumNorek").value = "";
    document.getElementById("ggSesudahNama").value = "";
    document.getElementById("ggSesudahNorek").value = "";
    document.getElementById("ggStatus").value = "PENDING";
    
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0].substring(0, 5);
    document.getElementById("ggJam").value = timeStr;
    
    const opVal = getOperatorName();
    document.getElementById("ggOperator").value = opVal;
    
    document.getElementById("modalBuktiGeserGForm").classList.remove("hide");
}

function editGeserGRecord(id) {
    const r = buktiState.geserG.find(item => item.id === id);
    if (!r) return;
    
    document.getElementById("geserGModalTitle").innerText = "Edit Record Geser G";
    document.getElementById("geserGRecordId").value = r.id;
    document.getElementById("ggBank").value = r.bank || "BCA";
    document.getElementById("ggSebelumNama").value = r.sebelumNama || "";
    document.getElementById("ggSebelumNorek").value = r.sebelumNorek || "";
    document.getElementById("ggSesudahNama").value = r.sesudahNama || "";
    document.getElementById("ggSesudahNorek").value = r.sesudahNorek || "";
    document.getElementById("ggStatus").value = r.status || "PENDING";
    document.getElementById("ggJam").value = r.jam || "";
    document.getElementById("ggOperator").value = r.operator || "";
    
    document.getElementById("modalBuktiGeserGForm").classList.remove("hide");
}

function saveGeserGForm() {
    try {
        const id = document.getElementById("geserGRecordId").value;
        const bank = document.getElementById("ggBank").value;
        const sebelumNama = document.getElementById("ggSebelumNama").value.trim().toUpperCase();
        const sebelumNorek = document.getElementById("ggSebelumNorek").value.trim();
        const sesudahNama = document.getElementById("ggSesudahNama").value.trim().toUpperCase();
        const sesudahNorek = document.getElementById("ggSesudahNorek").value.trim();
        const status = document.getElementById("ggStatus").value;
        const jam = document.getElementById("ggJam").value;
        const operator = document.getElementById("ggOperator").value.trim().toUpperCase();
        
        if (!sebelumNama || !sebelumNorek || !sesudahNama || !sesudahNorek) {
            alert("Seluruh data nama dan rekening wajib diisi!");
            return;
        }
        
        const todayLocal = buktiState.filterDate;
        
        if (id) {
            // Edit Mode
            const idx = buktiState.geserG.findIndex(item => item.id === id);
            if (idx !== -1) {
                const existing = buktiState.geserG[idx];
                buktiState.geserG[idx] = {
                    ...existing,
                    bank,
                    sebelumNama,
                    sebelumNorek,
                    sesudahNama,
                    sesudahNorek,
                    status,
                    jam,
                    operator,
                    tanggal: existing.tanggal || todayLocal
                };
                showToast("Record Geser G berhasil diperbarui!", "success");
            }
        } else {
            // Add Mode
            const newRecord = {
                id: "gg-" + Date.now(),
                bank,
                sebelumNama,
                sebelumNorek,
                sesudahNama,
                sesudahNorek,
                status,
                jam,
                operator,
                tanggal: todayLocal
            };
            buktiState.geserG.push(newRecord);
            showToast("Record Geser G baru ditambahkan!", "success");
        }
        
        saveBuktiData('geserG');
        document.getElementById("modalBuktiGeserGForm").classList.add("hide");
        renderGeserGTable();
    } catch (err) {
        alert("Terjadi kesalahan saat menyimpan: " + err.message + "\nStack: " + err.stack);
    }
}

function deleteGeserGRecord(id) {
    showConfirm({
        title: 'Hapus Data Geser G',
        message: 'Data Geser / Ganti G ini akan dihapus permanen dan tidak bisa dikembalikan.',
        type: 'danger',
        okText: 'Ya, Hapus',
        onOk: () => {
            buktiState.geserG = buktiState.geserG.filter(item => item.id !== id);
            if (isSupabaseConnected()) {
                supabaseClient.from('bukti_geser_g').delete().eq('id', id).then();
            }
            saveBuktiData('geserG');
            renderGeserGTable();
            showToast('Record Geser G berhasil dihapus.', 'success');
        }
    });
}

// ==========================================================================
// 4. WD BESAR & KENDALA LOGIC
// ==========================================================================
function renderWdKendalaTable() {
    const tbody = document.getElementById("buktiWdKendalaTbody");
    if (!tbody) return;
    
    const searchVal = (document.getElementById("searchWdKendala")?.value || "").toLowerCase().trim();
    
    tbody.innerHTML = "";
    
    const filtered = buktiState.wdBesar.filter(r => {
        const uid = String(r.userId || "");
        const op = String(r.operator || "");
        const nom = String(r.nominal || "");
        
        const matchSearch = uid.toLowerCase().includes(searchVal) || op.toLowerCase().includes(searchVal) || nom.includes(searchVal) || r.bank.toLowerCase().includes(searchVal);
        
        const rDate = r.tanggal ? r.tanggal.substring(0, 10) : "";
        const matchDate = rDate === buktiState.filterDate;
        
        return matchSearch && matchDate;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">Tidak ada data WD Besar & Kendala ditemukan.</td></tr>`;
        return;
    }
    
    const frag = document.createDocumentFragment();
    filtered.forEach((r, idx) => {
        const tr = document.createElement("tr");
        
        // Status styling
        const s = (r.status || "PENDING").toUpperCase();
        let statusBadge = "";
        let trBackground = "rgba(245, 158, 11, 0.05)";
        let badgeBg = "var(--warning)";

        if (s === "PROSES") {
            badgeBg = "#3b82f6";
            trBackground = "rgba(59, 130, 246, 0.05)";
        } else if (s === "TAHAN") {
            badgeBg = "#ef4444";
            trBackground = "rgba(239, 68, 68, 0.05)";
        } else if (s === "SUCCESS") {
            badgeBg = "var(--success)";
            trBackground = "rgba(16, 185, 129, 0.05)";
        }

        statusBadge = `<span class="badge badge-pending-dbl" title="Klik untuk ubah status" onclick="quickToggleWdStatus('${r.id}', this)" style="background: ${badgeBg}; font-weight: bold; cursor: pointer; user-select: none;">${s}</span>`;
        tr.style.background = trBackground;
        
        // Format nominal
        let nominalFormatted = "-";
        if (r.nominal) {
            nominalFormatted = Number(r.nominal).toLocaleString("id-ID");
        }
        
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td class="copyable-cell" onclick="copyToClipboard('${r.userId}', 'User ID disalin!')" style="font-weight: bold;">${r.userId}</td>
            <td><span class="badge" style="background: rgba(255,255,255,0.08); font-weight: bold;">${r.bank}</span></td>
            <td class="copyable-cell" onclick="copyToClipboard('${r.nominal}', 'Nominal disalin!')" style="font-weight: bold; color: #f59e0b;">Rp ${nominalFormatted}</td>
            <td>${statusBadge}</td>
            <td><small>${r.operator || '-'}</small></td>
            <td class="font-mono">${r.jam || '-'}</td>
            <td>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="btn" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(99, 102, 241, 0.2); border: 1px solid #6366f1;" onclick="editWdKendalaRecord('${r.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(20, 184, 166, 0.2); border: 1px solid #14b8a6;" onclick="copyWdKendalaSummary('${r.id}')"><i class="fa-solid fa-copy"></i></button>
                    <button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444;" onclick="deleteWdKendalaRecord('${r.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        frag.appendChild(tr);
    });
    tbody.appendChild(frag);
}

function copyWdKendalaSummary(id) {
    const r = buktiState.wdBesar.find(item => item.id === id);
    if (!r) return;
    
    const formattedNominal = Number(r.nominal || 0).toLocaleString("id-ID");
    const summary = `💰 WD BESAR & KENDALA [${r.bank}]
User ID: ${r.userId}
Nominal: Rp ${formattedNominal}
Status: ${r.status}${r.operator ? ` | Operator: ${r.operator}` : ""} | Jam: ${r.jam || ''}`;

    copyToClipboard(summary, "Ringkasan WD disalin!");
}

function parseWdKendalaPastedText() {
    const txt = document.getElementById("wdPasteBox").value;
    const msg = document.getElementById("wdParseMessage");
    if (!txt.trim()) {
        msg.innerText = "";
        return;
    }
    
    try {
        let rows = [];
        if (txt.includes("\t")) {
            // Excel/Spreadsheet copy parse
            rows = txt.split("\t").map(x => x.trim()).filter(Boolean);
            if (rows.length >= 4) {
                document.getElementById("wdUserId").value = rows[0] || "";
                
                const bankMatch = BANK_OPTIONS.find(b => b.toLowerCase() === (rows[3] || "").toLowerCase());
                if (bankMatch) document.getElementById("wdBank").value = bankMatch;
                
                const timeMatch = (rows[6] || "").match(/(\d{2}):(\d{2})/);
                if (timeMatch) document.getElementById("wdJam").value = `${timeMatch[1]}:${timeMatch[2]}`;
                
                const rawNominal = cleanNominalValue(rows[8] || rows[rows.length - 1] || "");
                document.getElementById("wdNominal").value = rawNominal;
                
                msg.style.color = "var(--success)";
                msg.innerText = "Data baris excel berhasil diparse otomatis!";
                return;
            }
        }
        
        // Multi-line labels parse
        const lines = txt.split("\n");
        let userId = "", bank = "BCA", nominal = "";
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase().trim();
            if (line.includes("user id") || line === "user id") {
                const parts = lines[i].split(/user id/i)[1];
                userId = parts ? parts.replace(/[:\s]/g, "").trim() : (lines[i+1] ? lines[i+1].trim() : "");
            }
            if (line.includes("bank") || line === "bank") {
                const parts = lines[i].split(/bank/i)[1];
                const cleanBank = parts ? parts.replace(/[:\s]/g, "").trim() : (lines[i+1] ? lines[i+1].trim() : "");
                const bMatch = BANK_OPTIONS.find(b => b.toLowerCase() === cleanBank.toLowerCase());
                if (bMatch) bank = bMatch;
            }
            if (line.includes("nominal") || line.includes("withdraw") || line.includes("jumlah")) {
                const parts = lines[i].split(/nominal|withdraw|jumlah/i)[1];
                const cleanNom = parts ? parts.replace(/[:\srp]/gi, "").trim() : (lines[i+1] ? lines[i+1].trim() : "");
                nominal = cleanNominalValue(cleanNom);
            }
        }
        
        if (userId || nominal) {
            if (userId) document.getElementById("wdUserId").value = userId.toUpperCase();
            document.getElementById("wdBank").value = bank;
            if (nominal) document.getElementById("wdNominal").value = nominal;
            
            msg.style.color = "var(--success)";
            msg.innerText = "Rincian data berhasil diparse otomatis!";
        } else {
            // Raw number parsing as nominal
            const cleanNum = cleanNominalValue(txt);
            if (cleanNum && !isNaN(Number(cleanNum))) {
                document.getElementById("wdNominal").value = cleanNum;
                msg.style.color = "var(--success)";
                msg.innerText = "Nominal berhasil diparse otomatis!";
            } else {
                msg.style.color = "var(--danger)";
                msg.innerText = "Format teks tidak dikenali. Silakan isi manual.";
            }
        }
    } catch(err) {
        console.error(err);
        msg.style.color = "var(--danger)";
        msg.innerText = "Gagal memproses teks tempel.";
    }
}

function openAddWdKendalaModal() {
    document.getElementById("wdKendalaModalTitle").innerText = "Tambah Record WD Kendala";
    document.getElementById("wdKendalaRecordId").value = "";
    document.getElementById("wdPasteBox").value = "";
    document.getElementById("wdParseMessage").innerText = "";
    
    document.getElementById("wdUserId").value = "";
    document.getElementById("wdBank").value = "BCA";
    document.getElementById("wdNominal").value = "";
    document.getElementById("wdStatus").value = "PENDING";
    
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0].substring(0, 5);
    document.getElementById("wdJam").value = timeStr;
    
    const opVal = getOperatorName();
    document.getElementById("wdOperator").value = opVal;
    
    document.getElementById("modalBuktiWdKendalaForm").classList.remove("hide");
}

function editWdKendalaRecord(id) {
    const r = buktiState.wdBesar.find(item => item.id === id);
    if (!r) return;
    
    document.getElementById("wdKendalaModalTitle").innerText = "Edit Record WD Kendala";
    document.getElementById("wdKendalaRecordId").value = r.id;
    document.getElementById("wdPasteBox").value = "";
    document.getElementById("wdParseMessage").innerText = "";
    
    document.getElementById("wdUserId").value = r.userId || "";
    document.getElementById("wdBank").value = r.bank || "BCA";
    document.getElementById("wdNominal").value = r.nominal || "";
    document.getElementById("wdStatus").value = r.status || "PENDING";
    document.getElementById("wdJam").value = r.jam || "";
    document.getElementById("wdOperator").value = r.operator || "";
    
    document.getElementById("modalBuktiWdKendalaForm").classList.remove("hide");
}

function saveWdKendalaForm() {
    try {
        const id = document.getElementById("wdKendalaRecordId").value;
        const userId = document.getElementById("wdUserId").value.trim().toUpperCase();
        const bank = document.getElementById("wdBank").value;
        const nominal = document.getElementById("wdNominal").value.trim();
        const status = document.getElementById("wdStatus").value;
        const jam = document.getElementById("wdJam").value;
        const operator = document.getElementById("wdOperator").value.trim().toUpperCase();
        
        if (!userId || !nominal) {
            alert("User ID dan Nominal wajib diisi!");
            return;
        }
        
        const todayLocal = buktiState.filterDate;
        
        if (id) {
            // Edit Mode
            const idx = buktiState.wdBesar.findIndex(item => item.id === id);
            if (idx !== -1) {
                const existing = buktiState.wdBesar[idx];
                buktiState.wdBesar[idx] = {
                    ...existing,
                    userId,
                    bank,
                    nominal: Number(nominal),
                    status,
                    jam,
                    operator,
                    tanggal: existing.tanggal || todayLocal
                };
                showToast("Record WD Kendala berhasil diperbarui!", "success");
            }
        } else {
            // Add Mode
            const newRecord = {
                id: "wd-" + Date.now(),
                userId,
                bank,
                nominal: Number(nominal),
                status,
                jam,
                operator,
                tanggal: todayLocal
            };
            buktiState.wdBesar.push(newRecord);
            showToast("Record WD Kendala baru ditambahkan!", "success");
        }
        
        saveBuktiData('wdBesar');
        document.getElementById("modalBuktiWdKendalaForm").classList.add("hide");
        renderWdKendalaTable();
    } catch (err) {
        alert("Terjadi kesalahan saat menyimpan: " + err.message + "\nStack: " + err.stack);
    }
}

function deleteWdKendalaRecord(id) {
    showConfirm({
        title: 'Hapus Data WD Kendala',
        message: 'Data WD Kendala ini akan dihapus permanen dan tidak bisa dikembalikan.',
        type: 'danger',
        okText: 'Ya, Hapus',
        onOk: () => {
            buktiState.wdBesar = buktiState.wdBesar.filter(item => item.id !== id);
            if (isSupabaseConnected()) {
                supabaseClient.from('bukti_wd_besar').delete().eq('id', id).then();
            }
            saveBuktiData('wdBesar');
            renderWdKendalaTable();
            showToast('Record WD Kendala berhasil dihapus.', 'success');
        }
    });
}

// ==========================================================================
// 5. GOOGLE SHEETS SYNC LOGIC
// ==========================================================================
function updateSheetsAuthorizationUI() {
    const gate = document.getElementById("sheetsAuthGate");
    const panel = document.getElementById("sheetsSyncPanel");
    
    buktiState.authorized = true;
    if (gate) gate.classList.add("hide");
    if (panel) panel.classList.remove("hide");
    
    const storedSpreadsheetId = localStorage.getItem("google_spreadsheet_id") || "19CGwg23Gwsu-mwJ-woiq5aX-BLfAxATXKIH2KEQ61hU";
    const storedAppScriptUrl = localStorage.getItem("google_web_app_url") || "https://script.google.com/macros/s/AKfycbzRFWaGCIXdl0k1l4AQD0HEwOAwHRtqYMpm2QHL7qyQ2beBLIjAH6ybgKIgtOEANAw-aQ/exec";
    const storedAutoSync = localStorage.getItem("google_web_app_auto_sync") !== "false";
    
    const spreadsheetIdInput = document.getElementById("sheetSpreadsheetId");
    const appScriptUrlInput = document.getElementById("sheetAppScriptUrl");
    const autoSyncToggle = document.getElementById("sheetAutoSync");
    const lastSyncLabel = document.getElementById("sheetLastSyncLabel");
    
    if (spreadsheetIdInput) spreadsheetIdInput.value = storedSpreadsheetId;
    if (appScriptUrlInput) appScriptUrlInput.value = storedAppScriptUrl;
    if (autoSyncToggle) autoSyncToggle.checked = storedAutoSync;
    if (lastSyncLabel) {
        const time = localStorage.getItem("google_web_app_last_sync") || "-";
        lastSyncLabel.innerText = time;
    }
}

function authenticateSheetsGate(event) {
    if (event) event.preventDefault();
    buktiState.authorized = true;
    sessionStorage.setItem("google_sheets_authorized", "true");
    updateSheetsAuthorizationUI();
}

function saveSheetsSettings() {
    const spreadsheetId = document.getElementById("sheetSpreadsheetId").value.trim();
    const appScriptUrl = document.getElementById("sheetAppScriptUrl").value.trim();
    const autoSync = document.getElementById("sheetAutoSync").checked;
    
    if (!spreadsheetId || !appScriptUrl) {
        alert("Spreadsheet ID dan URL Apps Script wajib diisi!");
        return;
    }
    
    localStorage.setItem("google_spreadsheet_id", spreadsheetId);
    localStorage.setItem("google_web_app_url", appScriptUrl);
    localStorage.setItem("google_web_app_auto_sync", autoSync ? "true" : "false");
    
    showToast("Pengaturan Google Sheets berhasil disimpan!", "success");
}

async function syncPushToGoogleSheets() {
    const appScriptUrl = localStorage.getItem("google_web_app_url") || "https://script.google.com/macros/s/AKfycbzRFWaGCIXdl0k1l4AQD0HEwOAwHRtqYMpm2QHL7qyQ2beBLIjAH6ybgKIgtOEANAw-aQ/exec";
    const spreadsheetId = localStorage.getItem("google_spreadsheet_id") || "19CGwg23Gwsu-mwJ-woiq5aX-BLfAxATXKIH2KEQ61hU";
    
    if (!appScriptUrl) {
        alert("Tolong simpan URL Apps Script yang valid terlebih dahulu.");
        return;
    }
    
    const pushBtn = document.getElementById("btnPushSheets");
    if (pushBtn) {
        pushBtn.disabled = true;
        pushBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...`;
    }
    
    try {
        const payload = {
            action: "push",
            spreadsheetId: spreadsheetId,
            validation: buktiState.validation,
            lockPl: buktiState.lockPl,
            geserG: buktiState.geserG,
            wdBesar: buktiState.wdBesar,
            keteranganOptions: buktiState.options.keterangan,
            ketTambahanOptions: buktiState.options.ketTambahan,
            lockedByOptions: buktiState.options.lockedBy,
            unlockedByOptions: buktiState.options.unlockedBy,
            validationCategories: buktiState.categories
        };
        
        // Mode no-cors is used on the vercel app, we follow that.
        await fetch(appScriptUrl, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(payload)
        });
        
        const timestamp = new Date().toLocaleString("id-ID");
        localStorage.setItem("google_web_app_last_sync", timestamp);
        
        const label = document.getElementById("sheetLastSyncLabel");
        if (label) label.innerText = timestamp;
        
        alert("Aksi Kirim Terkirim! Seluruh data lokal sedang disinkronkan ke Google Sheets via Web App Anda.");
        showToast("Data berhasil dikirim ke Google Sheets!", "success");
    } catch(err) {
        console.error("Gagal Sync Push:", err);
        alert("Pengiriman diproses! Silakan periksa Google Spreadsheet Anda dalam beberapa detik.");
    } finally {
        if (pushBtn) {
            pushBtn.disabled = false;
            pushBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Kirim Data (Push)`;
        }
    }
}

async function syncPullFromGoogleSheets() {
    const appScriptUrl = localStorage.getItem("google_web_app_url") || "https://script.google.com/macros/s/AKfycbzRFWaGCIXdl0k1l4AQD0HEwOAwHRtqYMpm2QHL7qyQ2beBLIjAH6ybgKIgtOEANAw-aQ/exec";
    const spreadsheetId = localStorage.getItem("google_spreadsheet_id") || "19CGwg23Gwsu-mwJ-woiq5aX-BLfAxATXKIH2KEQ61hU";
    
    if (!appScriptUrl) {
        alert("Tolong simpan URL Apps Script yang valid terlebih dahulu.");
        return;
    }
    
    const pullBtn = document.getElementById("btnPullSheets");
    if (pullBtn) {
        pullBtn.disabled = true;
        pullBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menarik...`;
    }
    
    try {
        const resp = await fetch(`${appScriptUrl}?action=pull&spreadsheetId=${spreadsheetId}`);
        const data = await resp.json();
        
        if (data && data.status === "success") {
            // Update local state with pulled records
            buktiState.validation = data.validation || [];
            buktiState.lockPl = data.lockPl || [];
            buktiState.geserG = data.geserG || [];
            buktiState.wdBesar = data.wdBesar || [];
            
            // Update local state options if available
            if (data.keteranganOptions && data.keteranganOptions.length > 0) buktiState.options.keterangan = data.keteranganOptions;
            if (data.ketTambahanOptions && data.ketTambahanOptions.length > 0) buktiState.options.ketTambahan = data.ketTambahanOptions;
            if (data.lockedByOptions && data.lockedByOptions.length > 0) buktiState.options.lockedBy = data.lockedByOptions;
            if (data.unlockedByOptions && data.unlockedByOptions.length > 0) buktiState.options.unlockedBy = data.unlockedByOptions;
            if (data.validationCategories && data.validationCategories.length > 0) buktiState.categories = data.validationCategories;
            
            // Save all to LocalStorage
            saveBuktiData('validation');
            saveBuktiData('lockPl');
            saveBuktiData('geserG');
            saveBuktiData('wdBesar');
            saveBuktiData('categories');
            saveBuktiData('options');
            
            const timestamp = new Date().toLocaleString("id-ID");
            localStorage.setItem("google_web_app_last_sync", timestamp);
            
            const label = document.getElementById("sheetLastSyncLabel");
            if (label) label.innerText = timestamp;
            
            // Re-render views
            renderValidationTable();
            renderLockPlTable();
            renderGeserGTable();
            renderWdKendalaTable();
            updateLockPlStats();
            
            alert("Berhasil menarik data dan menyinkronkan data lokal dari Google Sheets via Web App!");
            showToast("Sinkronisasi tarik data berhasil!", "success");
        } else {
            alert(`Gagal menarik data: ${data.message || "Respons tidak valid."}`);
        }
    } catch(err) {
        console.error("Gagal Sync Pull:", err);
        alert(`Gagal menarik data via Web App: ${err.message || err}.\nPastikan Web App Anda telah dideploy sebagai 'Anyone' di editor Apps Script.`);
    } finally {
        if (pullBtn) {
            pullBtn.disabled = false;
            pullBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> Tarik Data (Pull)`;
        }
    }
}

function copySheetsEmbedCode() {
    const spreadsheetId = localStorage.getItem("google_spreadsheet_id") || "19CGwg23Gwsu-mwJ-woiq5aX-BLfAxATXKIH2KEQ61hU";
    const code = `=IMPORTHTML("https://docs.google.com/spreadsheets/d/${spreadsheetId}/pubhtml", "table", 1)`;
    copyToClipboard(code, "Kode rumus Google Sheets disalin!");
}

// ==========================================================================
// 6. EVENT LISTENERS AND BINDING SETUP
// ==========================================================================
function setupBuktiEventListeners() {
    // Search inputs
    const sVal = document.getElementById("searchValidasi");
    if (sVal) {
        sVal.addEventListener("input", renderValidationTable);
    }
    const fValBank = document.getElementById("filterValidasiBank");
    if (fValBank) {
        fValBank.addEventListener("change", renderValidationTable);
    }
    
    const sLock = document.getElementById("searchLockPl");
    if (sLock) {
        sLock.addEventListener("input", renderLockPlTable);
    }
    const fLockBank = document.getElementById("filterLockPlBank");
    if (fLockBank) {
        fLockBank.addEventListener("change", renderLockPlTable);
    }
    const fLockStatus = document.getElementById("filterLockPlStatus");
    if (fLockStatus) {
        fLockStatus.addEventListener("change", renderLockPlTable);
    }
    
    const sGeser = document.getElementById("searchGeserG");
    if (sGeser) {
        sGeser.addEventListener("input", renderGeserGTable);
    }
    
    const sWd = document.getElementById("searchWdKendala");
    if (sWd) {
        sWd.addEventListener("input", renderWdKendalaTable);
    }
    
    // Paste box parsers
    const lpPaste = document.getElementById("lockPlPasteBox");
    if (lpPaste) {
        lpPaste.addEventListener("input", parseLockPlPastedText);
    }
    const wdPaste = document.getElementById("wdPasteBox");
    if (wdPaste) {
        wdPaste.addEventListener("input", parseWdKendalaPastedText);
    }
    
    // Live validation shortcut preview listeners
    const valNorekInput = document.getElementById("valNorek");
    if (valNorekInput) {
        valNorekInput.addEventListener("input", updateValidationShortcutPreview);
    }
    const valBankInput = document.getElementById("valBank");
    if (valBankInput) {
        valBankInput.addEventListener("change", updateValidationShortcutPreview);
    }
    
    const lpStatusInput = document.getElementById("lpStatus");
    if (lpStatusInput) {
        lpStatusInput.addEventListener("change", function() {
            const status = this.value;
            const lockedBySelect = document.getElementById("lpLockedBy");
            const unlockedBySelect = document.getElementById("lpUnlockedBy");
            
            if (status === "LOCKED") {
                const currentOp = getOperatorName();
                if (lockedBySelect) {
                    let optionExists = false;
                    for (let i = 0; i < lockedBySelect.options.length; i++) {
                        if (lockedBySelect.options[i].value.toUpperCase() === currentOp.toUpperCase()) {
                            lockedBySelect.value = lockedBySelect.options[i].value;
                            optionExists = true;
                            break;
                        }
                    }
                    if (!optionExists) {
                        const newOpt = document.createElement("option");
                        newOpt.value = currentOp;
                        newOpt.text = currentOp;
                        lockedBySelect.add(newOpt);
                        lockedBySelect.value = currentOp;
                    }
                }
            } else if (status === "UNLOCKED") {
                const currentOp = getOperatorName();
                if (unlockedBySelect) {
                    let optionExists = false;
                    for (let i = 0; i < unlockedBySelect.options.length; i++) {
                        if (unlockedBySelect.options[i].value.toUpperCase() === currentOp.toUpperCase()) {
                            unlockedBySelect.value = unlockedBySelect.options[i].value;
                            optionExists = true;
                            break;
                        }
                    }
                    if (!optionExists) {
                        const newOpt = document.createElement("option");
                        newOpt.value = currentOp;
                        newOpt.text = currentOp;
                        unlockedBySelect.add(newOpt);
                        unlockedBySelect.value = currentOp;
                    }
                }
            } else if (status === "PENDING") {
                if (lockedBySelect) lockedBySelect.value = "";
                if (unlockedBySelect) unlockedBySelect.value = "";
            }
        });
    }
}

// Expose functions globally for HTML event handler triggers
window.initBuktiView = initBuktiView;

// New Redesigned Modal Form Helpers
window.toggleFieldMode = toggleFieldMode;
window.setLockPlDateToday = setLockPlDateToday;

// Validation triggers
window.openAddValidationModal = openAddValidationModal;
window.saveValidationForm = saveValidationForm;
window.editValidationRecord = editValidationRecord;
window.openBuktiScreenshot = openBuktiScreenshot;
window.handlePreviewImageError = handlePreviewImageError;
window.deleteValidationRecord = deleteValidationRecord;
window.populateCategoriesModal = populateCategoriesModal;
window.addHighlightCategory = addHighlightCategory;
window.deleteHighlightCategory = deleteHighlightCategory;

// Lock PL triggers
window.openAddLockPlModal = openAddLockPlModal;
window.saveLockPlForm = saveLockPlForm;
window.editLockPlRecord = editLockPlRecord;
window.deleteLockPlRecord = deleteLockPlRecord;
window.unlockPlFromTable = unlockPlFromTable;
window.copyLockPlSummary = copyLockPlSummary;
window.updateLockPlStatus = updateLockPlStatus;
window.openOptionsManager = openOptionsManager;
window.addOptionItem = addOptionItem;
window.deleteOptionItem = deleteOptionItem;
window.resetOptionsToDefault = resetOptionsToDefault;

// Geser G triggers
window.openAddGeserGModal = openAddGeserGModal;
window.saveGeserGForm = saveGeserGForm;
window.editGeserGRecord = editGeserGRecord;
window.deleteGeserGRecord = deleteGeserGRecord;
window.copyGeserGSummary = copyGeserGSummary;

// WD Besar & Kendala triggers
window.openAddWdKendalaModal = openAddWdKendalaModal;
window.saveWdKendalaForm = saveWdKendalaForm;
window.editWdKendalaRecord = editWdKendalaRecord;
window.deleteWdKendalaRecord = deleteWdKendalaRecord;
window.copyWdKendalaSummary = copyWdKendalaSummary;

// Google Sheets Sync triggers
window.authenticateSheetsGate = authenticateSheetsGate;
window.saveSheetsSettings = saveSheetsSettings;
window.syncPushToGoogleSheets = syncPushToGoogleSheets;
window.syncPullFromGoogleSheets = syncPullFromGoogleSheets;
window.copySheetsEmbedCode = copySheetsEmbedCode;
window.copyToClipboard = copyToClipboard;
