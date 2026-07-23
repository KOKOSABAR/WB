// ============================================================
// SERAH TERIMA MODULE
// Handles CS LINE, KAPTEN KASIR, KASIR serah terima
// ============================================================

// --------------- STATE ---------------
const stState = {
    csLine:     [],
    kapten:     [],
    kasir:      [],
    realtimeSubs: [],
    dateFilters: {},
    // Filter states for UI
    searchQuery: '',
    roleFilter: 'all',
    statusFilter: 'all'
}

// --------------- ROLE ACCESS ---------------
// CS LINE & KAPTEN KASIR → bisa akses dan menambahkan serah terima
// pada form CS LINE dan KAPTEN KASIR
// Semua role staff yang login → bisa akses kasir
const ST_ACCESS = {
    cs_line:      ['CS LINE', 'KAPTEN KASIR'],
    kapten_kasir: ['CS LINE', 'KAPTEN KASIR'],
    kasir:        '*'
};

function stGetCurrentRole() {
    const staff = window.state?.currentStaff;
    if (!staff || !staff.role) return '';
    if (window.formatRoleNameUpper) {
        return window.formatRoleNameUpper(staff.role);
    }
    let role = String(staff.role).toUpperCase().trim();
    if (role === 'CS') role = 'CS LC';
    return role;
}

function stCanAccess(type) {
    const staff = window.state?.currentStaff;
    if (!staff || !staff.role) return true; // Mode Admin / Tanpa Login Staff
    const roleUpper = window.formatRoleNameUpper ? window.formatRoleNameUpper(staff.role) : (staff.role || '').toUpperCase().trim();
    if (type === 'cs_line' || type === 'kapten_kasir') {
        return ['CS LINE', 'KAPTEN KASIR'].includes(roleUpper);
    }
    return true; // Kasir view terbuka untuk semua role
}

// --------------- SIDEBAR VISIBILITY ---------------
function stUpdateSidebarAccess() {
    if (typeof window.updateRoleBasedSidebarAccess === 'function') {
        window.updateRoleBasedSidebarAccess();
    }

    // Tombol Tambah Data di dalam view
    const staff = window.state?.currentStaff;
    const btnAddCSLine = document.getElementById('btnTambahSTCSLine');
    const btnAddKapten = document.getElementById('btnTambahSTKapten');
    const btnAddKasir  = document.getElementById('btnTambahSTKasir');

    const roleUpper = staff && staff.role ? (window.formatRoleNameUpper ? window.formatRoleNameUpper(staff.role) : staff.role.toUpperCase().trim()) : '';
    const isAllowedAdd = !staff || !staff.role || ['CS LINE', 'KAPTEN KASIR'].includes(roleUpper);

    if (btnAddCSLine) btnAddCSLine.style.display = isAllowedAdd ? 'flex' : 'none';
    if (btnAddKapten) btnAddKapten.style.display = isAllowedAdd ? 'flex' : 'none';
    if (btnAddKasir)  btnAddKasir.style.display  = 'flex';
}

// --------------- FETCH DATA ---------------
async function stFetchAll() {
    await Promise.all([
        stFetch('cs_line'),
        stFetch('kapten_kasir'),
        stFetch('kasir')
    ]);
}

async function stFetch(type) {
    const table = stTableName(type);
    if (!table) return;

    try {
        const { data, error } = await window.supabaseClient
            .from(table)
            .select('*')
            .order('tanggal', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            // Tabel belum dibuat di Supabase - skip tanpa error
            console.warn(`[SerahTerima] Tabel "${table}" belum tersedia. Jalankan supabase_serah_terima_setup.sql terlebih dahulu.`);
            return;
        }

        if (type === 'cs_line')           stState.csLine = data || [];
        else if (type === 'kapten_kasir') stState.kapten = data || [];
        else if (type === 'kasir')        stState.kasir  = data || [];
    } catch (err) {
        console.warn(`[SerahTerima] Fetch skipped (${type}):`, err.message);
    }
}

function stTableName(type) {
    if (type === 'cs_line')      return 'serah_terima_cs_line';
    if (type === 'kapten_kasir') return 'serah_terima_kapten_kasir';
    if (type === 'kasir')        return 'serah_terima_kasir';
    return null;
}

function stTypePrefix(type) {
    return type === 'cs_line' ? 'CSLine' : (type === 'kapten_kasir' ? 'Kapten' : 'Kasir');
}

function stDateToISO(date) {
    const safeDate = new Date(date);
    safeDate.setMinutes(safeDate.getMinutes() - safeDate.getTimezoneOffset());
    return safeDate.toISOString().split('T')[0];
}

function stTodayISO() {
    return stDateToISO(new Date());
}

function stEnsureDateFilter(type) {
    if (!stState.dateFilters[type]) {
        stState.dateFilters[type] = {
            mode: 'today',
            date: stTodayISO()
        };
    }
    return stState.dateFilters[type];
}

function stGetFilteredData(type, data) {
    const filter = stEnsureDateFilter(type);
    if (filter.mode === 'all') return data;
    const targetDate = filter.date || stTodayISO();
    return data.filter(row => (row.tanggal || '') === targetDate);
}

function stFormatFilterDate(dateString) {
    if (!dateString) return 'tanggal dipilih';
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function stUpdateFilterUI(type) {
    const filter = stEnsureDateFilter(type);
    const prefix = stTypePrefix(type);
    const input = document.getElementById(`stFilterDate${prefix}`);
    const info = document.getElementById(`stFilterInfo${prefix}`);
    const btnShowAll = document.getElementById(`btnSTShowAll${prefix}`);

    if (input) input.value = filter.date || stTodayISO();
    if (info) {
        info.textContent = filter.mode === 'all'
            ? 'Menampilkan semua data serah terima'
            : `Menampilkan data tanggal ${stFormatFilterDate(filter.date)}`;
    }
    if (btnShowAll) {
        btnShowAll.textContent = filter.mode === 'all' ? 'Kembali ke Filter' : 'Tampilkan Semua';
        btnShowAll.style.background = filter.mode === 'all'
            ? 'linear-gradient(135deg,#a855f7,#7c3aed)'
            : 'rgba(255,255,255,0.06)';
        btnShowAll.style.border = filter.mode === 'all'
            ? '1px solid rgba(168,85,247,0.35)'
            : '1px solid rgba(255,255,255,0.1)';
        btnShowAll.style.color = '#ffffff';
    }
}

function stSetDate(type, dateValue) {
    const filter = stEnsureDateFilter(type);
    filter.mode = 'date';
    filter.date = dateValue || stTodayISO();
    stUpdateFilterUI(type);
    stRender(type);
}
window.stSetDate = stSetDate;

function stShiftDate(type, dayDelta) {
    const filter = stEnsureDateFilter(type);
    const baseDate = filter.mode === 'all' ? stTodayISO() : (filter.date || stTodayISO());
    const nextDate = new Date(`${baseDate}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + dayDelta);
    const shifted = stDateToISO(nextDate);
    filter.mode = 'date';
    filter.date = shifted;
    stUpdateFilterUI(type);
    stRender(type);
}
window.stShiftDate = stShiftDate;

function stShowToday(type) {
    const filter = stEnsureDateFilter(type);
    filter.mode = 'today';
    filter.date = stTodayISO();
    stUpdateFilterUI(type);
    stRender(type);
}
window.stShowToday = stShowToday;

function stToggleShowAll(type) {
    const filter = stEnsureDateFilter(type);
    if (filter.mode === 'all') {
        filter.mode = 'today';
        filter.date = stTodayISO();
    } else {
        filter.mode = 'all';
        filter.date = filter.date || stTodayISO();
    }
    stUpdateFilterUI(type);
    stRender(type);
}
window.stToggleShowAll = stToggleShowAll;

// --------------- RENDER ---------------
function stRender(type) {
    const isKasir = (type === 'kasir');
    let allData = [];

    if (type === 'cs_line')           allData = stState.csLine;
    else if (type === 'kapten_kasir') allData = stState.kapten;
    else if (type === 'kasir')        allData = stState.kasir;

    let filteredData = stGetFilteredData(type, allData);

    // Filter agar hanya staff dengan role CS LINE & KAPTEN KASIR yang tampil di dashboard CS LINE dan KAPTEN KASIR
    if (type === 'cs_line' || type === 'kapten_kasir') {
        const allowedRoles = ['CS LINE', 'KAPTEN KASIR'];
        filteredData = filteredData.filter(row => {
            // 1. Cek jika row memiliki properti role
            if (row.role) {
                const rUpper = window.formatRoleNameUpper ? window.formatRoleNameUpper(row.role) : (row.role || '').toUpperCase().trim();
                return allowedRoles.includes(rUpper);
            }

            const nameToMatch = (row.petugas || row.created_by || '').trim().toLowerCase();
            if (!nameToMatch) return true;

            const staffList = window.state?.staff || [];
            // 2. Pencarian di state.staff (persis atau mengandung)
            const staffMember = staffList.find(s => {
                const sName = (s.name || '').trim().toLowerCase();
                return sName === nameToMatch || nameToMatch.includes(sName) || sName.includes(nameToMatch);
            });

            if (staffMember) {
                const sRole = window.formatRoleNameUpper ? window.formatRoleNameUpper(staffMember.role) : (staffMember.role || '').toUpperCase().trim();
                return allowedRoles.includes(sRole);
            }

            // 3. Jika nama petugas mengandung teks CS LC atau KASIR (bukan Kapten Kasir)
            const upperPetugas = (row.petugas || row.created_by || '').toUpperCase();
            if (upperPetugas.includes('CS LC')) return false;
            if (upperPetugas.includes('KASIR') && !upperPetugas.includes('KAPTEN KASIR')) return false;

            return true;
        });
    }

    stUpdateFilterUI(type);

    // Split data by shift
    const pagiData = filteredData.filter(row => row.shift === 'Pagi');
    const malamData = filteredData.filter(row => row.shift === 'Malam');

    // Update count badges
    const typePrefix = stTypePrefix(type);
    const countPagi = document.getElementById(`countST${typePrefix}Pagi`);
    const countMalam = document.getElementById(`countST${typePrefix}Malam`);
    if (countPagi) countPagi.textContent = `${pagiData.length} Record`;
    if (countMalam) countMalam.textContent = `${malamData.length} Record`;

    // Render both shifts
    stRenderShift(type, 'Pagi', pagiData, isKasir);
    stRenderShift(type, 'Malam', malamData, isKasir);
}

function stRenderShift(type, shift, data, isKasir) {
    const typePrefix = stTypePrefix(type);
    const tbodyId = `st${typePrefix}${shift}Tbody`;
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const colSpan = isKasir ? 6 : 5;
    const canEdit = stCanAccess(type);
    const filter = stEnsureDateFilter(type);
    const emptyMessage = filter.mode === 'all'
        ? `Belum ada data serah terima shift ${shift}.`
        : `Belum ada data serah terima shift ${shift} untuk tanggal ${stFormatFilterDate(filter.date)}.`;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="padding:40px;text-align:center;color:rgba(255,255,255,0.3);font-size:0.85rem;"><i class="fa-solid fa-inbox" style="font-size:2rem;display:block;margin-bottom:10px;opacity:0.3;"></i>${emptyMessage}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    
    // Sort by date descending (newest first)
    const sortedData = [...data].sort((a, b) => {
        const dateA = new Date(a.tanggal || '1970-01-01');
        const dateB = new Date(b.tanggal || '1970-01-01');
        return dateB - dateA;
    });

    sortedData.forEach((row) => {
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.15s;';
        tr.onmouseover = () => tr.style.background = 'rgba(168,85,247,0.05)';
        tr.onmouseout  = () => tr.style.background = '';

        const tgl = row.tanggal ? new Date(row.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '-';
        const shiftBadge = shift === 'Pagi'
            ? `<span style="background:rgba(245,158,11,0.15);color:#fbbf24;padding:3px 8px;border-radius:6px;font-size:0.7rem;font-weight:700;">☀ ${shift}</span>`
            : `<span style="background:rgba(99,102,241,0.15);color:#818cf8;padding:3px 8px;border-radius:6px;font-size:0.7rem;font-weight:700;">🌙 ${shift}</span>`;

        const isiPreview = (row.isi || '-').substring(0, 100) + ((row.isi || '').length > 100 ? '...' : '');
        
        // Read status badge
        const isRead = row.is_read || false;
        const readBadge = isRead 
            ? `<span style="background:rgba(16,185,129,0.15);color:#10b981;padding:2px 6px;border-radius:4px;font-size:0.65rem;font-weight:700;">✓ Dibaca</span>`
            : `<span style="background:rgba(245,158,11,0.15);color:#fbbf24;padding:2px 6px;border-radius:4px;font-size:0.65rem;font-weight:700;">Belum Dibaca</span>`;

        const aksiHTML = `
            <div style="display:flex;justify-content:center;gap:6px;">
                <button onclick="stViewDetail('${type}','${row.id}')" title="Lihat Detail"
                    style="background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.3);color:#22d3ee;width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;transition:all 0.2s;"
                    onmouseover="this.style.background='rgba(34,211,238,0.25)'"
                    onmouseout="this.style.background='rgba(34,211,238,0.15)'">
                    <i class="fa-solid fa-eye"></i>
                </button>
                ${!isRead ? `<button onclick="stMarkAsRead('${type}','${row.id}')" title="Tandai Sudah Dibaca"
                    style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#10b981;width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;transition:all 0.2s;"
                    onmouseover="this.style.background='rgba(16,185,129,0.25)'"
                    onmouseout="this.style.background='rgba(16,185,129,0.15)'">
                    <i class="fa-solid fa-check"></i>
                </button>` : ''}
                ${canEdit ? `<button onclick="stOpenEdit('${type}','${row.id}')" title="Edit"
                    style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#818cf8;width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;transition:all 0.2s;"
                    onmouseover="this.style.background='rgba(99,102,241,0.3)'"
                    onmouseout="this.style.background='rgba(99,102,241,0.15)'">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="stDelete('${type}','${row.id}')" title="Hapus"
                    style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171;width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;transition:all 0.2s;"
                    onmouseover="this.style.background='rgba(239,68,68,0.25)'"
                    onmouseout="this.style.background='rgba(239,68,68,0.1)'">
                    <i class="fa-solid fa-trash"></i>
                </button>` : ''}
            </div>`;

        if (isKasir) {
            tr.innerHTML = `
                <td style="padding:12px 14px;font-size:0.82rem;color:rgba(255,255,255,0.8);white-space:nowrap;">
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <i class="fa-solid fa-calendar-day" style="color:#a855f7;font-size:0.75rem;"></i>
                            ${tgl}
                        </div>
                        ${readBadge}
                    </div>
                </td>
                <td style="padding:12px 14px;">${shiftBadge}</td>
                <td style="padding:12px 14px;font-size:0.82rem;color:rgba(255,255,255,0.7);">${row.jobdesk || '-'}</td>
                <td style="padding:12px 14px;font-size:0.82rem;color:rgba(255,255,255,0.85);max-width:320px;">${isiPreview}</td>
                <td style="padding:12px 14px;font-size:0.82rem;color:#c084fc;font-weight:600;">${row.petugas || '-'}</td>
                <td style="padding:12px 14px;text-align:center;">${aksiHTML}</td>
            `;
        } else {
            tr.innerHTML = `
                <td style="padding:12px 14px;font-size:0.82rem;color:rgba(255,255,255,0.8);white-space:nowrap;">
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <i class="fa-solid fa-calendar-day" style="color:#a855f7;font-size:0.75rem;"></i>
                            ${tgl}
                        </div>
                        ${readBadge}
                    </div>
                </td>
                <td style="padding:12px 14px;">${shiftBadge}</td>
                <td style="padding:12px 14px;font-size:0.82rem;color:rgba(255,255,255,0.85);max-width:380px;">${isiPreview}</td>
                <td style="padding:12px 14px;font-size:0.82rem;color:#c084fc;font-weight:600;">${row.petugas || '-'}</td>
                <td style="padding:12px 14px;text-align:center;">${aksiHTML}</td>
            `;
        }

        tbody.appendChild(tr);
    });
}

// --------------- MODAL ---------------
function openSerahTerimaModal(type, id = null) {
    if (!stCanAccess(type)) {
        if (window.showToast) showToast('Anda tidak memiliki akses untuk fitur ini.', 'error');
        return;
    }

    const modal     = document.getElementById('serahTerimaModal');
    const title     = document.getElementById('serahTerimaModalTitle');
    const editId    = document.getElementById('serahTerimaEditId');
    const editType  = document.getElementById('serahTerimaEditType');
    const jobGroup  = document.getElementById('stJobdeskGroup');

    // Tampilkan field Jobdesk hanya untuk KASIR
    if (jobGroup) jobGroup.style.display = (type === 'kasir') ? '' : 'none';

    editType.value = type;

    const typeLabel = {
        cs_line:      'CS LINE',
        kapten_kasir: 'KAPTEN KASIR',
        kasir:        'KASIR'
    }[type] || type.toUpperCase();

    if (id) {
        // Mode Edit
        title.textContent = `Edit Serah Terima ${typeLabel}`;
        editId.value = id;
        stPopulateForm(type, id);
    } else {
        // Mode Tambah
        title.textContent = `Tambah Serah Terima ${typeLabel}`;
        editId.value = '';
        stClearForm();
        // Set tanggal default hari ini
        document.getElementById('stTanggal').value = new Date().toISOString().split('T')[0];
        // Set petugas default dari currentStaff
        const staff = window.state?.currentStaff;
        if (staff) document.getElementById('stPetugas').value = staff.name;
    }

    modal.style.display = 'flex';
}
window.openSerahTerimaModal = openSerahTerimaModal;

function closeSerahTerimaModal() {
    const modal = document.getElementById('serahTerimaModal');
    if (modal) modal.style.display = 'none';
    stClearForm();
}
window.closeSerahTerimaModal = closeSerahTerimaModal;

function stClearForm() {
    ['stTanggal','stIsi','stPetugas','stJobdesk'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const shiftEl = document.getElementById('stShift');
    if (shiftEl) shiftEl.value = 'Pagi';
}

function stPopulateForm(type, id) {
    let data = [];
    if (type === 'cs_line')      data = stState.csLine;
    else if (type === 'kapten_kasir') data = stState.kapten;
    else if (type === 'kasir')   data = stState.kasir;

    const row = data.find(r => r.id === id);
    if (!row) return;

    document.getElementById('stTanggal').value = row.tanggal || '';
    document.getElementById('stShift').value   = row.shift   || 'Pagi';
    document.getElementById('stIsi').value     = row.isi     || '';
    document.getElementById('stPetugas').value = row.petugas || '';
    if (document.getElementById('stJobdesk')) {
        document.getElementById('stJobdesk').value = row.jobdesk || '';
    }
}

// --------------- SAVE ---------------
async function saveSerahTerima() {
    const type     = document.getElementById('serahTerimaEditType').value;
    const id       = document.getElementById('serahTerimaEditId').value;
    const tanggal  = document.getElementById('stTanggal').value;
    const shift    = document.getElementById('stShift').value;
    const isi      = document.getElementById('stIsi').value.trim();
    const petugas  = document.getElementById('stPetugas').value.trim();
    const jobdesk  = document.getElementById('stJobdesk')?.value.trim() || '';

    // Validasi field wajib
    if (!tanggal || !shift || !isi || !petugas) {
        if (window.showToast) showToast('Harap isi semua field yang diperlukan.', 'warning');
        return;
    }

    const table = stTableName(type);
    if (!table) return;

    const staff = window.state?.currentStaff;
    const payload = { tanggal, shift, isi, petugas, created_by: staff?.name || '' };

    // Tambahkan jobdesk untuk KASIR
    if (type === 'kasir') {
        payload.jobdesk = jobdesk;
    }

    try {
        let error;
        if (id) {
            ({ error } = await window.supabaseClient.from(table).update(payload).eq('id', id));
        } else {
            ({ error } = await window.supabaseClient.from(table).insert([payload]));
        }

        if (error) throw error;

        if (window.showToast) showToast(`Data serah terima berhasil disimpan!`, 'success');
        closeSerahTerimaModal();
        await stFetch(type);
        stRender(type);
    } catch (err) {
        console.error('[SerahTerima] Save error:', err.message);
        if (window.showToast) showToast('Gagal menyimpan data: ' + err.message, 'error');
    }
}
window.saveSerahTerima = saveSerahTerima;

// --------------- EDIT ---------------
function stOpenEdit(type, id) {
    openSerahTerimaModal(type, id);
}
window.stOpenEdit = stOpenEdit;

// --------------- DELETE ---------------
async function stDelete(type, id) {
    if (!stCanAccess(type)) {
        if (window.showToast) showToast('Anda tidak memiliki akses.', 'error');
        return;
    }

    const table = stTableName(type);
    const performDelete = async () => {
        try {
            const { error } = await window.supabaseClient.from(table).delete().eq('id', id);
            if (error) throw error;
            if (window.showToast) showToast('Data berhasil dihapus.', 'success');
            await stFetch(type);
            stRender(type);
        } catch (err) {
            console.error('[SerahTerima] Delete error:', err.message);
            if (window.showToast) showToast('Gagal menghapus data.', 'error');
        }
    };

    const typeLabel = {
        cs_line: 'CS LINE',
        kapten_kasir: 'KAPTEN KASIR',
        kasir: 'KASIR'
    }[type] || 'data ini';

    if (typeof window.showCustomConfirm === 'function') {
        const ok = await window.showCustomConfirm(
            `Data serah terima ${typeLabel} akan dihapus secara permanen dari database. Lanjutkan?`,
            'Hapus Serah Terima',
            true
        );
        if (ok) await performDelete();
        return;
    }

    if (typeof window.showConfirm === 'function') {
        window.showConfirm({
            title: 'Hapus Data Serah Terima',
            message: `Data serah terima ${typeLabel} akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`,
            type: 'danger',
            okText: 'Ya, Hapus',
            cancelText: 'Batal',
            onOk: performDelete
        });
        return;
    }

    const confirmed = confirm('Hapus data serah terima ini?');
    if (!confirmed) return;
    await performDelete();
}
window.stDelete = stDelete;

// --------------- INIT (dipanggil saat app ready) ---------------
async function initSerahTerima() {
    stUpdateSidebarAccess();
    await stFetchAll();
    stRender('cs_line');
    stRender('kapten_kasir');
    stRender('kasir');
    stSetupRealtime();
}
window.initSerahTerima = initSerahTerima;

// Export untuk dipanggil dari app.js saat staff berubah
window.stUpdateSidebarAccess = stUpdateSidebarAccess;

// --------------- REALTIME ---------------
function stSetupRealtime() {
    // Unsubscribe dulu jika ada
    stState.realtimeSubs.forEach(sub => {
        try { window.supabaseClient.removeChannel(sub); } catch (_) {}
    });
    stState.realtimeSubs = [];

    const tables = [
        { key: 'cs_line',      table: 'serah_terima_cs_line' },
        { key: 'kapten_kasir', table: 'serah_terima_kapten_kasir' },
        { key: 'kasir',        table: 'serah_terima_kasir' }
    ];

    tables.forEach(({ key, table }) => {
        const ch = window.supabaseClient
            .channel(`realtime:${table}`)
            .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
                const getArr = () => key === 'cs_line' ? stState.csLine : (key === 'kapten_kasir' ? stState.kapten : stState.kasir);
                if (payload.eventType === 'INSERT') {
                    const arr = getArr();
                    const exist = arr.some(r => r.id === payload.new.id);
                    if (!exist) arr.unshift(payload.new);
                } else if (payload.eventType === 'UPDATE') {
                    const arr = getArr();
                    const idx = arr.findIndex(r => r.id === payload.new.id);
                    if (idx !== -1) arr[idx] = payload.new;
                    else arr.unshift(payload.new);
                } else if (payload.eventType === 'DELETE') {
                    const deletedId = payload.old?.id;
                    if (deletedId) {
                        if (key === 'cs_line') stState.csLine = stState.csLine.filter(r => r.id !== deletedId);
                        else if (key === 'kapten_kasir') stState.kapten = stState.kapten.filter(r => r.id !== deletedId);
                        else if (key === 'kasir') stState.kasir = stState.kasir.filter(r => r.id !== deletedId);
                    }
                }
                stRender(key);
            })
            .subscribe();
        stState.realtimeSubs.push(ch);
    });
}

// --------------- VIEW DETAIL ---------------
function stViewDetail(type, id) {
    let data = [];
    if (type === 'cs_line')      data = stState.csLine;
    else if (type === 'kapten_kasir') data = stState.kapten;
    else if (type === 'kasir')   data = stState.kasir;

    const row = data.find(r => r.id === id);
    if (!row) return;

    const modal = document.getElementById('stDetailModal');
    const tgl = row.tanggal ? new Date(row.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }) : '-';
    const isiText = (row.isi || '-').replace(/\n/g, '<br>');
    const isRead = row.is_read || false;
    const readBadge = isRead 
        ? `<span style="background:rgba(16,185,129,0.15);color:#10b981;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;">✓ Sudah Dibaca</span>`
        : `<span style="background:rgba(245,158,11,0.15);color:#fbbf24;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;">⚠ Belum Dibaca</span>`;

    const typeLabel = {
        cs_line:      'CS LINE',
        kapten_kasir: 'KAPTEN KASIR',
        kasir:        'KASIR'
    }[type] || type.toUpperCase();

    const jobdeskRow = (type === 'kasir' && row.jobdesk) 
        ? `<div style="display:flex;margin-bottom:16px;gap:12px;">
            <div style="min-width:120px;color:rgba(255,255,255,0.5);font-weight:600;font-size:0.8rem;">Jobdesk:</div>
            <div style="color:rgba(255,255,255,0.9);font-size:0.85rem;">${row.jobdesk}</div>
           </div>` 
        : '';

    document.getElementById('stDetailContent').innerHTML = `
        <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid rgba(168,85,247,0.2);">
            <h3 style="color:#c084fc;font-size:1.1rem;font-weight:800;margin:0 0 6px 0;">Detail Serah Terima ${typeLabel}</h3>
            ${readBadge}
        </div>
        <div style="display:flex;margin-bottom:16px;gap:12px;">
            <div style="min-width:120px;color:rgba(255,255,255,0.5);font-weight:600;font-size:0.8rem;">Tanggal:</div>
            <div style="color:rgba(255,255,255,0.9);font-size:0.85rem;"><i class="fa-solid fa-calendar-day" style="color:#a855f7;margin-right:6px;"></i>${tgl}</div>
        </div>
        <div style="display:flex;margin-bottom:16px;gap:12px;">
            <div style="min-width:120px;color:rgba(255,255,255,0.5);font-weight:600;font-size:0.8rem;">Shift:</div>
            <div style="color:rgba(255,255,255,0.9);font-size:0.85rem;">${row.shift === 'Pagi' ? '☀ Pagi' : '🌙 Malam'}</div>
        </div>
        ${jobdeskRow}
        <div style="display:flex;margin-bottom:16px;gap:12px;">
            <div style="min-width:120px;color:rgba(255,255,255,0.5);font-weight:600;font-size:0.8rem;">Petugas:</div>
            <div style="color:#c084fc;font-weight:600;font-size:0.85rem;">${row.petugas || '-'}</div>
        </div>
        <div style="margin-top:24px;">
            <div style="color:rgba(255,255,255,0.5);font-weight:600;font-size:0.8rem;margin-bottom:8px;">Isi (Catatan):</div>
            <div style="background:rgba(168,85,247,0.05);border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:16px;color:rgba(255,255,255,0.9);line-height:1.6;font-size:0.9rem;">${isiText}</div>
        </div>
        ${!isRead ? `<div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(168,85,247,0.2);">
            <button onclick="stMarkAsRead('${type}','${row.id}');closeStDetailModal();" 
                style="width:100%;padding:12px;background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.3);color:#10b981;border-radius:10px;font-weight:700;cursor:pointer;font-size:0.85rem;transition:all 0.2s;"
                onmouseover="this.style.background='rgba(16,185,129,0.3)'"
                onmouseout="this.style.background='rgba(16,185,129,0.2)'">
                <i class="fa-solid fa-check"></i> Tandai Sudah Dibaca
            </button>
        </div>` : ''}
    `;

    modal.style.display = 'flex';
}
window.stViewDetail = stViewDetail;

function closeStDetailModal() {
    const modal = document.getElementById('stDetailModal');
    if (modal) modal.style.display = 'none';
}
window.closeStDetailModal = closeStDetailModal;

// --------------- MARK AS READ ---------------
async function stMarkAsRead(type, id) {
    const table = stTableName(type);
    if (!table) return;

    try {
        const { error } = await window.supabaseClient
            .from(table)
            .update({ is_read: true })
            .eq('id', id);

        if (error) throw error;

        if (window.showToast) showToast('Data ditandai sudah dibaca.', 'success');
        await stFetch(type);
        stRender(type);
    } catch (err) {
        console.error('[SerahTerima] Mark as read error:', err.message);
        if (window.showToast) showToast('Gagal menandai data: ' + err.message, 'error');
    }
}
window.stMarkAsRead = stMarkAsRead;

// --------------- INIT DATE PICKERS ---------------
function stInitDatePickers() {
    // Date pickers removed - using shift tabs instead
}
window.stInitDatePickers = stInitDatePickers;

// --------------- SETUP TAB SWITCHING ---------------
function stSetupTabSwitching() {
    // CS LINE Tabs
    const btnCSLinePagi = document.getElementById('btnSTCSLineTabPagi');
    const btnCSLineMalam = document.getElementById('btnSTCSLineTabMalam');
    const contCSLinePagi = document.getElementById('stCSLineContainerPagi');
    const contCSLineMalam = document.getElementById('stCSLineContainerMalam');
    
    if (btnCSLinePagi && btnCSLineMalam && contCSLinePagi && contCSLineMalam) {
        btnCSLinePagi.addEventListener('click', () => {
            btnCSLinePagi.classList.add('active');
            btnCSLineMalam.classList.remove('active');
            contCSLinePagi.classList.remove('hide');
            contCSLineMalam.classList.add('hide');
        });
        btnCSLineMalam.addEventListener('click', () => {
            btnCSLineMalam.classList.add('active');
            btnCSLinePagi.classList.remove('active');
            contCSLineMalam.classList.remove('hide');
            contCSLinePagi.classList.add('hide');
        });
    }

    // KAPTEN KASIR Tabs
    const btnKaptenPagi = document.getElementById('btnSTKaptenTabPagi');
    const btnKaptenMalam = document.getElementById('btnSTKaptenTabMalam');
    const contKaptenPagi = document.getElementById('stKaptenContainerPagi');
    const contKaptenMalam = document.getElementById('stKaptenContainerMalam');
    
    if (btnKaptenPagi && btnKaptenMalam && contKaptenPagi && contKaptenMalam) {
        btnKaptenPagi.addEventListener('click', () => {
            btnKaptenPagi.classList.add('active');
            btnKaptenMalam.classList.remove('active');
            contKaptenPagi.classList.remove('hide');
            contKaptenMalam.classList.add('hide');
        });
        btnKaptenMalam.addEventListener('click', () => {
            btnKaptenMalam.classList.add('active');
            btnKaptenPagi.classList.remove('active');
            contKaptenMalam.classList.remove('hide');
            contKaptenPagi.classList.add('hide');
        });
    }

    // KASIR Tabs
    const btnKasirPagi = document.getElementById('btnSTKasirTabPagi');
    const btnKasirMalam = document.getElementById('btnSTKasirTabMalam');
    const contKasirPagi = document.getElementById('stKasirContainerPagi');
    const contKasirMalam = document.getElementById('stKasirContainerMalam');
    
    if (btnKasirPagi && btnKasirMalam && contKasirPagi && contKasirMalam) {
        btnKasirPagi.addEventListener('click', () => {
            btnKasirPagi.classList.add('active');
            btnKasirMalam.classList.remove('active');
            contKasirPagi.classList.remove('hide');
            contKasirMalam.classList.add('hide');
        });
        btnKasirMalam.addEventListener('click', () => {
            btnKasirMalam.classList.add('active');
            btnKasirPagi.classList.remove('active');
            contKasirMalam.classList.remove('hide');
            contKasirPagi.classList.add('hide');
        });
    }
}

// --------------- RENDER SAAT NAVIGATION ---------------
// Hook ke sistem navigasi existing agar data di-render ulang saat halaman dibuka
document.addEventListener('DOMContentLoaded', () => {
    // Setup tab switching
    stSetupTabSwitching();

    // Pasang observer pada view-sections
    const observer = new MutationObserver(() => {
        const viewMap = {
            serahTerimaCSLineView:  'cs_line',
            serahTerimaKaptenView:  'kapten_kasir',
            serahTerimaKasirView:   'kasir'
        };
        Object.entries(viewMap).forEach(([viewId, type]) => {
            const el = document.getElementById(viewId);
            if (el && el.classList.contains('active')) {
                stRender(type);
            }
        });
    });

    ['serahTerimaCSLineView', 'serahTerimaKaptenView', 'serahTerimaKasirView'].forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
});
