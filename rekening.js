/* ==========================================================================
   DATA REKENING - JAVASCRIPT LOGIC
   ========================================================================== */

const LIST_STATUS_REKENING = [
    "AKTIF",
    "DI OFFKAN",
    "DI PINJAM ADM",
    "TERBLOKIR",
    "TERLOGOUT",
    "DI CABUT DARI KAS 1",
    "BERMASALAH",
    "PPATK",
    "DI KEMBALIKAN KE ADM"
];

const PRESET_JENIS_REKENING = [
    "DEPOSIT",
    "WITHDRAW",
    "KAS",
    "DANA",
    "OVO",
    "GOPAY",
    "LINKAJA"
];

const PRESET_BANK_LIST = [
    "BCA (Bank Central Asia)",
    "Bank Mandiri",
    "BRI (Bank Rakyat Indonesia)",
    "BNI (Bank Negara Indonesia)",
    "CIMB Niaga",
    "Permata Bank",
    "Bank Danamon",
    "BSI (Bank Syariah Indonesia)",
    "Panin Bank",
    "BTN (Bank Tabungan Negara)",
    "Maybank Indonesia",
    "OCBC NISP",
    "Bank Mega",
    "Bank Sinarmas",
    "SeaBank",
    "Blu by BCA Digital",
    "Bank Jago",
    "Allo Bank",
    "Bank Neo Commerce (BNC)",
    "DANA",
    "OVO",
    "GoPay",
    "ShopeePay",
    "LinkAja",
    "QRIS"
];

const SAMPLE_SCREENSHOT_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%231a1f2e" rx="16"/><rect x="20" y="20" width="560" height="360" fill="%23111522" stroke="%238b5cf6" stroke-width="2" stroke-dasharray="6 6" rx="12"/><circle cx="300" cy="140" r="45" fill="%237c3aed" fill-opacity="0.2" stroke="%23a78bfa" stroke-width="2"/><path d="M285 140l10 10 20-20" stroke="%234ade80" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="300" y="220" font-family="sans-serif" font-size="20" font-weight="bold" fill="%23ffffff" text-anchor="middle">BUKTI SCREENSHOT REKENING</text><text x="300" y="255" font-family="sans-serif" font-size="14" fill="%23a78bfa" text-anchor="middle">Verifikasi Input Data Rekening Berhasil</text><text x="300" y="310" font-family="monospace" font-size="12" fill="%2394a3b8" text-anchor="middle">WB MANAGEMENT &bull; RESTEASE SYSTEM</text></svg>`;

const rekeningState = {
    items: [],
    filters: {
        search: '',
        bank: 'ALL',
        status: 'ALL',
        jenis: 'ALL',
        expiringOnly: false,
        batchTargets: []
    },
    editingId: null
};

// HELPER PEMBERSIH NOMOR REKENING (Hapus Titik, Spasi, Dash, Tanda Baca)
function cleanAccountNumber(str) {
    if (!str) return '';
    return String(str).replace(/\D/g, '');
}
window.cleanAccountNumber = cleanAccountNumber;

// HELPER DEDUKLIFIKASI DATA REKENING
// Aturan: Jika Nama Bank BEDA (misal DANA, OVO, GoPay dengan No HP yang sama), BUKAN DUPLIKAT!
function deduplicateRekeningItems(items) {
    if (!Array.isArray(items)) return [];
    const map = new Map();
    items.forEach(item => {
        const bank = (item.nama_bank || '').toLowerCase().trim();
        const noRek = cleanAccountNumber(item.no_rekening);
        const namaRek = (item.nama_rekening || '').toLowerCase().replace(/\s+/g, ' ').trim();
        
        // Key komposit: Bank | No Rekening | Nama Rekening
        const key = bank + '|' + noRek + '|' + namaRek;

        if (!map.has(key)) {
            map.set(key, item);
        }
    });
    return Array.from(map.values());
}
window.deduplicateRekeningItems = deduplicateRekeningItems;

// 1. MEMUAT DATA REKENING (Mengganti seluruh data lama dengan dataset 952 akun terbaru)
async function fetchRekeningData() {
    const rawUserItems = (window.BASE44_REKENING_DATA && Array.isArray(window.BASE44_REKENING_DATA)) 
        ? window.BASE44_REKENING_DATA 
        : [];

    // Filter valid user records dan deduplikasi
    const filtered = rawUserItems.filter(item => item && item.no_rekening && !item.is_sample);
    const userItems = deduplicateRekeningItems(filtered);

    // Bersihkan localStorage dari data lama agar tidak ada sisa cache yang menyebabkan duplikat
    localStorage.removeItem('restease_data_rekening_cache');

    // Overwrite local items dan simpan cache baru
    rekeningState.items = userItems;
    localStorage.setItem('restease_data_rekening_cache', JSON.stringify(userItems));

    // CATATAN: Seeding ke Supabase dinonaktifkan untuk mencegah duplikat.
    // Data disajikan langsung dari BASE44_REKENING_DATA (file lokal).
}

// Background Batch Seed to Supabase
async function seedBase44ToSupabase(items) {
    if (!window.supabaseClient || !items || items.length === 0) return;
    try {
        const { data: existing } = await window.supabaseClient.from('data_rekening').select('no_rekening, nama_bank');
        const existingKeys = new Set((existing || []).map(e => ((e.nama_bank || '') + '|' + (e.no_rekening || '')).toLowerCase()));

        const newItems = items.filter(i => !existingKeys.has(((i.nama_bank || '') + '|' + (i.no_rekening || '')).toLowerCase())).map(d => ({
            status: d.status,
            nama_bank: d.nama_bank,
            nama_rekening: d.nama_rekening,
            no_rekening: d.no_rekening,
            jenis: d.jenis,
            masa_aktif: d.masa_aktif,
            is_permanent: d.is_permanent || false,
            screenshot_url: d.screenshot_url || '',
            tanggal_input: d.tanggal_input || new Date().toISOString(),
            input_by_staff_name: d.input_by_staff_name || 'STAFF',
            catatan: d.catatan || ''
        }));

        if (newItems.length > 0) {
            for (let i = 0; i < newItems.length; i += 100) {
                const chunk = newItems.slice(i, i + 100);
                await window.supabaseClient.from('data_rekening').insert(chunk);
            }
            console.log(`Berhasil menyinkronkan ${newItems.length} data rekening Base44 ke Supabase.`);
        }
    } catch (err) {
        console.warn("Background seed Base44 ke Supabase skipped/notice:", err.message);
    }
}

function getDummyRekeningData() {
    return (window.BASE44_REKENING_DATA && Array.isArray(window.BASE44_REKENING_DATA)) 
        ? window.BASE44_REKENING_DATA 
        : [];
}

// 2. HELPER MASA AKTIF & EXPIRED (< 90 HARI)
function getDaysRemaining(dateStr, isPermanent) {
    if (isPermanent || !dateStr) return 9999;
    const targetDate = new Date(dateStr);
    targetDate.setHours(23, 59, 59, 999);
    const now = new Date();
    const diffMs = targetDate - now;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function isExpiringSoon(dateStr, isPermanent) {
    if (isPermanent || !dateStr) return false;
    const days = getDaysRemaining(dateStr, isPermanent);
    return days <= 90;
}

// 3. RENDER REKENING VIEW
let _rekListenersBound = false;
async function renderDataRekeningView() {
    if (!rekeningState.items || rekeningState.items.length === 0) {
        await fetchRekeningData();
    }
    if (!_rekListenersBound) {
        setupRekeningEventListeners();
        _rekListenersBound = true;
    }
    renderRekeningStats();
    populateRekeningBankFilterOptions();
    populateRekeningStatusFilterOptions();
    populateRekeningJenisFilterOptions();
    renderRekeningTable();
}
window.renderDataRekeningView = renderDataRekeningView;

// A. STATS COUNTER
function renderRekeningStats() {
    const items = rekeningState.items;
    const total = items.length;
    const aktif = items.filter(i => i.status === 'AKTIF').length;
    const expiringItems = items.filter(i => isExpiringSoon(i.masa_aktif, i.is_permanent));
    const expiringSoon = expiringItems.length;

    // Unique Banks
    const banks = new Set(items.map(i => i.nama_bank)).size;

    const elTotal = document.getElementById('rekStatTotal');
    const elAktif = document.getElementById('rekStatAktif');
    const elExpiring = document.getElementById('rekStatExpiring');
    const elBanks = document.getElementById('rekStatBanks');

    if (elTotal) elTotal.textContent = total;
    if (elAktif) elAktif.textContent = aktif;
    if (elExpiring) elExpiring.textContent = expiringSoon;
    if (elBanks) elBanks.textContent = banks;

    // Show or hide expiring alert banner & render compact grid of expiring account cards
    const alertBanner = document.getElementById('rekExpiringAlertBanner');
    const alertListContainer = document.getElementById('rekExpiringListContainer');
    
    if (alertBanner) {
        if (expiringSoon > 0) {
            alertBanner.classList.remove('hide');
            const badgeEl = document.getElementById('rekExpiringCountBadge');
            if (badgeEl) badgeEl.textContent = `${expiringSoon} Rekening`;

            if (alertListContainer) {
                let listHtml = '';
                expiringItems.forEach(item => {
                    const daysLeft = getDaysRemaining(item.masa_aktif, item.is_permanent);
                    const daysBadge = daysLeft < 0
                        ? `<span style="background:rgba(239,68,68,0.25);color:#f87171;padding:2px 7px;border-radius:5px;font-size:0.68rem;font-weight:800;border:1px solid rgba(239,68,68,0.4);white-space:nowrap;"><i class="fa-solid fa-triangle-exclamation"></i> EXPIRED (${Math.abs(daysLeft)} Hari)</span>`
                        : `<span style="background:rgba(234,179,8,0.25);color:#fef08a;padding:2px 7px;border-radius:5px;font-size:0.68rem;font-weight:800;border:1px solid rgba(234,179,8,0.4);white-space:nowrap;"><i class="fa-solid fa-clock"></i> Sisa ${daysLeft} Hari</span>`;

                    listHtml += `
                    <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.4);border:1px solid rgba(234,179,8,0.25);padding:8px 10px;border-radius:8px;gap:8px;">
                        <div style="display:flex;align-items:center;gap:8px;overflow:hidden;flex:1;">
                            <div style="width:28px;height:28px;border-radius:6px;background:rgba(234,179,8,0.2);color:#facc15;display:flex;align-items:center;justify-content:center;font-size:0.78rem;flex-shrink:0;">
                                <i class="${getBankIconClass(item.nama_bank)}"></i>
                            </div>
                            <div style="display:flex;flex-direction:column;overflow:hidden;max-width:100%;">
                                <span style="color:white;font-weight:800;font-size:0.8rem;letter-spacing:0.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.nama_rekening)}</span>
                                <span style="color:rgba(255,255,255,0.55);font-size:0.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.nama_bank)} &bull; <span style="font-family:monospace;color:#38bdf8;">${escapeHtml(item.no_rekening)}</span></span>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                            ${daysBadge}
                            <button onclick="editRekening('${item.id}')" title="Perbarui Masa Aktif Rekening Ini" style="padding:4px 8px;background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);border-radius:6px;color:#c4b5fd;font-weight:700;font-size:0.7rem;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(139,92,246,0.35)'" onmouseout="this.style.background='rgba(139,92,246,0.2)'">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                        </div>
                    </div>
                    `;
                });
                alertListContainer.innerHTML = listHtml;
            }
        } else {
            alertBanner.classList.add('hide');
        }
    }
}

// B. POPULATE FILTER DROPDOWNS
function populateRekeningBankFilterOptions() {
    const select = document.getElementById('rekFilterBank');
    if (!select) return;

    const currentVal = select.value;
    const usedBanks = Array.from(new Set(rekeningState.items.map(i => i.nama_bank).filter(Boolean))).sort();

    let html = '<option value="ALL">Semua Bank / E-Wallet</option>';
    usedBanks.forEach(b => {
        html += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`;
    });

    select.innerHTML = html;
    if (usedBanks.includes(currentVal) || currentVal === 'ALL') {
        select.value = currentVal;
    }
}

function populateRekeningStatusFilterOptions() {
    const select = document.getElementById('rekFilterStatus');
    if (!select) return;

    const currentVal = select.value;
    let html = '<option value="ALL">Semua Status</option>';
    LIST_STATUS_REKENING.forEach(st => {
        html += `<option value="${st}">${st}</option>`;
    });

    select.innerHTML = html;
    if (LIST_STATUS_REKENING.includes(currentVal) || currentVal === 'ALL') {
        select.value = currentVal;
    }
}

function populateRekeningJenisFilterOptions() {
    const select = document.getElementById('rekFilterJenis');
    if (!select) return;

    const currentVal = select.value;
    const usedJenis = Array.from(new Set([
        ...PRESET_JENIS_REKENING,
        ...rekeningState.items.map(i => i.jenis).filter(Boolean)
    ])).sort();

    let html = '<option value="ALL">Semua Jenis</option>';
    usedJenis.forEach(j => {
        html += `<option value="${escapeHtml(j)}">${escapeHtml(j)}</option>`;
    });

    select.innerHTML = html;
    if (usedJenis.includes(currentVal) || currentVal === 'ALL') {
        select.value = currentVal;
    }
}

// C. FILTER DATA (TERMASUK SMART BATCH SEARCH)
function getFilteredRekeningList() {
    const { search, bank, status, jenis, expiringOnly, batchTargets } = rekeningState.filters;
    const sTerm = search.toLowerCase().trim();

    return rekeningState.items.filter(item => {
        // Smart Batch Multi-line Search
        if (batchTargets && batchTargets.length > 0) {
            const cleanItemNo = cleanAccountNumber(item.no_rekening);
            const rawItemNo = (item.no_rekening || '').toLowerCase();
            const itemText = ((item.nama_rekening || '') + ' ' + (item.nama_bank || '')).toLowerCase();

            const matchBatch = batchTargets.some(target => {
                // Match clean numeric account number
                const numMatch = target.cleanNums.some(num => 
                    (cleanItemNo && (cleanItemNo.includes(num) || num.includes(cleanItemNo))) ||
                    (rawItemNo && rawItemNo.includes(num))
                );
                if (numMatch) return true;

                // Match text tokens if no number was extracted from the line
                if (target.tokens && target.tokens.length > 0) {
                    const allTokensMatch = target.tokens.every(tok => itemText.includes(tok));
                    if (allTokensMatch) return true;
                }
                return false;
            });

            if (!matchBatch) return false;
        }

        // Single Line Search
        if (sTerm) {
            const cleanSTerm = cleanAccountNumber(sTerm);
            const cleanItemNo = cleanAccountNumber(item.no_rekening);

            const matchName = item.nama_rekening ? item.nama_rekening.toLowerCase().includes(sTerm) : false;
            const matchNo = item.no_rekening ? item.no_rekening.toLowerCase().includes(sTerm) : false;
            const matchCleanNo = (cleanSTerm && cleanSTerm.length >= 3 && cleanItemNo) ? cleanItemNo.includes(cleanSTerm) : false;
            const matchBank = item.nama_bank ? item.nama_bank.toLowerCase().includes(sTerm) : false;
            const matchCatatan = item.catatan ? item.catatan.toLowerCase().includes(sTerm) : false;
            if (!matchName && !matchNo && !matchCleanNo && !matchBank && !matchCatatan) return false;
        }

        // Filter Bank
        if (bank !== 'ALL' && item.nama_bank !== bank) return false;

        // Filter Status
        if (status !== 'ALL' && item.status !== status) return false;

        // Filter Jenis
        if (jenis !== 'ALL' && item.jenis !== jenis) return false;

        // Filter Expiring Only (< 90 hari)
        if (expiringOnly && !isExpiringSoon(item.masa_aktif, item.is_permanent)) return false;

        return true;
    });
}

// D. RENDER TABLE
function renderRekeningTable() {
    const tbody = document.getElementById('rekeningTableBody');
    const emptyState = document.getElementById('rekeningEmptyState');
    if (!tbody) return;

    const filtered = getFilteredRekeningList();

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hide');
        return;
    }

    if (emptyState) emptyState.classList.add('hide');

    let html = '';
    filtered.forEach(item => {
        const daysLeft = getDaysRemaining(item.masa_aktif, item.is_permanent);
        const isExpiring = isExpiringSoon(item.masa_aktif, item.is_permanent);
        const statusBadge = getStatusBadgeHTML(item.status);
        const masaAktifHTML = getMasaAktifHTML(item.masa_aktif, item.is_permanent, daysLeft);
        const screenshotHTML = getScreenshotCellHTML(item);

        const rowHighlightClass = isExpiring ? 'expiring-warning-row' : '';

        html += `
        <tr class="${rowHighlightClass}">
            <!-- 1. STATUS -->
            <td style="padding:14px 16px;vertical-align:middle;">${statusBadge}</td>
            
            <!-- 2. NAMA BANK -->
            <td style="padding:14px 16px;vertical-align:middle;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:34px;height:34px;border-radius:10px;background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.25);display:flex;align-items:center;justify-content:center;color:#c4b5fd;font-size:0.9rem;flex-shrink:0;">
                        <i class="${getBankIconClass(item.nama_bank)}"></i>
                    </div>
                    <span style="font-weight:700;color:white;font-size:0.85rem;white-space:nowrap;">${escapeHtml(item.nama_bank)}</span>
                </div>
            </td>

            <!-- 3. NAMA REKENING -->
            <td style="padding:14px 16px;vertical-align:middle;">
                <span style="font-weight:700;color:#e2e8f0;font-size:0.85rem;letter-spacing:0.3px;white-space:nowrap;">${escapeHtml(item.nama_rekening)}</span>
            </td>

            <!-- 4. NO REKENING -->
            <td style="padding:14px 16px;vertical-align:middle;">
                <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:5px 10px;border-radius:8px;">
                    <span style="font-family:monospace;font-weight:700;color:#38bdf8;font-size:0.9rem;letter-spacing:0.5px;">${escapeHtml(item.no_rekening)}</span>
                    <button onclick="copyToClipboard('${escapeHtml(item.no_rekening)}')" title="Salin No Rekening" style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.78rem;transition:color 0.2s;" onmouseover="this.style.color='#38bdf8'" onmouseout="this.style.color='rgba(255,255,255,0.5)'">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
            </td>

            <!-- 5. JENIS -->
            <td style="padding:14px 16px;vertical-align:middle;">
                <span style="display:inline-block;padding:4px 10px;border-radius:6px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);color:#60a5fa;font-size:0.75rem;font-weight:700;">
                    ${escapeHtml(item.jenis || 'Utama')}
                </span>
            </td>

            <!-- 6. MASA AKTIF -->
            <td style="padding:14px 16px;vertical-align:middle;">${masaAktifHTML}</td>

            <!-- 7. SCREENSHOT TANGGAL INPUT -->
            <td style="padding:14px 16px;vertical-align:middle;">${screenshotHTML}</td>

            <!-- 8. AKSI -->
            <td style="padding:14px 16px;vertical-align:middle;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <button onclick="editRekening('${item.id}')" title="Edit Data" style="padding:6px 10px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:8px;color:#60a5fa;cursor:pointer;font-size:0.78rem;transition:all 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.3)'" onmouseout="this.style.background='rgba(59,130,246,0.15)'">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="deleteRekening('${item.id}')" title="Hapus Data" style="padding:6px 10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#f87171;cursor:pointer;font-size:0.78rem;transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.3)'" onmouseout="this.style.background='rgba(239,68,68,0.15)'">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
}

// HELPER STATUS BADGE STYLING
function getStatusBadgeHTML(status) {
    const st = (status || 'AKTIF').toUpperCase();
    let bg = 'rgba(34, 197, 94, 0.15)';
    let border = 'rgba(34, 197, 94, 0.35)';
    let color = '#4ade80';
    let icon = 'fa-circle-check';

    switch(st) {
        case 'AKTIF':
            bg = 'rgba(34, 197, 94, 0.15)'; border = 'rgba(34, 197, 94, 0.35)'; color = '#4ade80'; icon = 'fa-circle-check';
            break;
        case 'DI OFFKAN':
            bg = 'rgba(148, 163, 184, 0.15)'; border = 'rgba(148, 163, 184, 0.35)'; color = '#94a3b8'; icon = 'fa-power-off';
            break;
        case 'DI PINJAM ADM':
            bg = 'rgba(234, 179, 8, 0.15)'; border = 'rgba(234, 179, 8, 0.35)'; color = '#facc15'; icon = 'fa-handshake-angle';
            break;
        case 'TERBLOKIR':
            bg = 'rgba(239, 68, 68, 0.2)'; border = 'rgba(239, 68, 68, 0.4)'; color = '#f87171'; icon = 'fa-ban';
            break;
        case 'TERLOGOUT':
            bg = 'rgba(249, 115, 22, 0.18)'; border = 'rgba(249, 115, 22, 0.35)'; color = '#fb923c'; icon = 'fa-right-from-bracket';
            break;
        case 'DI CABUT DARI KAS 1':
            bg = 'rgba(168, 85, 247, 0.18)'; border = 'rgba(168, 85, 247, 0.35)'; color = '#c084fc'; icon = 'fa-scissors';
            break;
        case 'BERMASALAH':
            bg = 'rgba(225, 29, 72, 0.2)'; border = 'rgba(225, 29, 72, 0.4)'; color = '#fb7185'; icon = 'fa-triangle-exclamation';
            break;
        case 'PPATK':
            bg = 'rgba(220, 38, 38, 0.25)'; border = 'rgba(220, 38, 38, 0.5)'; color = '#ef4444'; icon = 'fa-shield-cat';
            break;
        case 'DI KEMBALIKAN KE ADM':
            bg = 'rgba(6, 182, 212, 0.18)'; border = 'rgba(6, 182, 212, 0.35)'; color = '#22d3ee'; icon = 'fa-rotate-left';
            break;
    }

    return `
    <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;background:${bg};border:1px solid ${border};color:${color};font-size:0.75rem;font-weight:700;letter-spacing:0.4px;">
        <i class="fa-solid ${icon}" style="font-size:0.7rem;"></i>
        ${escapeHtml(st)}
    </span>
    `;
}

// HELPER MASA AKTIF DISPLAY
function getMasaAktifHTML(dateStr, isPermanent, daysLeft) {
    if (isPermanent || !dateStr) {
        return `
        <span style="display:inline-flex;align-items:center;gap:5px;color:#a78bfa;font-size:0.8rem;font-weight:700;">
            <i class="fa-solid fa-infinity"></i> Permanen
        </span>
        `;
    }

    const formattedDate = formatIndoDate(dateStr);

    if (daysLeft < 0) {
        return `
        <div style="display:flex;flex-direction:column;gap:2px;">
            <span style="color:#f87171;font-size:0.82rem;font-weight:700;">${formattedDate}</span>
            <span style="font-size:0.68rem;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.2);color:#ef4444;font-weight:800;width:fit-content;">
                <i class="fa-solid fa-skull"></i> EXPIRED (${Math.abs(daysLeft)} hari lalu)
            </span>
        </div>
        `;
    }

    if (daysLeft <= 90) {
        return `
        <div style="display:flex;flex-direction:column;gap:2px;">
            <span style="color:#facc15;font-size:0.82rem;font-weight:700;">${formattedDate}</span>
            <span style="font-size:0.68rem;padding:2px 6px;border-radius:4px;background:rgba(234,179,8,0.2);color:#facc15;font-weight:800;width:fit-content;border:1px solid rgba(234,179,8,0.3);">
                <i class="fa-solid fa-clock-rotate-left"></i> Sisa ${daysLeft} Hari (<= 90 Hari!)
            </span>
        </div>
        `;
    }

    return `
    <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="color:#e2e8f0;font-size:0.82rem;font-weight:600;">${formattedDate}</span>
        <span style="font-size:0.68rem;color:rgba(255,255,255,0.4);font-weight:500;">
            Sisa ${daysLeft} Hari
        </span>
    </div>
    `;
}

// HELPER SCREENSHOT CELL DISPLAY
function getScreenshotCellHTML(item) {
    const tglInput = item.tanggal_input ? formatIndoDateTime(item.tanggal_input) : '-';
    const staffInput = item.input_by_staff_name ? escapeHtml(item.input_by_staff_name) : 'Staff';

    let imgPreviewBtn = '';
    if (item.screenshot_url) {
        imgPreviewBtn = `
        <button onclick="viewRekeningScreenshot('${item.id}')" title="Lihat Bukti Screenshot" style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.3);color:#c084fc;font-size:0.7rem;font-weight:700;cursor:pointer;margin-top:4px;">
            <i class="fa-solid fa-image"></i> Lihat Screenshot
        </button>
        `;
    } else {
        imgPreviewBtn = `<span style="font-size:0.68rem;color:rgba(255,255,255,0.35);font-style:italic;">Tanpa screenshot</span>`;
    }

    return `
    <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="color:rgba(255,255,255,0.85);font-size:0.78rem;font-weight:600;">${tglInput}</span>
        <span style="font-size:0.68rem;color:rgba(255,255,255,0.4);">Oleh: ${staffInput}</span>
        ${imgPreviewBtn}
    </div>
    `;
}

// BANK ICON MAPPING HELPER
function getBankIconClass(bankName) {
    if (!bankName) return 'fa-solid fa-building-columns';
    const b = bankName.toLowerCase();
    if (b.includes('bca') || b.includes('mandiri') || b.includes('bri') || b.includes('bni') || b.includes('cimb') || b.includes('permata') || b.includes('danamon') || b.includes('bsi') || b.includes('btn')) {
        return 'fa-solid fa-building-columns';
    }
    if (b.includes('dana') || b.includes('ovo') || b.includes('gopay') || b.includes('shopeepay') || b.includes('linkaja')) {
        return 'fa-solid fa-wallet';
    }
    if (b.includes('qris')) {
        return 'fa-solid fa-qrcode';
    }
    return 'fa-solid fa-credit-card';
}

// 4. EVENT HANDLERS & FILTERS
function setupRekeningEventListeners() {
    const searchInput = document.getElementById('rekSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            rekeningState.filters.search = e.target.value;
            renderRekeningTable();
        });
    }

    const bankFilter = document.getElementById('rekFilterBank');
    if (bankFilter) {
        bankFilter.addEventListener('change', (e) => {
            rekeningState.filters.bank = e.target.value;
            renderRekeningTable();
        });
    }

    const statusFilter = document.getElementById('rekFilterStatus');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            rekeningState.filters.status = e.target.value;
            renderRekeningTable();
        });
    }

    const jenisFilter = document.getElementById('rekFilterJenis');
    if (jenisFilter) {
        jenisFilter.addEventListener('change', (e) => {
            rekeningState.filters.jenis = e.target.value;
            renderRekeningTable();
        });
    }

    const btnExpiringFilter = document.getElementById('btnFilterExpiringSoon');
    if (btnExpiringFilter) {
        btnExpiringFilter.addEventListener('click', () => {
            rekeningState.filters.expiringOnly = !rekeningState.filters.expiringOnly;
            if (rekeningState.filters.expiringOnly) {
                btnExpiringFilter.classList.add('active');
                btnExpiringFilter.style.background = 'rgba(234, 179, 8, 0.35)';
            } else {
                btnExpiringFilter.classList.remove('active');
                btnExpiringFilter.style.background = 'rgba(234, 179, 8, 0.12)';
            }
            renderRekeningTable();
        });
    }

    // Batch Multi-line Textarea Input Handler
    const batchInput = document.getElementById('rekBatchSearchInput');
    if (batchInput) {
        batchInput.addEventListener('input', () => {
            processBatchRekeningSearch();
        });
    }
}

// SMART BATCH REKENING SEARCH LOGIC
function processBatchRekeningSearch() {
    const textarea = document.getElementById('rekBatchSearchInput');
    const summaryContainer = document.getElementById('rekBatchResultSummary');
    const matchBadge = document.getElementById('rekBatchMatchCountBadge');
    const unmatchedBadge = document.getElementById('rekBatchUnmatchedCountBadge');
    const unmatchedDetails = document.getElementById('rekBatchUnmatchedDetails');
    const foundResultsContainer = document.getElementById('rekBatchFoundResults');

    if (!textarea) return;

    const rawText = textarea.value.trim();
    if (!rawText) {
        rekeningState.filters.batchTargets = [];
        if (summaryContainer) summaryContainer.classList.add('hide');
        if (foundResultsContainer) foundResultsContainer.classList.add('hide');
        renderRekeningTable();
        return;
    }

    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const parsedTargets = [];
    const unmatchedList = [];

    lines.forEach((line, index) => {
        const digitMatches = line.match(/\d[\d\s\.\-]{3,}\d|\d{4,}/g) || [];
        const cleanNums = Array.from(new Set(digitMatches.map(cleanAccountNumber).filter(n => n.length >= 4)));

        const tokens = line.toLowerCase()
            .replace(/[^\w\s]/gi, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1 && !/^\d+$/.test(t));

        parsedTargets.push({
            originalLine: line,
            lineNumber: index + 1,
            cleanNums,
            tokens
        });
    });

    rekeningState.filters.batchTargets = parsedTargets;

    // Evaluate matching & collect matched items
    let matchedCount = 0;
    const items = rekeningState.items;
    const allMatchedItems = []; // flat list of {inputLine, item}

    parsedTargets.forEach(target => {
        const matchedForLine = [];
        items.forEach(item => {
            const cleanItemNo = cleanAccountNumber(item.no_rekening);
            const rawItemNo = (item.no_rekening || '').toLowerCase();
            const itemText = ((item.nama_rekening || '') + ' ' + (item.nama_bank || '')).toLowerCase();

            let isMatch = false;
            if (target.cleanNums.length > 0) {
                if (target.cleanNums.some(num => (cleanItemNo && (cleanItemNo.includes(num) || num.includes(cleanItemNo))) || rawItemNo.includes(num))) {
                    isMatch = true;
                }
            }
            if (!isMatch && target.tokens.length > 0) {
                if (target.tokens.every(tok => itemText.includes(tok))) {
                    isMatch = true;
                }
            }
            if (isMatch) matchedForLine.push(item);
        });

        if (matchedForLine.length > 0) {
            matchedCount++;
            matchedForLine.forEach(item => allMatchedItems.push({ inputLine: target.originalLine, item }));
        } else {
            const label = target.cleanNums.length > 0 ? target.cleanNums.join(', ') : target.originalLine;
            unmatchedList.push(label);
        }
    });

    if (summaryContainer) {
        summaryContainer.classList.remove('hide');
        if (matchBadge) matchBadge.textContent = `${matchedCount} Ditemukan`;
        if (unmatchedBadge) unmatchedBadge.textContent = `${unmatchedList.length} Tidak Ada`;

        if (unmatchedDetails) {
            if (unmatchedList.length > 0) {
                unmatchedDetails.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Tidak ada di database:</strong> ${escapeHtml(unmatchedList.join(' | '))}`;
            } else {
                unmatchedDetails.innerHTML = `<span style="color:#4ade80;"><i class="fa-solid fa-circle-check"></i> Semua (${lines.length}) baris rekening di textarea cocok dan ditemukan!</span>`;
            }
        }
    }

    // Render found result cards
    if (foundResultsContainer) {
        if (allMatchedItems.length > 0) {
            foundResultsContainer.classList.remove('hide');

            // Build the "salin semua" text in requested format: JENIS BANK\tNAMA\tNO_REK
            const semuaRows = allMatchedItems.map(({ item }) => {
                const jenisBank = ('BANK ' + (item.jenis || '') + ' ' + (item.nama_bank || '')).trim().toUpperCase();
                return jenisBank + '\t' + (item.nama_rekening || '') + '\t' + (item.no_rekening || '');
            }).join('\n');
            const encodedSemua = encodeURIComponent(semuaRows);

            let cardsHtml = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 4px 8px 4px;flex-wrap:wrap;gap:6px;">
                <span style="font-size:0.7rem;color:rgba(255,255,255,0.45);font-weight:700;letter-spacing:0.3px;"><i class="fa-solid fa-list-check"></i> DATA REKENING YANG DITEMUKAN (${allMatchedItems.length} record)</span>
                <button onclick="copyAllBatchRekText(this)" data-copy-all="${encodedSemua}" style="padding:4px 12px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);border-radius:6px;color:#4ade80;font-size:0.7rem;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:all 0.2s;" title="Salin semua rekening ditemukan dalam format tabel">
                    <i class="fa-solid fa-copy"></i> Salin Semua (${allMatchedItems.length})
                </button>
            </div>`;

            allMatchedItems.forEach(({ inputLine, item }, idx) => {
                const statusColor = item.status === 'AKTIF' ? '#4ade80' : item.status === 'DI OFFKAN' ? '#fca5a5' : '#fde68a';
                const statusBg = item.status === 'AKTIF' ? 'rgba(34,197,94,0.15)' : item.status === 'DI OFFKAN' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)';

                let masaAktifStr = '';
                let masaAktifBadge = '';
                if (item.masa_aktif) {
                    const exp = new Date(item.masa_aktif);
                    const now = new Date();
                    const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
                    const expFormatted = exp.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                    masaAktifStr = expFormatted;
                    const badgeColor = daysLeft < 0 ? '#f87171' : daysLeft <= 30 ? '#fca5a5' : daysLeft <= 90 ? '#fde68a' : '#86efac';
                    const badgeBg = daysLeft < 0 ? 'rgba(239,68,68,0.2)' : daysLeft <= 30 ? 'rgba(239,68,68,0.15)' : daysLeft <= 90 ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.12)';
                    const daysLabel = daysLeft < 0 ? `Expired ${Math.abs(daysLeft)} hari` : `Sisa ${daysLeft} hari`;
                    masaAktifBadge = `<span style="background:${badgeBg};color:${badgeColor};padding:1px 6px;border-radius:4px;font-size:0.62rem;font-weight:800;border:1px solid ${badgeColor}33;white-space:nowrap;">${daysLabel}</span>`;
                }

                const salinText = [item.nama_bank, item.nama_rekening, item.no_rekening].filter(Boolean).join(' | ');
                const jenisBadge = `<span style="background:rgba(139,92,246,0.2);color:#c4b5fd;padding:1px 6px;border-radius:4px;font-size:0.62rem;font-weight:800;">${escapeHtml(item.jenis || '')}</span>`;
                const screenshotBtn = item.screenshot_url ? `<button onclick="viewRekeningScreenshot('${escapeHtml(item.screenshot_url)}', '${escapeHtml(item.nama_rekening)}')" title="Lihat Screenshot" style="padding:3px 8px;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.3);border-radius:5px;color:#38bdf8;font-size:0.65rem;font-weight:700;cursor:pointer;"><i class="fa-solid fa-image"></i></button>` : '';

                cardsHtml += `
                <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.35);border:1px solid rgba(139,92,246,0.2);border-radius:8px;padding:8px 12px;gap:8px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;flex-wrap:wrap;">
                        <div style="width:30px;height:30px;border-radius:7px;background:rgba(139,92,246,0.2);color:#a78bfa;display:flex;align-items:center;justify-content:center;font-size:0.8rem;flex-shrink:0;">
                            <i class="${getBankIconClass(item.nama_bank)}"></i>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                <span style="color:white;font-weight:800;font-size:0.82rem;">${escapeHtml(item.nama_rekening || '-')}</span>
                                <span style="color:rgba(255,255,255,0.5);font-size:0.7rem;">·</span>
                                <span style="color:#38bdf8;font-weight:700;font-size:0.78rem;">${escapeHtml(item.nama_bank || '')}</span>
                                ${jenisBadge}
                                <span style="background:${statusBg};color:${statusColor};padding:1px 6px;border-radius:4px;font-size:0.62rem;font-weight:800;">${escapeHtml(item.status || '')}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <span style="font-family:monospace;color:#facc15;font-size:0.82rem;font-weight:700;letter-spacing:0.5px;">${escapeHtml(item.no_rekening || '')}</span>
                                ${masaAktifStr ? `<span style="color:rgba(255,255,255,0.4);font-size:0.68rem;">Masa Aktif: ${masaAktifStr}</span>` : ''}
                                ${masaAktifBadge}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                        ${screenshotBtn}
                        <button onclick="copyBatchRekText(this)" data-copy="${salinText.replace(/"/g, '&quot;')}" style="padding:3px 9px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);border-radius:5px;color:#c4b5fd;font-size:0.68rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;white-space:nowrap;" title="Salin info rekening ini">
                            <i class="fa-solid fa-copy"></i> Salin
                        </button>
                    </div>
                </div>`;
            });

            foundResultsContainer.innerHTML = cardsHtml;
        } else {
            foundResultsContainer.classList.add('hide');
            foundResultsContainer.innerHTML = '';
        }
    }

    renderRekeningTable();
}
window.processBatchRekeningSearch = processBatchRekeningSearch;

// Helper: Salin teks rekening dari kartu hasil batch search
function copyBatchRekText(btn) {
    const text = btn.getAttribute('data-copy') || '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {
            const t = document.createElement('textarea');
            t.value = text;
            document.body.appendChild(t);
            t.select();
            document.execCommand('copy');
            document.body.removeChild(t);
        });
    } else {
        const t = document.createElement('textarea');
        t.value = text;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        document.body.removeChild(t);
    }
    const prevHtml = btn.innerHTML;
    const prevColor = btn.style.color;
    const prevBorder = btn.style.borderColor;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin!';
    btn.style.color = '#4ade80';
    btn.style.borderColor = 'rgba(74,222,128,0.5)';
    setTimeout(() => {
        btn.innerHTML = prevHtml;
        btn.style.color = prevColor;
        btn.style.borderColor = prevBorder;
    }, 1500);
}
window.copyBatchRekText = copyBatchRekText;

// Helper: Salin SEMUA rekening dari hasil batch search
function copyAllBatchRekText(btn) {
    const encoded = btn.getAttribute('data-copy-all') || '';
    const text = decodeURIComponent(encoded);
    if (!text) return;

    const doWrite = (str) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(str).catch(() => {
                const t = document.createElement('textarea');
                t.value = str; document.body.appendChild(t); t.select();
                document.execCommand('copy'); document.body.removeChild(t);
            });
        } else {
            const t = document.createElement('textarea');
            t.value = str; document.body.appendChild(t); t.select();
            document.execCommand('copy'); document.body.removeChild(t);
        }
    };
    doWrite(text);

    const prevHtml = btn.innerHTML;
    const prevColor = btn.style.color;
    const prevBorder = btn.style.borderColor;
    const prevBg = btn.style.background;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin Semua!';
    btn.style.color = '#4ade80';
    btn.style.borderColor = 'rgba(74,222,128,0.7)';
    btn.style.background = 'rgba(34,197,94,0.3)';
    setTimeout(() => {
        btn.innerHTML = prevHtml;
        btn.style.color = prevColor;
        btn.style.borderColor = prevBorder;
        btn.style.background = prevBg;
    }, 2000);
}
window.copyAllBatchRekText = copyAllBatchRekText;

function clearRekBatchSearch() {
    const textarea = document.getElementById('rekBatchSearchInput');
    if (textarea) textarea.value = '';
    const summaryContainer = document.getElementById('rekBatchResultSummary');
    if (summaryContainer) summaryContainer.classList.add('hide');
    const foundResultsContainer = document.getElementById('rekBatchFoundResults');
    if (foundResultsContainer) {
        foundResultsContainer.classList.add('hide');
        foundResultsContainer.innerHTML = '';
    }
    rekeningState.filters.batchTargets = [];
    renderRekeningTable();
}
window.clearRekBatchSearch = clearRekBatchSearch;
window.setupRekeningEventListeners = setupRekeningEventListeners;

// 5. MODAL TAMBAH / EDIT REKENING
function openRekeningModal(editId = null) {
    const modal = document.getElementById('rekeningModal');
    if (!modal) return;

    rekeningState.editingId = editId;
    const title = document.getElementById('rekeningModalTitle');

    // Reset Form & File Input
    document.getElementById('formRekening').reset();
    clearRekScreenshotInput();
    document.getElementById('rekIsPermanent').checked = false;
    document.getElementById('rekMasaAktifGroup').style.display = 'block';

    // Populate preset Bank select
    populateRekeningModalBankOptions();
    populateRekeningModalStatusOptions();

    if (editId) {
        const item = rekeningState.items.find(i => i.id === editId);
        if (item) {
            if (title) title.textContent = 'Edit Data Rekening';
            document.getElementById('rekBankSelect').value = item.nama_bank;
            document.getElementById('rekNamaRekening').value = item.nama_rekening;
            document.getElementById('rekNoRekening').value = item.no_rekening;
            
            const jUpper = (item.jenis || 'DEPOSIT').toUpperCase();
            if (PRESET_JENIS_REKENING.includes(jUpper)) {
                document.getElementById('rekJenisSelect').value = jUpper;
                document.getElementById('rekJenisCustom').classList.add('hide');
                document.getElementById('rekJenisCustom').value = '';
            } else {
                document.getElementById('rekJenisSelect').value = 'CUSTOM';
                document.getElementById('rekJenisCustom').classList.remove('hide');
                document.getElementById('rekJenisCustom').value = item.jenis || '';
            }

            document.getElementById('rekStatusSelect').value = item.status || 'AKTIF';
            document.getElementById('rekCatatan').value = item.catatan || '';
            
            if (item.screenshot_url) {
                document.getElementById('rekScreenshotUrl').value = item.screenshot_url;
                const prevCont = document.getElementById('rekFormScreenshotPreview');
                const prevImg = document.getElementById('rekFormScreenshotImg');
                if (prevCont && prevImg) {
                    prevImg.src = item.screenshot_url;
                    prevCont.classList.remove('hide');
                }
            }

            if (item.is_permanent) {
                document.getElementById('rekIsPermanent').checked = true;
                document.getElementById('rekMasaAktifGroup').style.display = 'none';
            } else {
                document.getElementById('rekMasaAktif').value = item.masa_aktif || '';
                document.getElementById('rekMasaAktifGroup').style.display = 'block';
            }
        }
    } else {
        if (title) title.textContent = 'Tambah Data Rekening Baru';
        document.getElementById('rekJenisSelect').value = 'DEPOSIT';
        document.getElementById('rekJenisCustom').classList.add('hide');
        document.getElementById('rekJenisCustom').value = '';

        // Default set masa aktif 1 tahun ke depan
        const oneYear = new Date();
        oneYear.setFullYear(oneYear.getFullYear() + 1);
        document.getElementById('rekMasaAktif').value = oneYear.toISOString().split('T')[0];
    }

    modal.style.display = 'flex';
}
window.openRekeningModal = openRekeningModal;

function closeRekeningModal() {
    const modal = document.getElementById('rekeningModal');
    if (modal) modal.style.display = 'none';
}
window.closeRekeningModal = closeRekeningModal;

function toggleRekeningPermanentCheck() {
    const isChecked = document.getElementById('rekIsPermanent').checked;
    const group = document.getElementById('rekMasaAktifGroup');
    if (group) {
        group.style.display = isChecked ? 'none' : 'block';
    }
}
window.toggleRekeningPermanentCheck = toggleRekeningPermanentCheck;

function populateRekeningModalBankOptions() {
    const select = document.getElementById('rekBankSelect');
    if (!select) return;

    let html = '';
    PRESET_BANK_LIST.forEach(b => {
        html += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`;
    });
    select.innerHTML = html;
}

function populateRekeningModalStatusOptions() {
    const select = document.getElementById('rekStatusSelect');
    if (!select) return;

    let html = '';
    LIST_STATUS_REKENING.forEach(st => {
        html += `<option value="${st}">${st}</option>`;
    });
    select.innerHTML = html;
}

// 6. SIMPAN REKENING (INSERT / UPDATE)
function handleRekJenisChange() {
    const select = document.getElementById('rekJenisSelect');
    const customInput = document.getElementById('rekJenisCustom');
    if (select && customInput) {
        if (select.value === 'CUSTOM') {
            customInput.classList.remove('hide');
            customInput.focus();
        } else {
            customInput.classList.add('hide');
        }
    }
}
window.handleRekJenisChange = handleRekJenisChange;

async function saveRekening(e) {
    if (e) e.preventDefault();

    const bank = document.getElementById('rekBankSelect').value.trim();
    const nama = document.getElementById('rekNamaRekening').value.trim();
    const noRek = document.getElementById('rekNoRekening').value.trim();
    
    const jenisSelectVal = document.getElementById('rekJenisSelect').value;
    let jenis = jenisSelectVal;
    if (jenisSelectVal === 'CUSTOM') {
        jenis = document.getElementById('rekJenisCustom').value.trim() || 'KUSTAM';
    }

    const status = document.getElementById('rekStatusSelect').value;
    const isPermanent = document.getElementById('rekIsPermanent').checked;
    const masaAktif = isPermanent ? null : document.getElementById('rekMasaAktif').value;
    const screenshotUrl = document.getElementById('rekScreenshotUrl').value.trim();
    const catatan = document.getElementById('rekCatatan').value.trim();

    if (!bank || !nama || !noRek) {
        showToast("Mohon lengkapi Nama Bank, Nama Rekening, dan No. Rekening.", "warning");
        return;
    }

    const currentStaff = window.state?.currentStaff;
    const staffId = currentStaff?.id || null;
    const staffName = currentStaff?.name || 'Admin';

    const payload = {
        status: status,
        nama_bank: bank,
        nama_rekening: nama,
        no_rekening: noRek,
        jenis: jenis || 'Utama',
        masa_aktif: masaAktif,
        is_permanent: isPermanent,
        screenshot_url: screenshotUrl,
        tanggal_input: new Date().toISOString(),
        input_by_staff_id: staffId,
        input_by_staff_name: staffName,
        catatan: catatan,
        updated_at: new Date().toISOString()
    };

    try {
        if (window.supabaseClient) {
            if (rekeningState.editingId) {
                const { error } = await window.supabaseClient
                    .from('data_rekening')
                    .update(payload)
                    .eq('id', rekeningState.editingId);
                if (error) throw error;
            } else {
                const { error } = await window.supabaseClient
                    .from('data_rekening')
                    .insert([payload]);
                if (error) throw error;
            }
        }

        // Local state update
        if (rekeningState.editingId) {
            const idx = rekeningState.items.findIndex(i => i.id === rekeningState.editingId);
            if (idx !== -1) {
                rekeningState.items[idx] = { ...rekeningState.items[idx], ...payload };
            }
            showToast("Data rekening berhasil diperbarui.", "success");
        } else {
            const newItem = {
                id: 'rek-' + Date.now(),
                ...payload
            };
            rekeningState.items.unshift(newItem);
            showToast("Data rekening baru berhasil ditambahkan.", "success");
        }

        localStorage.setItem('restease_data_rekening_cache', JSON.stringify(rekeningState.items));
        closeRekeningModal();
        renderDataRekeningView();
    } catch (err) {
        console.error("Gagal menyimpan data rekening:", err);
        showToast("Terjadi kesalahan saat menyimpan data: " + err.message, "danger");
    }
}
window.saveRekening = saveRekening;

function editRekening(id) {
    openRekeningModal(id);
}
window.editRekening = editRekening;

// 7. HAPUS REKENING
async function deleteRekening(id) {
    const item = rekeningState.items.find(i => i.id === id);
    if (!item) return;

    const confirmDelete = await window.showCustomConfirm(
        `Apakah Anda yakin ingin menghapus rekening "${item.nama_bank} - ${item.no_rekening}" (${item.nama_rekening})?`,
        "Hapus Data Rekening",
        true
    );

    if (!confirmDelete) return;

    try {
        if (window.supabaseClient) {
            const { error } = await window.supabaseClient
                .from('data_rekening')
                .delete()
                .eq('id', id);
            if (error) throw error;
        }

        rekeningState.items = rekeningState.items.filter(i => i.id !== id);
        localStorage.setItem('restease_data_rekening_cache', JSON.stringify(rekeningState.items));
        showToast("Data rekening berhasil dihapus.", "success");
        renderDataRekeningView();
    } catch (err) {
        console.error("Gagal menghapus data rekening:", err);
        showToast("Gagal menghapus data: " + err.message, "danger");
    }
}
window.deleteRekening = deleteRekening;

// 8. PREVIEW SCREENSHOT MODAL & UPLOAD HANDLERS
function handleRekScreenshotFileUpload(e) {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Mohon pilih file gambar yang valid (PNG, JPG, JPEG, WEBP).', 'warning');
        return;
    }

    const fileNameSpan = document.getElementById('rekScreenshotFileName');
    if (fileNameSpan) fileNameSpan.textContent = file.name;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const dataUrl = evt.target.result;
        document.getElementById('rekScreenshotUrl').value = dataUrl;
        
        const previewContainer = document.getElementById('rekFormScreenshotPreview');
        const previewImg = document.getElementById('rekFormScreenshotImg');
        if (previewContainer && previewImg) {
            previewImg.src = dataUrl;
            previewContainer.classList.remove('hide');
        }
    };
    reader.readAsDataURL(file);
}
window.handleRekScreenshotFileUpload = handleRekScreenshotFileUpload;

function clearRekScreenshotInput() {
    const fileInput = document.getElementById('rekScreenshotFile');
    if (fileInput) fileInput.value = '';
    const fileNameSpan = document.getElementById('rekScreenshotFileName');
    if (fileNameSpan) fileNameSpan.textContent = 'Belum ada file dipilih';
    const urlInput = document.getElementById('rekScreenshotUrl');
    if (urlInput) urlInput.value = '';
    const previewContainer = document.getElementById('rekFormScreenshotPreview');
    if (previewContainer) previewContainer.classList.add('hide');
}
window.clearRekScreenshotInput = clearRekScreenshotInput;

function handleRekScreenshotImgError(imgEl) {
    if (imgEl) {
        imgEl.src = SAMPLE_SCREENSHOT_SVG;
        imgEl.style.display = 'block';
    }
}
window.handleRekScreenshotImgError = handleRekScreenshotImgError;

function viewRekeningScreenshot(id) {
    const item = rekeningState.items.find(i => i.id === id);
    const modal = document.getElementById('rekeningScreenshotModal');
    const img = document.getElementById('rekScreenshotImg');
    const fallback = document.getElementById('rekScreenshotFallback');
    const info = document.getElementById('rekScreenshotInfo');
    const linkAnchor = document.getElementById('rekScreenshotClickableLink');
    const openBtn = document.getElementById('rekScreenshotOpenBtn');

    if (!modal) return;

    // Use actual screenshot URL or high quality sample SVG fallback
    const targetUrl = (item && item.screenshot_url && item.screenshot_url.trim()) ? item.screenshot_url : SAMPLE_SCREENSHOT_SVG;
    window.currentRekScreenshotUrl = targetUrl;

    if (img) {
        img.style.display = 'block';
        img.src = targetUrl;
    }
    if (fallback) fallback.classList.add('hide');

    if (info && item) {
        info.innerHTML = `
        <strong>${escapeHtml(item.nama_bank)} &bull; ${escapeHtml(item.no_rekening)}</strong><br>
        A.N: <strong>${escapeHtml(item.nama_rekening)}</strong><br>
        <small style="color:rgba(255,255,255,0.5);">Tanggal Input: ${formatIndoDateTime(item.tanggal_input)} oleh ${escapeHtml(item.input_by_staff_name || 'Staff')}</small>
        `;
    }

    if (linkAnchor) {
        linkAnchor.href = targetUrl;
        linkAnchor.textContent = targetUrl.length > 55 ? targetUrl.substring(0, 55) + '...' : targetUrl;
    }
    if (openBtn) {
        openBtn.href = targetUrl;
    }

    modal.style.display = 'flex';
}
window.viewRekeningScreenshot = viewRekeningScreenshot;

function copyRekScreenshotLink() {
    const url = window.currentRekScreenshotUrl;
    if (url) {
        if (typeof copyToClipboard === 'function') {
            copyToClipboard(url);
        } else {
            navigator.clipboard.writeText(url).then(() => {
                showToast('Link screenshot berhasil disalin!', 'success');
            });
        }
    }
}
window.copyRekScreenshotLink = copyRekScreenshotLink;

function closeRekeningScreenshotModal() {
    const modal = document.getElementById('rekeningScreenshotModal');
    if (modal) modal.style.display = 'none';
}
window.closeRekeningScreenshotModal = closeRekeningScreenshotModal;

// 9. UTILITY HELPERS
function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast(`No. Rekening "${text}" berhasil disalin ke clipboard!`, "success");
    }).catch(() => {
        showToast("Gagal menyalin teks.", "warning");
    });
}
window.copyToClipboard = copyToClipboard;

function formatIndoDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch(e) { return dateStr; }
}

function formatIndoDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch(e) { return dateStr; }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Handle Realtime Supabase updates for data_rekening
function handleRekeningRealtime(payload) {
    if (payload.eventType === 'INSERT') {
        // Tolak INSERT dari Supabase jika ID sudah ada (dari BASE44 lokal)
        const exist = rekeningState.items.some(i => i.id === payload.new.id ||
            (cleanAccountNumber(i.no_rekening) === cleanAccountNumber(payload.new.no_rekening) &&
             (i.nama_bank || '').toLowerCase() === (payload.new.nama_bank || '').toLowerCase() &&
             (i.jenis || '') === (payload.new.jenis || '')));
        if (!exist) {
            rekeningState.items.unshift(payload.new);
        }
    } else if (payload.eventType === 'UPDATE') {
        const idx = rekeningState.items.findIndex(i => i.id === payload.new.id);
        if (idx !== -1) rekeningState.items[idx] = payload.new;
    } else if (payload.eventType === 'DELETE') {
        rekeningState.items = rekeningState.items.filter(i => i.id !== payload.old.id);
    }
    localStorage.setItem('restease_data_rekening_cache', JSON.stringify(rekeningState.items));
    if (typeof isSectionActive === 'function' && isSectionActive('dataRekeningView')) {
        renderDataRekeningView();
    }
}
window.handleRekeningRealtime = handleRekeningRealtime;
