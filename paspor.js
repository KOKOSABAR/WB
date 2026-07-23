// ====================================================
// SERAH TERIMA PASPOR — versi bersih
// ====================================================

// ─── Init state paspor ──────────────────────────────
(function initPasporState() {
    if (!state.pasporSelectedDate) {
        state.pasporSelectedDate = new Date().toLocaleDateString('sv-SE');
    }
    if (!state.passportHandovers) state.passportHandovers = [];
    if (!state.pasporSearchQuery) state.pasporSearchQuery = '';
    if (!state.pasporRoleFilter) state.pasporRoleFilter = 'all';
    if (!state.pasporStatusFilter) state.pasporStatusFilter = 'all';
    if (state.pasporUseLocalFallback === undefined) state.pasporUseLocalFallback = false;
    if (state.pasporSetupNoticeShown === undefined) state.pasporSetupNoticeShown = false;
})();

// ─── Ambil data dari LocalStorage ───────────────────
function _loadPasporLocal() {
    try {
        const localData = JSON.parse(localStorage.getItem('restease_passport_handovers') || '[]');
        state.passportHandovers = localData.filter(h => h.date === state.pasporSelectedDate);
    } catch (e) {
        state.passportHandovers = [];
    }
}

// ─── Ambil data handover dari Supabase ──────────────
async function fetchPassportData() {
    if (!supabaseClient || state.pasporUseLocalFallback) {
        _loadPasporLocal();
        return;
    }
    try {
        const { data, error } = await supabaseClient
            .from('passport_handovers')
            .select('*')
            .eq('date', state.pasporSelectedDate);
        if (error) {
            if (error.code === '42P01') {
                console.warn("Tabel 'passport_handovers' tidak ditemukan di Supabase. Beralih ke LocalStorage.");
                if (!state.pasporSetupNoticeShown) {
                    showToast("Tabel paspor belum ada di Supabase. Jalankan skrip `supabase_paspor_setup.sql`.", 'warning');
                    state.pasporSetupNoticeShown = true;
                }
                state.pasporUseLocalFallback = true;
                _loadPasporLocal();
                return;
            }
            throw error;
        }
        state.passportHandovers = data || [];
    } catch (e) {
        console.error("Gagal memuat dari Supabase, beralih ke lokal:", e);
        state.pasporUseLocalFallback = true;
        _loadPasporLocal();
    }
}

async function syncPasporAbsensiMonth(dateStr = state.pasporSelectedDate) {
    const parts = (dateStr || '').split('-');
    if (parts.length < 2) return;

    const targetMonth = `${parts[0]}-${parts[1]}`;
    if (state.absensiSelectedMonth !== targetMonth) {
        state.absensiSelectedMonth = targetMonth;
        if (typeof fetchAbsensiData === 'function') {
            await fetchAbsensiData();
        }
    }
}

async function refreshPasporView() {
    await syncPasporAbsensiMonth(state.pasporSelectedDate);
    await fetchPassportData();
    populatePasporPetugasDropdown();
    renderPasporView();
}

function normalizePasporName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function normalizePasporRole(value) {
    const role = String(value || '').trim().toUpperCase();
    return role === 'CS' ? 'CS LC' : role;
}

function getShiftValueForDate(schedule, dayIdx) {
    if (!Array.isArray(schedule) || dayIdx < 0) return '';
    return String(schedule[dayIdx] ?? '').trim().toUpperCase();
}

function findAbsensiShiftForPasporStaff(staff, monthStr) {
    return state.absensiShifts.find(shiftRow =>
        shiftRow &&
        shiftRow.month_str === monthStr &&
        (
            (shiftRow.staff_id && staff.id && shiftRow.staff_id === staff.id) ||
            (shiftRow.staff_name && normalizePasporName(shiftRow.staff_name) === normalizePasporName(staff.name))
        )
    );
}

function getPasporStaffKey(staffLike) {
    if (staffLike?.id) return `id:${staffLike.id}`;
    if (staffLike?.staff_id) return `id:${staffLike.staff_id}`;
    return `name:${normalizePasporName(staffLike?.name || staffLike?.staff_name)}`;
}

function dedupePasporStaffList(list = []) {
    const byKey = new Map();

    list.forEach(item => {
        const key = getPasporStaffKey(item);
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, item);
            return;
        }

        const merged = {
            ...existing,
            ...item,
            id: existing.id || item.id || null,
            name: existing.name || item.name || item.staff_name || 'STAFF',
            role: existing.role || item.role || ''
        };
        byKey.set(key, merged);
    });

    return Array.from(byKey.values());
}

function findPasporHandover(staff) {
    return state.passportHandovers.find(h =>
        (staff?.id && h.staff_id === staff.id) ||
        (staff?.name && normalizePasporName(h.staff_name) === normalizePasporName(staff.name))
    ) || {
        status_masuk: 'BELUM',
        status_pulang: 'BELUM',
        notes: ''
    };
}

// ─── Dapatkan staff yang masuk pagi/malam hari ini ──
function getShiftStaffForDate(dateStr) {
    const parts = (dateStr || '').split('-');
    if (parts.length < 3) return { pagi: [], malam: [] };

    const monthStr = `${parts[0]}-${parts[1]}`;
    const dayIdx = parseInt(parts[2], 10) - 1;
    const pagi = [];
    const malam = [];
    const shiftByStaffKey = new Map();

    state.absensiShifts.forEach(shiftRow => {
        if (!shiftRow || shiftRow.month_str !== monthStr) return;
        if (shiftRow.staff_id) {
            shiftByStaffKey.set(`id:${shiftRow.staff_id}`, shiftRow);
        }
        if (shiftRow.staff_name) {
            shiftByStaffKey.set(`name:${normalizePasporName(shiftRow.staff_name)}`, shiftRow);
        }
    });

    state.staff.forEach(staff => {
        const shiftRow = shiftByStaffKey.get(`id:${staff.id}`) || shiftByStaffKey.get(`name:${normalizePasporName(staff.name)}`);
        const shiftValue = getShiftValueForDate(shiftRow?.schedule, dayIdx);
        if (!shiftValue || shiftValue === 'OFF' || shiftValue === 'CUTI') return;

        const staffData = {
            id: staff.id,
            name: staff.name,
            role: staff.role,
            passport_number: staff.passport_number || ''
        };

        if (shiftValue === '1') {
            pagi.push(staffData);
        }
        if (shiftValue === '2') {
            malam.push(staffData);
        }
    });

    return {
        pagi: dedupePasporStaffList(pagi),
        malam: dedupePasporStaffList(malam)
    };
}

// ─── Isi dropdown Petugas (CS LINE saja) ────────────
function populatePasporPetugasDropdown() {
    const sel = document.getElementById('pasporPetugasSelect');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Pilih Petugas —</option>';

    state.staff
        .filter(s => (s.role || '').toLowerCase().trim() === 'cs line')
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(s => {
            const o = document.createElement('option');
            o.value = s.name;
            o.textContent = s.name;
            sel.appendChild(o);
        });

    sel.innerHTML += '<option value="__manual__">✏️ Ketik manual...</option>';
    if (cur) sel.value = cur;
}

// ─── RENDER UTAMA ────────────────────────────────────
function renderPasporView() {
    const view = document.getElementById('pasporView');
    if (!view) return; // Tidak perlu cek .hide / .active — render selalu

    // 1. Tanggal & salam
    const now = new Date();
    const todayStr = now.toLocaleDateString('sv-SE');
    const isToday = state.pasporSelectedDate === todayStr;
    const dObj = new Date(state.pasporSelectedDate + 'T00:00:00');
    const dateLabel = dObj.toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    _setText('pasporDateDisplay', isToday ? 'Hari Ini' : 'Tanggal Dipilih');
    _setText('pasporDateText', dateLabel);
    _setText('pasporTitleDate', dateLabel.toUpperCase());

    const h = now.getHours();
    let salam = 'SELAMAT PAGI';
    if (h >= 12 && h < 15) salam = 'SELAMAT SIANG';
    else if (h >= 15 && h < 18) salam = 'SELAMAT SORE';
    else if (h >= 18) salam = 'SELAMAT MALAM';
    _setText('pasporGreeting', salam);

    // 2. Data shift hari ini dari absensi
    const { pagi, malam } = getShiftStaffForDate(state.pasporSelectedDate);
    const handoverByStaffKey = new Map();
    state.passportHandovers.forEach(h => {
        if (h.staff_id) {
            handoverByStaffKey.set(`id:${h.staff_id}`, h);
        }
        if (h.staff_name) {
            handoverByStaffKey.set(`name:${normalizePasporName(h.staff_name)}`, h);
        }
    });
    const getHandoverFast = (staff) =>
        handoverByStaffKey.get(`id:${staff?.id}`) ||
        handoverByStaffKey.get(`name:${normalizePasporName(staff?.name)}`) || {
            status_masuk: 'BELUM',
            status_pulang: 'BELUM',
            notes: ''
        };

    // 3. Filter pencarian / role / status
    function applyFilters(list) {
        let res = list.map(s => ({
            staff: s,
            handover: getHandoverFast(s)
        }));

        if (state.pasporSearchQuery) {
            const q = state.pasporSearchQuery.toLowerCase();
            res = res.filter(d =>
                d.staff.name.toLowerCase().includes(q) ||
                (d.staff.passport_number || '').toLowerCase().includes(q)
            );
        }
        if (state.pasporRoleFilter !== 'all') {
            res = res.filter(d => normalizePasporRole(d.staff.role).toLowerCase() === state.pasporRoleFilter);
        }
        if (state.pasporStatusFilter !== 'all') {
            res = res.filter(d => {
                const hv = d.handover;
                if (state.pasporStatusFilter === 'belum_masuk') return hv.status_masuk === 'BELUM';
                if (state.pasporStatusFilter === 'sudah_masuk') return hv.status_masuk === 'SUDAH';
                if (state.pasporStatusFilter === 'belum_pulang') return hv.status_pulang === 'BELUM';
                if (state.pasporStatusFilter === 'sudah_pulang') return hv.status_pulang === 'SUDAH';
                return true;
            });
        }
        return res;
    }

    const pagiData = applyFilters(pagi);
    const malamData = applyFilters(malam);

    // 4. Update count badge
    _setText('countPasporPagi', pagi.length + ' Staff');
    _setText('countPasporMalam', malam.length + ' Staff');

    // 5. Render tabel
    _renderTable('pasporPagiTbody', pagiData, 'PAGI');
    _renderTable('pasporMalamTbody', malamData, 'MALAM');

    // 6. Statistik (semua shift, tanpa filter)
    const allUniqueStaff = [...new Map([...pagi, ...malam].map(s => [getPasporStaffKey(s), s])).values()];
    const allData = allUniqueStaff.map(s => ({
        staff: s,
        handover: getHandoverFast(s)
    }));
    const total = allData.length;
    const masuk = allData.filter(d => d.handover.status_masuk === 'SUDAH').length;
    const pulang = allData.filter(d => d.handover.status_pulang === 'SUDAH').length;
    const belumMasuk = total - masuk;
    const belumPulang = total - pulang;
    const masukPct = total > 0 ? Math.round(masuk / total * 100) : 0;
    const pulangPct = total > 0 ? Math.round(pulang / total * 100) : 0;

    _setText('statPasporTotal', total);
    _setText('statPasporMasuk', masuk);
    _setText('statPasporTotalM', total);
    _setText('statPasporMasukPct', masukPct + '%');
    _setText('statPasporPulang', pulang);
    _setText('statPasporTotalP', total);
    _setText('statPasporPulangPct', pulangPct + '%');
    _setText('statPasporBelum', belumMasuk + belumPulang);
    _setText('statPasporBelumDetail', belumMasuk + ' MASUK — ' + belumPulang + ' PULANG');
    _setText('pasporSubGreeting', total + ' STAFF TERDAFTAR HARI INI');
}

function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ─── Render satu tabel ───────────────────────────────
function _renderTable(tbodyId, dataList, shift) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';

    if (dataList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:30px; text-align:center; color:var(--text-muted);">
                    <i class="fa-solid fa-inbox" style="font-size:1.8rem; display:block; margin-bottom:10px; opacity:0.3;"></i>
                    Belum ada staff yang terdaftar untuk Shift ${shift} hari ini.<br>
                    <small style="opacity:0.5;">Pastikan jadwal shift sudah diisi di halaman Absensi.</small>
                </td>
            </tr>`;
        return;
    }

    const ROLE_PRIORITY = {
        'cs line': 1,
        'cs': 2,
        'cs lc': 2,
        'kapten kasir': 3,
        'kasir': 4
    };

    let lastRole = null;
    let idx = 0;

    [...dataList]
        .sort((a, b) => {
            const roleA = normalizePasporRole(a.staff.role).toLowerCase().trim();
            const roleB = normalizePasporRole(b.staff.role).toLowerCase().trim();
            const priorityA = ROLE_PRIORITY[roleA] || 99;
            const priorityB = ROLE_PRIORITY[roleB] || 99;
            if (priorityA !== priorityB) return priorityA - priorityB;
            return a.staff.name.localeCompare(b.staff.name);
        })
        .forEach((d) => {
            const s = d.staff;
            const hv = d.handover;
            const currentRole = normalizePasporRole(s.role).toLowerCase().trim();

            // Jika jabatan berubah, tambahkan baris pemisah (divider)
            if (currentRole !== lastRole) {
                const dividerTr = document.createElement('tr');
                dividerTr.className = 'category-divider-row';
                
                let displayRoleName = normalizePasporRole(s.role);
                
                dividerTr.innerHTML = `
                    <td colspan="6" class="paspor-role-divider">
                        ${displayRoleName}
                    </td>
                `;
                tbody.appendChild(dividerTr);
                lastRole = currentRole;
            }

            idx++;
            const tr = document.createElement('tr');

            const roleLabel = normalizePasporRole(s.role);

            // Cell HTML (kecuali button, di-inject via JS)
            tr.innerHTML = `
                <td class="paspor-col-no">${idx}</td>
                <td class="paspor-col-name"><strong>${s.name}</strong></td>
                <td class="paspor-col-role"><span class="role-badge paspor-role-badge">${roleLabel}</span></td>
                <td class="cell-masuk paspor-status-cell"></td>
                <td class="cell-pulang paspor-status-cell"></td>
                <td class="paspor-note-cell">
                    <input
                        type="text"
                        class="paspor-notes"
                        value="${(hv.notes || '').replace(/"/g, '&quot;')}"
                        placeholder="—"
                        data-sid="${s.id}"
                        data-shift="${shift}"
                        spellcheck="false">
                </td>`;

            // ── Tombol MASUK ──
            const btnM = document.createElement('button');
            if (hv.status_masuk === 'SUDAH') {
                btnM.className = 'btn btn-status-sudah';
                btnM.innerHTML = '<i class="fa-solid fa-check" style="margin-right:4px;"></i>SUDAH';
                btnM.onclick = () => _setStatus(s.id, 'masuk', 'BELUM', shift);
                tr.querySelector('.cell-masuk').appendChild(btnM);
                
            } else {
                btnM.className = 'btn btn-status-belum';
                btnM.innerHTML = '<i class="fa-solid fa-minus" style="margin-right:4px;"></i>BELUM';
                btnM.onclick = () => _setStatus(s.id, 'masuk', 'SUDAH', shift);
                tr.querySelector('.cell-masuk').appendChild(btnM);
            }
            const lblM = document.createElement('div');
            lblM.className = 'paspor-petugas-label';
            lblM.textContent = hv.status_masuk === 'SUDAH' ? (hv.petugas_masuk || 'Petugas') : '\u00A0';
            lblM.title = hv.status_masuk === 'SUDAH' ? (hv.petugas_masuk || 'Petugas') : '';
            tr.querySelector('.cell-masuk').appendChild(lblM);

            // ── Tombol PULANG ──
            const btnP = document.createElement('button');
            if (hv.status_masuk === 'BELUM') {
                btnP.className = 'btn btn-status-locked';
                btnP.innerHTML = '🔒 BELUM';
                btnP.disabled = true;
                btnP.title = 'Serahkan paspor masuk terlebih dahulu';
                tr.querySelector('.cell-pulang').appendChild(btnP);
            } else if (hv.status_pulang === 'SUDAH') {
                btnP.className = 'btn btn-status-sudah';
                btnP.innerHTML = '<i class="fa-solid fa-check" style="margin-right:4px;"></i>SUDAH';
                btnP.onclick = () => _setStatus(s.id, 'pulang', 'BELUM', shift);
                tr.querySelector('.cell-pulang').appendChild(btnP);
                
            } else {
                btnP.className = 'btn btn-status-belum';
                btnP.innerHTML = '<i class="fa-solid fa-minus" style="margin-right:4px;"></i>BELUM';
                btnP.onclick = () => _setStatus(s.id, 'pulang', 'SUDAH', shift);
                tr.querySelector('.cell-pulang').appendChild(btnP);
            }
            const lblP = document.createElement('div');
            lblP.className = 'paspor-petugas-label';
            lblP.textContent = hv.status_pulang === 'SUDAH' ? (hv.petugas_pulang || 'Petugas') : '\u00A0';
            lblP.title = hv.status_pulang === 'SUDAH' ? (hv.petugas_pulang || 'Petugas') : '';
            tr.querySelector('.cell-pulang').appendChild(lblP);

            // ── Event: simpan Catatan ──
            const ninput = tr.querySelector('.paspor-notes');
            ninput.addEventListener('blur', () => _saveNote(s.id, shift, ninput.value));
            ninput.addEventListener('keydown', e => { if (e.key === 'Enter') ninput.blur(); });

            tbody.appendChild(tr);
        });
}

// ─── Simpan status lokal (fallback) ──────────────────
function _setStatusLocal(staffId, record) {
    try {
        let allLocal = JSON.parse(localStorage.getItem('restease_passport_handovers') || '[]');
        const idx = allLocal.findIndex(h => h.staff_id === staffId && h.date === record.date);
        if (idx > -1) {
            allLocal[idx] = { ...allLocal[idx], ...record };
        } else {
            record.id = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            allLocal.push(record);
        }
        localStorage.setItem('restease_passport_handovers', JSON.stringify(allLocal));
        state.passportHandovers = allLocal.filter(h => h.date === state.pasporSelectedDate);
        renderPasporView();
    } catch (e) {
        console.error('Gagal simpan status lokal:', e);
        showToast('Gagal menyimpan status.', 'error');
    }
}

// ─── Custom Alert Modal (Glassmorphism) ─────────────
function showCustomAlert(message, title = "Perhatian") {
    return new Promise((resolve) => {
        const modal = document.getElementById("customConfirmModal");
        if (!modal) {
            alert(message);
            resolve();
            return;
        }
        const titleEl = document.getElementById("confirmTitle");
        const messageEl = document.getElementById("confirmMessage");
        const btnCancel = document.getElementById("btnConfirmCancel");
        const btnOk = document.getElementById("btnConfirmOk");
        const iconEl = modal.querySelector(".modal-icon i");
        const cardEl = modal.querySelector(".modal-card");
        const iconBox = modal.querySelector(".modal-icon");
        
        // Simpan state asli
        const origOkText = btnOk.textContent;
        const origOkClass = btnOk.className;
        const origIconClass = iconEl.className;
        const origCardBorder = cardEl.style.border;
        const origIconColor = iconBox.style.color;
        const origIconBg = iconBox.style.background;
        const origCancelDisplay = btnCancel.style.display;
        
        // Terapkan state Alert
        titleEl.textContent = title;
        messageEl.textContent = message;
        btnCancel.style.display = "none";
        btnOk.className = "btn btn-primary";
        btnOk.textContent = "OK";
        iconEl.className = "fa-solid fa-circle-exclamation";
        cardEl.style.border = "1px solid rgba(245, 158, 11, 0.35)";
        iconBox.style.color = "var(--warning)";
        iconBox.style.background = "rgba(245, 158, 11, 0.15)";
        
        modal.classList.remove("hide");
        
        const onOk = () => {
            modal.classList.add("hide");
            
            // Kembalikan state semula
            btnCancel.style.display = origCancelDisplay;
            btnOk.className = origOkClass;
            btnOk.textContent = origOkText;
            iconEl.className = origIconClass;
            cardEl.style.border = origCardBorder;
            iconBox.style.color = origIconColor;
            iconBox.style.background = origIconBg;
            
            btnOk.removeEventListener("click", onOk);
            resolve();
        };
        
        btnOk.addEventListener("click", onOk);
    });
}

// ─── Simpan status MASUK / PULANG ───────────────────
async function _setStatus(staffId, type, newVal, shift) {
    // Ambil nama petugas
    const selEl = document.getElementById('pasporPetugasSelect');
    let petugas = selEl ? selEl.value : '';
    if (petugas === '__manual__') {
        petugas = (document.getElementById('pasporPetugasManual')?.value || '').trim();
    }

    // Wajib memilih petugas jika mengubah status menjadi SUDAH
    if (newVal === 'SUDAH' && !petugas) {
        showCustomAlert('SILAHKAN PILIH NAMA PETUGAS TERLEBIH DAHULU', 'Peringatan');
        selEl?.focus();
        return;
    }

    const existing = state.passportHandovers.find(h => h.staff_id === staffId);
    const record = {
        staff_id: staffId,
        date: state.pasporSelectedDate,
        shift,
        status_masuk: existing ? existing.status_masuk : 'BELUM',
        status_pulang: existing ? existing.status_pulang : 'BELUM',
        notes: existing ? existing.notes : '',
        petugas_masuk: existing ? existing.petugas_masuk : null,
        petugas_pulang: existing ? existing.petugas_pulang : null
    };

    if (type === 'masuk') {
        record.status_masuk = newVal;
        record.waktu_masuk = newVal === 'SUDAH' ? new Date().toISOString() : null;
        if (newVal === 'BELUM') { 
            record.status_pulang = 'BELUM'; 
            record.waktu_pulang = null; 
            record.petugas_masuk = null;
            record.petugas_pulang = null;
        } else {
            record.petugas_masuk = petugas || 'Staff';
        }
    } else {
        record.status_pulang = newVal;
        record.waktu_pulang = newVal === 'SUDAH' ? new Date().toISOString() : null;
        if (newVal === 'BELUM') {
            record.petugas_pulang = null;
        } else {
            record.petugas_pulang = petugas || 'Staff';
        }
    }

    if (!supabaseClient || state.pasporUseLocalFallback) {
        _setStatusLocal(staffId, record);
        return;
    }

    try {
        if (existing) {
            const { error } = await supabaseClient.from('passport_handovers').update(record).eq('id', existing.id);
            if (error) throw error;
            Object.assign(existing, record);
        } else {
            const { data, error } = await supabaseClient.from('passport_handovers').insert(record).select().single();
            if (error) throw error;
            state.passportHandovers.push(data);
        }
        renderPasporView();
    } catch (e) {
        console.error('Gagal update status paspor:', e);
        if (e?.code === '42P01') {
            showToast("Tabel paspor belum ada di Supabase. Jalankan skrip `supabase_paspor_setup.sql`.", 'warning');
            state.pasporSetupNoticeShown = true;
        } else {
            showToast('Gagal menyimpan ke Supabase. Data dialihkan ke penyimpanan lokal.', 'warning');
        }
        state.pasporUseLocalFallback = true;
        _setStatusLocal(staffId, record);
    }
}

// ─── Simpan catatan lokal (fallback) ─────────────────
function _saveNoteLocal(staffId, shift, newNote) {
    try {
        let allLocal = JSON.parse(localStorage.getItem('restease_passport_handovers') || '[]');
        const idx = allLocal.findIndex(h => h.staff_id === staffId && h.date === state.pasporSelectedDate);
        if (idx > -1) {
            allLocal[idx].notes = newNote;
        } else {
            allLocal.push({
                id: 'local_' + Date.now(),
                staff_id: staffId,
                date: state.pasporSelectedDate,
                shift,
                notes: newNote,
                status_masuk: 'BELUM',
                status_pulang: 'BELUM'
            });
        }
        localStorage.setItem('restease_passport_handovers', JSON.stringify(allLocal));
        state.passportHandovers = allLocal.filter(h => h.date === state.pasporSelectedDate);
        renderPasporView();
    } catch (e) {
        console.error(e);
    }
}

// ─── Simpan Catatan ─────────────────────────────────
async function _saveNote(staffId, shift, newNote) {
    if (!staffId) return;

    if (!supabaseClient || state.pasporUseLocalFallback) {
        _saveNoteLocal(staffId, shift, newNote);
        return;
    }

    const existing = state.passportHandovers.find(h => h.staff_id === staffId);
    try {
        if (existing) {
            if (existing.notes === newNote) return;
            const { error } = await supabaseClient.from('passport_handovers').update({ notes: newNote }).eq('id', existing.id);
            if (error) throw error;
            existing.notes = newNote;
        } else {
            const rec = { staff_id: staffId, date: state.pasporSelectedDate, shift, notes: newNote, status_masuk: 'BELUM', status_pulang: 'BELUM' };
            const { data, error } = await supabaseClient.from('passport_handovers').insert(rec).select().single();
            if (error) throw error;
            state.passportHandovers.push(data);
        }
    } catch (e) {
        console.error('Gagal simpan note di DB, beralih ke lokal:', e);
        if (e?.code === '42P01') {
            showToast("Tabel paspor belum ada di Supabase. Jalankan skrip `supabase_paspor_setup.sql`.", 'warning');
            state.pasporSetupNoticeShown = true;
        } else {
            showToast('Gagal menyimpan catatan ke Supabase. Data dialihkan ke penyimpanan lokal.', 'warning');
        }
        state.pasporUseLocalFallback = true;
        _saveNoteLocal(staffId, shift, newNote);
    }
}

// ─── Event Listeners (DOMContentLoaded) ─────────────
document.addEventListener('DOMContentLoaded', () => {

    // Petugas dropdown change → tampilkan/sembunyikan input manual
    document.getElementById('pasporPetugasSelect')?.addEventListener('change', function () {
        const manual = document.getElementById('pasporPetugasManual');
        if (!manual) return;
        manual.classList.toggle('hide', this.value !== '__manual__');
        if (this.value === '__manual__') manual.focus();
    });

    // Navigasi tanggal — Prev
    document.getElementById('btnPasporPrevDay')?.addEventListener('click', async () => {
        const d = new Date(state.pasporSelectedDate + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        state.pasporSelectedDate = d.toLocaleDateString('sv-SE');
        await refreshPasporView();
    });

    // Navigasi tanggal — Next
    document.getElementById('btnPasporNextDay')?.addEventListener('click', async () => {
        const d = new Date(state.pasporSelectedDate + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        state.pasporSelectedDate = d.toLocaleDateString('sv-SE');
        await refreshPasporView();
    });

    // Date picker change
    document.getElementById('pasporDatePicker')?.addEventListener('change', async (e) => {
        state.pasporSelectedDate = e.target.value;
        await refreshPasporView();
    });

    // Klik area tanggal → buka date picker
    document.getElementById('pasporDateDisplay')?.closest?.('[style]')?.addEventListener('click', () => {
        document.getElementById('pasporDatePicker')?.showPicker();
    });

    // Pencarian
    document.getElementById('pasporSearch')?.addEventListener('input', (e) => {
        state.pasporSearchQuery = e.target.value;
        renderPasporView();
    });

    // Filter Jabatan
    document.querySelectorAll('#pasporRoleFilter .btn-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#pasporRoleFilter .btn-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.pasporRoleFilter = btn.dataset.role;
            renderPasporView();
        });
    });

    // Filter Status
    document.querySelectorAll('#pasporStatusFilter .btn-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#pasporStatusFilter .btn-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.pasporStatusFilter = btn.dataset.status;
            renderPasporView();
        });
    });

    // Tab Pagi / Malam
    const btnPagi = document.getElementById('btnPasporTabPagi');
    const btnMalam = document.getElementById('btnPasporTabMalam');
    const contPagi = document.getElementById('pasporContainerPagi');
    const contMalam = document.getElementById('pasporContainerMalam');

    btnPagi?.addEventListener('click', () => {
        btnPagi.classList.add('active');
        btnMalam.classList.remove('active');
        contPagi.classList.remove('hide');
        contMalam.classList.add('hide');
    });

    btnMalam?.addEventListener('click', () => {
        btnMalam.classList.add('active');
        btnPagi.classList.remove('active');
        contMalam.classList.remove('hide');
        contPagi.classList.add('hide');
    });
});
