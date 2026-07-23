// ==========================================================================
// BANDING KESALAHAN CS - JAVASCRIPT LOGIC
// ==========================================================================

const bandingState = {
    items: [],
    // Bulan aktif format 'YYYY-MM', default bulan ini
    selectedMonth: new Date().toLocaleDateString('sv-SE').substring(0, 7),
    activeFilters: {
        search: '',
        situs: 'ALL',
        status: 'ALL'
    }
};

// Initialize Banding View
async function fetchBandingData() {
    if (!supabaseClient) return;
    try {
        const month = bandingState.selectedMonth; // 'YYYY-MM'
        const [year, mon] = month.split('-').map(Number);
        const startDate = `${month}-01`;
        const lastDay   = new Date(year, mon, 0).getDate(); // hari terakhir bulan
        const endDate   = `${month}-${String(lastDay).padStart(2, '0')}`;

        const { data, error } = await supabaseClient
            .from('bukti_banding_kesalahan')
            .select('*')
            .gte('tanggal', startDate)
            .lte('tanggal', endDate)
            .order('tanggal', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;
        bandingState.items = data || [];
    } catch (err) {
        console.error("Gagal memuat data banding kesalahan:", err);
        showToast("Gagal memuat data banding kesalahan: " + err.message, "danger");
    }
}

// Dipanggil saat user ganti bulan di input
async function onBandingMonthChange() {
    const input = document.getElementById('bandFilterMonth');
    if (!input || !input.value) return;
    bandingState.selectedMonth = input.value;
    await fetchBandingData();
    renderBandingView();
}

// Render the Banding View Components
function renderBandingView() {
    // Sync input bulan dengan state
    const monthInput = document.getElementById('bandFilterMonth');
    if (monthInput && !monthInput.value) {
        monthInput.value = bandingState.selectedMonth;
    }
    renderBandingStats();
    populateBandingSitusFilter();
    renderBandingTable();
    setupBandingStaffAutocomplete();
}

// Render Counter Stats
function renderBandingStats() {
    const total = bandingState.items.length;
    const pending = bandingState.items.filter(item => item.keterangan === 'PENDING').length;
    const done = bandingState.items.filter(item => item.keterangan === 'DONE').length;
    const tolak = bandingState.items.filter(item => item.keterangan === 'BANDING DI TOLAK').length;
    const note = bandingState.items.filter(item => item.keterangan === 'NOTE').length;

    document.getElementById('bandStatTotal').textContent = total;
    document.getElementById('bandStatPending').textContent = pending;
    document.getElementById('bandStatDone').textContent = done;
    document.getElementById('bandStatTolak').textContent = tolak;
    document.getElementById('bandStatNote').textContent = note;
}

// Populate unique Situs list in filter dropdown
function populateBandingSitusFilter() {
    const filterSelect = document.getElementById('bandFilterSitus');
    if (!filterSelect) return;
    
    const currentVal = filterSelect.value;
    
    // Get unique site names
    const sites = Array.from(new Set(bandingState.items.map(item => item.nama_situs)))
        .filter(Boolean)
        .sort();
        
    filterSelect.innerHTML = '<option value="ALL">Semua Situs</option>';
    sites.forEach(site => {
        const opt = document.createElement('option');
        opt.value = site;
        opt.textContent = site;
        filterSelect.appendChild(opt);
    });
    
    // Restore value if still valid
    if (sites.includes(currentVal) || currentVal === 'ALL') {
        filterSelect.value = currentVal;
    }
}

// Format date to local readable format
function formatBandingDate(dateStr) {
    if (!dateStr) return "-";
    try {
        const d = new Date(dateStr);
        const options = { day: '2-digit', month: 'short', year: 'numeric' };
        return d.toLocaleDateString('id-ID', options);
    } catch(e) {
        return dateStr;
    }
}

// Render the main records table
function renderBandingTable() {
    const tbody = document.getElementById('bandingTableBody');
    const emptyState = document.getElementById('bandingEmptyState');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const search = bandingState.activeFilters.search.toLowerCase().trim();
    const siteFilter = bandingState.activeFilters.situs;
    const statusFilter = bandingState.activeFilters.status;
    
    // Filter records
    const filtered = bandingState.items.filter(item => {
        // Search match
        const matchesSearch = !search || 
            (item.nama_staff || '').toLowerCase().includes(search) ||
            (item.nama_situs || '').toLowerCase().includes(search) ||
            (item.keterangan_banding || '').toLowerCase().includes(search) ||
            (item.keterangan_tolak || '').toLowerCase().includes(search);
            
        // Site match
        const matchesSite = siteFilter === 'ALL' || item.nama_situs === siteFilter;
        
        // Status match
        const matchesStatus = statusFilter === 'ALL' || item.keterangan === statusFilter;
        
        return matchesSearch && matchesSite && matchesStatus;
    });
    
    if (filtered.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    filtered.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Double klik untuk melihat rincian lengkap';
        tr.setAttribute('ondblclick', `openBandingDetailModal('${item.id}')`);
        
        // Dynamic row styling based on status
        let trBg = 'rgba(255,255,255,0.01)';
        let borderLeft = '4px solid transparent';
        
        if (item.keterangan === 'DONE') {
            trBg = 'rgba(16, 185, 129, 0.02)';
            borderLeft = '4px solid #10b981';
        } else if (item.keterangan === 'PENDING') {
            trBg = 'rgba(245, 158, 11, 0.02)';
            borderLeft = '4px solid #f59e0b';
        } else if (item.keterangan === 'BANDING DI TOLAK') {
            trBg = 'rgba(244, 63, 94, 0.02)';
            borderLeft = '4px solid #f43f5e';
        } else if (item.keterangan === 'NOTE') {
            trBg = 'rgba(14, 165, 233, 0.02)';
            borderLeft = '4px solid #0ea5e9';
        }
        
        tr.style.background = trBg;
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        // Helper to format multiple links - clicks now trigger in-page popup modal instead of new tab
        const renderLinks = (linksStr) => {
            if (!linksStr) return '<span style="font-size: 0.68rem; color: rgba(255,255,255,0.2); italic">Tidak ada bukti</span>';
            const links = linksStr.split(',').map(l => l.trim()).filter(Boolean);
            if (links.length === 0) return '<span style="font-size: 0.68rem; color: rgba(255,255,255,0.2); italic">Tidak ada bukti</span>';
            
            return `<div style="display: flex; flex-direction: column; gap: 4px; align-items: center;" onclick="event.stopPropagation()">
                ${links.map((link, idx) => `
                    <button onclick="openBuktiScreenshot('${link}')" class="btn-action-icon" style="background: rgba(255,255,255,0.04); color: #fbbf24; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; padding: 2px 6px; font-size: 0.68rem; display: flex; align-items: center; gap: 4px; width: fit-content; text-decoration: none; cursor: pointer;">
                        <i class="fa-solid fa-eye" style="font-size: 0.6rem;"></i>
                        <span>Bukti ${idx + 1}</span>
                    </button>
                `).join('')}
            </div>`;
        };

        // Render Status Badge
        let badgeStyle = '';
        if (item.keterangan === 'DONE') {
            badgeStyle = 'background: rgba(16,185,129,0.12); color: #34d399; border: 1px solid rgba(16,185,129,0.25);';
        } else if (item.keterangan === 'PENDING') {
            badgeStyle = 'background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.25);';
        } else if (item.keterangan === 'BANDING DI TOLAK') {
            badgeStyle = 'background: rgba(244,63,94,0.12); color: #fb7185; border: 1px solid rgba(244,63,94,0.25);';
        } else if (item.keterangan === 'NOTE') {
            badgeStyle = 'background: rgba(14,165,233,0.12); color: #38bdf8; border: 1px solid rgba(14,165,233,0.25);';
        }
        
        const badge = `<span class="badge" style="padding: 3px 8px; font-size: 0.68rem; font-weight: 700; border-radius: 4px; text-transform: uppercase; cursor: pointer; transition: transform 0.15s, opacity 0.15s; ${badgeStyle}" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" onclick="event.stopPropagation(); openStatusChangePopover(event, '${item.id}', '${item.keterangan}')" title="Klik untuk mengubah status">${item.keterangan || 'PENDING'}</span>`;

        // Truncate long Alasan Banding text
        const fullDesc = item.keterangan_banding || '-';
        const truncatedDesc = fullDesc.length > 55 ? fullDesc.substring(0, 55) + '...' : fullDesc;

        tr.innerHTML = `
            <td style="width: 3%; text-align: center; border-left: ${borderLeft}; vertical-align: middle; font-weight: 700; color: rgba(255,255,255,0.4);">${index + 1}</td>
            <td style="width: 8%; vertical-align: middle; font-weight: 600; color: rgba(255,255,255,0.7);">${formatBandingDate(item.tanggal)}</td>
            <td style="width: 14%; vertical-align: middle; font-weight: 700; color: #fbbf24;">${item.nama_staff}</td>
            <td style="width: 8%; vertical-align: middle; font-weight: 600; color: white;">${item.nama_situs}</td>
            <td style="width: 10%; text-align: center; vertical-align: middle;">${renderLinks(item.bukti_ss_auditor)}</td>
            <td style="width: 10%; text-align: center; vertical-align: middle;">${renderLinks(item.bukti_banding)}</td>
            <td style="width: 23%; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; color: rgba(255,255,255,0.85);" title="Double klik untuk melihat rincian lengkap">${truncatedDesc}</td>
            <td style="width: 10%; text-align: center; vertical-align: middle;">${badge}</td>
            <td style="width: 14%; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; color: rgba(255,255,255,0.55);" title="${item.keterangan_tolak || ''}">${item.keterangan_tolak || '<span style="color: rgba(255,255,255,0.25); italic">Tidak ada catatan</span>'}</td>
            <td style="width: 10%; text-align: center; vertical-align: middle;" onclick="event.stopPropagation()">
                <div style="display: flex; gap: 4px; justify-content: center; align-items: center;">
                    <button class="btn-action-icon" onclick="openEditBandingModal('${item.id}')" style="background: rgba(251,191,36,0.08); color: #fbbf24; border: 1px solid rgba(251,191,36,0.15); width: 26px; height: 26px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.72rem;" title="Edit Kasus">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-action-icon" onclick="deleteBandingRecord('${item.id}')" style="background: rgba(244,63,94,0.08); color: #fb7185; border: 1px solid rgba(244,63,94,0.15); width: 26px; height: 26px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.72rem;" title="Hapus Kasus">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                    <button class="btn-action-icon" onclick="copyBandingSummary('${item.id}')" style="background: rgba(56,189,248,0.08); color: #38bdf8; border: 1px solid rgba(56,189,248,0.15); width: 26px; height: 26px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.72rem;" title="Salin Ringkasan">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Handle real-time updates from filters
function filterBandingTable() {
    bandingState.activeFilters.search = document.getElementById('bandSearchInput').value;
    bandingState.activeFilters.situs = document.getElementById('bandFilterSitus').value;
    bandingState.activeFilters.status = document.getElementById('bandFilterStatus').value;
    renderBandingTable();
}

// Handle Postgres change notifications
function handleBandingRealtime(payload) {
    const month = bandingState.selectedMonth;
    if (payload.eventType === 'INSERT') {
        // Hanya tampilkan jika tanggal masuk bulan aktif
        const itemMonth = (payload.new.tanggal || '').substring(0, 7);
        if (itemMonth === month) {
            bandingState.items.unshift(payload.new);
        }
    } else if (payload.eventType === 'UPDATE') {
        const idx = bandingState.items.findIndex(item => item.id === payload.new.id);
        if (idx !== -1) {
            bandingState.items[idx] = payload.new;
        } else {
            // Mungkin tanggal diubah ke bulan aktif
            const itemMonth = (payload.new.tanggal || '').substring(0, 7);
            if (itemMonth === month) bandingState.items.unshift(payload.new);
        }
    } else if (payload.eventType === 'DELETE') {
        bandingState.items = bandingState.items.filter(item => item.id !== payload.old.id);
    }
    renderBandingView();
}

// Open modal for inserting
function openAddBandingModal() {
    document.getElementById('formBandingCS').reset();
    document.getElementById('bandEditId').value = '';
    document.getElementById('bandingModalTitle').textContent = 'Tambah Kasus Banding';
    
    // Clear dynamic link rows and insert one default empty row
    document.getElementById('bandAuditorUrlContainer').innerHTML = '';
    document.getElementById('bandStaffUrlContainer').innerHTML = '';
    addBandingUrlRow('auditor');
    addBandingUrlRow('staff');
    
    // Default values
    document.getElementById('bandSitusName').value = 'WDBOS';
    handleBandingSitusChange('WDBOS');
    selectBandingStatus('PENDING');
    
    document.getElementById('modalBandingForm').classList.remove('hide');
}

// Open modal for updating
function openEditBandingModal(id) {
    const item = bandingState.items.find(x => x.id === id);
    if (!item) return;
    
    document.getElementById('bandEditId').value = item.id;
    document.getElementById('bandingModalTitle').textContent = 'Edit Kasus Banding';
    document.getElementById('bandStaffName').value = item.nama_staff;
    
    // Set site select values
    const sitSelect = document.getElementById('bandSitusName');
    const customInput = document.getElementById('bandSitusCustom');
    if (['WDBOS', 'WDBOS-GARUDA', 'WDBOS-VIP'].includes(item.nama_situs)) {
        sitSelect.value = item.nama_situs;
        customInput.classList.add('hide');
    } else {
        sitSelect.value = 'CUSTOM';
        customInput.value = item.nama_situs;
        customInput.classList.remove('hide');
    }
    
    // Auditor URLs
    const auditorContainer = document.getElementById('bandAuditorUrlContainer');
    auditorContainer.innerHTML = '';
    if (item.bukti_ss_auditor) {
        item.bukti_ss_auditor.split(',').forEach(link => {
            if (link.trim()) addBandingUrlRow('auditor', link.trim());
        });
    }
    if (auditorContainer.children.length === 0) addBandingUrlRow('auditor');
    
    // Staff URLs
    const staffContainer = document.getElementById('bandStaffUrlContainer');
    staffContainer.innerHTML = '';
    if (item.bukti_banding) {
        item.bukti_banding.split(',').forEach(link => {
            if (link.trim()) addBandingUrlRow('staff', link.trim());
        });
    }
    if (staffContainer.children.length === 0) addBandingUrlRow('staff');
    
    // Details
    document.getElementById('bandKeterangan').value = item.keterangan_banding || '';
    selectBandingStatus(item.keterangan || 'PENDING');
    document.getElementById('bandKeteranganTolak').value = item.keterangan_tolak || '';
    
    document.getElementById('modalBandingForm').classList.remove('hide');
}

// Close modal
function closeBandingModal() {
    document.getElementById('modalBandingForm').classList.add('hide');
}

// Dynamic row adder for links
function addBandingUrlRow(type, val = '') {
    const container = type === 'auditor' 
        ? document.getElementById('bandAuditorUrlContainer') 
        : document.getElementById('bandStaffUrlContainer');
        
    const div = document.createElement('div');
    div.className = 'url-row';
    div.style.display = 'flex';
    div.style.gap = '8px';
    div.style.width = '100%';
    
    div.innerHTML = `
        <input type="url" class="form-control url-input" placeholder="https://example.com/screenshot.png" value="${val}" style="flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: white; padding: 10px 14px; font-size: 0.9rem; height: 40px; outline: none;">
        <button type="button" onclick="removeBandingUrlRow(this)" style="background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.3); border-radius: 8px; color: #fb7185; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    `;
    container.appendChild(div);
}

// Remove URL Row
function removeBandingUrlRow(btn) {
    const row = btn.parentElement;
    const container = row.parentElement;
    if (container.children.length > 1) {
        row.remove();
    } else {
        row.querySelector('.url-input').value = '';
    }
}

// Handle Custom Site dropdown
function handleBandingSitusChange(val) {
    const custom = document.getElementById('bandSitusCustom');
    if (val === 'CUSTOM') {
        custom.classList.remove('hide');
        custom.required = true;
    } else {
        custom.classList.add('hide');
        custom.required = false;
    }
}

// Handle dynamic validation notes label based on selected status
function handleBandingStatusChange(val) {
    const label = document.getElementById('labelKeteranganTolak');
    const text = document.getElementById('bandKeteranganTolak');
    if (val === 'BANDING DI TOLAK') {
        label.textContent = 'Alasan Banding Ditolak';
        text.placeholder = 'Tuliskan secara rinci alasan banding ditolak oleh auditor...';
    } else if (val === 'NOTE') {
        label.textContent = 'Catatan Tambahan (Wajib)';
        text.placeholder = 'Tuliskan catatan tambahan audit (misal: kesalahan tetap dihitung setengah)...';
    } else {
        label.textContent = 'Catatan Tambahan / Keterangan Peninjauan';
        text.placeholder = 'Tuliskan rincian peninjauan atau catatan lainnya di sini...';
    }
}

// Save (Insert / Update) Form Submission
async function saveBandingRecord(e) {
    e.preventDefault();
    if (!supabaseClient) return;
    
    const id = document.getElementById('bandEditId').value;
    const name = document.getElementById('bandStaffName').value.trim();
    
    // Get Site name
    const sitSelect = document.getElementById('bandSitusName').value;
    const nameSitus = sitSelect === 'CUSTOM' 
        ? document.getElementById('bandSitusCustom').value.trim() 
        : sitSelect;
        
    // Gather Auditor URLs
    const auditorUrls = Array.from(document.querySelectorAll('#bandAuditorUrlContainer .url-input'))
        .map(input => input.value.trim())
        .filter(Boolean)
        .join(', ');
        
    // Gather Staff URLs
    const staffUrls = Array.from(document.querySelectorAll('#bandStaffUrlContainer .url-input'))
        .map(input => input.value.trim())
        .filter(Boolean)
        .join(', ');
        
    const desc = document.getElementById('bandKeterangan').value.trim();
    const status = document.getElementById('bandStatus').value;
    const note = document.getElementById('bandKeteranganTolak').value.trim();
    
    const payload = {
        nama_staff: name,
        nama_situs: nameSitus,
        bukti_ss_auditor: auditorUrls,
        bukti_banding: staffUrls,
        keterangan_banding: desc,
        keterangan: status,
        keterangan_tolak: note
    };
    
    try {
        if (id) {
            // Update
            const { error } = await supabaseClient
                .from('bukti_banding_kesalahan')
                .update(payload)
                .eq('id', id);
            if (error) throw error;
            showToast("Berhasil memperbarui data banding kesalahan!", "success");
        } else {
            // Insert
            payload.tanggal = new Date().toISOString().split('T')[0];
            const { error } = await supabaseClient
                .from('bukti_banding_kesalahan')
                .insert([payload]);
            if (error) throw error;
            showToast("Berhasil menambahkan data banding kesalahan baru!", "success");
        }
        closeBandingModal();
    } catch (err) {
        console.error("Gagal menyimpan data banding:", err);
        showToast("Gagal menyimpan data banding: " + err.message, "danger");
    }
}

// Delete Record
async function deleteBandingRecord(id) {
    if (!supabaseClient) return;
    const ok = await showCustomConfirm("Apakah Anda yakin ingin menghapus catatan kasus banding ini secara permanen?", "Hapus Kasus Banding", true);
    if (!ok) return;
    
    try {
        const { error } = await supabaseClient
            .from('bukti_banding_kesalahan')
            .delete()
            .eq('id', id);
        if (error) throw error;
        showToast("Berhasil menghapus catatan kasus banding!", "success");
    } catch (err) {
        console.error("Gagal menghapus data banding:", err);
        showToast("Gagal menghapus data banding: " + err.message, "danger");
    }
}

// Copy beautiful summary to clipboard
function copyBandingSummary(id) {
    const item = bandingState.items.find(x => x.id === id);
    if (!item) return;
    
    const summary = `📢 *REKAP BANDING KESALAHAN LiveChat*
Tanggal: ${formatBandingDate(item.tanggal)}
Situs: ${item.nama_situs}
Staff: ${item.nama_staff}
Bukti Auditor: ${item.bukti_ss_auditor || '-'}
Bukti Banding: ${item.bukti_banding || '-'}
Alasan Banding: ${item.keterangan_banding || '-'}
Status: ${item.keterangan || 'PENDING'}
Catatan: ${item.keterangan_tolak || '-'}`;

    navigator.clipboard.writeText(summary).then(() => {
        showToast("Ringkasan berhasil disalin ke clipboard!", "success");
    }).catch(err => {
        console.error("Gagal menyalin ringkasan:", err);
        showToast("Gagal menyalin ringkasan: " + err, "danger");
    });
}

// Set up Autocomplete search matching active staff database in RestEase
function setupBandingStaffAutocomplete() {
    const input = document.getElementById('bandStaffName');
    const dropdown = document.getElementById('bandStaffDropdown');
    if (!input || !dropdown) return;
    
    input.addEventListener('input', () => {
        const val = input.value.trim().toLowerCase();
        dropdown.innerHTML = '';
        
        if (!val) {
            dropdown.classList.add('hide');
            return;
        }
        
        const matches = (state.staff || [])
            .filter(s => s.name && s.name.toLowerCase().includes(val))
            .slice(0, 5);
            
        if (matches.length === 0) {
            dropdown.classList.add('hide');
            return;
        }
        
        dropdown.classList.remove('hide');
        matches.forEach(staff => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.style.padding = '8px 12px';
            item.style.cursor = 'pointer';
            item.style.color = 'white';
            item.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            item.textContent = `${staff.name} (${staff.role})`;
            
            item.addEventListener('mousedown', () => {
                input.value = staff.name;
                dropdown.classList.add('hide');
            });
            
            dropdown.appendChild(item);
        });
    });
}

// Select custom luxury status pill inside the form
function selectBandingStatus(status) {
    document.getElementById('bandStatus').value = status;
    
    // Style pills
    const pills = document.querySelectorAll('.status-pill-btn');
    pills.forEach(pill => {
        const pStatus = pill.getAttribute('data-status');
        if (pStatus === status) {
            pill.classList.add('active');
            let bg = 'rgba(245, 158, 11, 0.1)';
            let color = '#fbbf24';
            let border = '1.5px solid #fbbf24';
            let shadow = '0 0 10px rgba(245, 158, 11, 0.25)';
            
            if (status === 'DONE') {
                bg = 'rgba(16, 185, 129, 0.1)';
                color = '#34d399';
                border = '1.5px solid #34d399';
                shadow = '0 0 10px rgba(16, 185, 129, 0.25)';
            } else if (status === 'BANDING DI TOLAK') {
                bg = 'rgba(244, 63, 94, 0.1)';
                color = '#fb7185';
                border = '1.5px solid #fb7185';
                shadow = '0 0 10px rgba(244, 63, 94, 0.25)';
            } else if (status === 'NOTE') {
                bg = 'rgba(14, 165, 233, 0.1)';
                color = '#38bdf8';
                border = '1.5px solid #38bdf8';
                shadow = '0 0 10px rgba(14, 165, 233, 0.25)';
            }
            
            pill.style.background = bg;
            pill.style.color = color;
            pill.style.border = border;
            pill.style.boxShadow = shadow;
        } else {
            pill.classList.remove('active');
            pill.style.background = 'rgba(255, 255, 255, 0.02)';
            pill.style.color = 'rgba(255, 255, 255, 0.4)';
            pill.style.border = '1.5px solid rgba(255, 255, 255, 0.08)';
            pill.style.boxShadow = 'none';
        }
    });
    
    // Call change handler to update notes label/placeholder
    handleBandingStatusChange(status);
}

// Open detailed Pop-Up modal on Double Click
function openBandingDetailModal(id) {
    const item = bandingState.items.find(x => x.id === id);
    if (!item) return;
    
    // Fill basic details
    document.getElementById('detailBandStaff').textContent = item.nama_staff;
    document.getElementById('detailBandSitusTgl').textContent = `${item.nama_situs} • ${formatBandingDate(item.tanggal)}`;
    
    // Render Status badge inside details
    let badgeStyle = '';
    if (item.keterangan === 'DONE') {
        badgeStyle = 'background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3);';
    } else if (item.keterangan === 'PENDING') {
        badgeStyle = 'background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3);';
    } else if (item.keterangan === 'BANDING DI TOLAK') {
        badgeStyle = 'background: rgba(244,63,94,0.15); color: #fb7185; border: 1px solid rgba(244,63,94,0.3);';
    } else if (item.keterangan === 'NOTE') {
        badgeStyle = 'background: rgba(14,165,233,0.15); color: #38bdf8; border: 1px solid rgba(14,165,233,0.3);';
    }
    
    const badgeHtml = `<span class="badge" style="padding: 4px 10px; font-size: 0.72rem; font-weight: 700; border-radius: 6px; text-transform: uppercase; ${badgeStyle}">${item.keterangan || 'PENDING'}</span>`;
    document.getElementById('detailBandStatus').innerHTML = badgeHtml;
    
    // Fill text fields
    document.getElementById('detailBandKeterangan').textContent = item.keterangan_banding || 'Tidak ada rincian alasan banding.';
    document.getElementById('detailBandKeteranganTolak').textContent = item.keterangan_tolak || 'Tidak ada catatan atau alasan ditolak.';
    
    // Render clickable screenshot link pills inside details
    const linksDiv = document.getElementById('detailBandLinks');
    linksDiv.innerHTML = '';
    
    const auditorList = item.bukti_ss_auditor ? item.bukti_ss_auditor.split(',').map(l => l.trim()).filter(Boolean) : [];
    const staffList = item.bukti_banding ? item.bukti_banding.split(',').map(l => l.trim()).filter(Boolean) : [];
    
    if (auditorList.length === 0 && staffList.length === 0) {
        linksDiv.textContent = 'Tidak ada screenshot.';
    } else {
        // Auditor Links
        auditorList.forEach((link, idx) => {
            const btn = document.createElement('button');
            btn.className = 'btn-action-icon';
            btn.style.cssText = 'background: rgba(245, 158, 11, 0.1); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 6px; padding: 4px 8px; font-size: 0.72rem; display: flex; align-items: center; gap: 4px; cursor: pointer;';
            btn.innerHTML = `<i class="fa-solid fa-image"></i> Auditor ${idx + 1}`;
            btn.onclick = () => openBuktiScreenshot(link);
            linksDiv.appendChild(btn);
        });
        
        // Staff Links
        staffList.forEach((link, idx) => {
            const btn = document.createElement('button');
            btn.className = 'btn-action-icon';
            btn.style.cssText = 'background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 6px; padding: 4px 8px; font-size: 0.72rem; display: flex; align-items: center; gap: 4px; cursor: pointer;';
            btn.innerHTML = `<i class="fa-solid fa-image"></i> Staff ${idx + 1}`;
            btn.onclick = () => openBuktiScreenshot(link);
            linksDiv.appendChild(btn);
        });
    }
    
    // Bind copy button in footer
    document.getElementById('btnCopyDetailSummary').onclick = () => copyBandingSummary(item.id);
    
    // Display modal
    document.getElementById('modalBandingDetail').classList.remove('hide');
}

// Open popup to change status directly from table row badge
function openStatusChangePopover(event, id, currentStatus) {
    // Remove any existing status popover
    const existing = document.getElementById('statusChangePopover');
    if (existing) {
        existing.remove();
    }
    
    const badge = event.currentTarget;
    const rect = badge.getBoundingClientRect();
    
    const popover = document.createElement('div');
    popover.id = 'statusChangePopover';
    popover.style.position = 'fixed';
    popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
    popover.style.left = `${rect.left + window.scrollX}px`;
    popover.style.background = 'rgba(15, 23, 42, 0.96)';
    popover.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    popover.style.backdropFilter = 'blur(10px)';
    popover.style.borderRadius = '8px';
    popover.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)';
    popover.style.padding = '6px';
    popover.style.display = 'flex';
    popover.style.flexDirection = 'column';
    popover.style.gap = '4px';
    popover.style.minWidth = '160px';
    popover.style.zIndex = '99999';
    popover.style.boxSizing = 'border-box';
    
    const statuses = [
        { name: 'PENDING', bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
        { name: 'DONE', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' },
        { name: 'BANDING DI TOLAK', bg: 'rgba(244, 63, 94, 0.15)', text: '#fb7185', border: 'rgba(244, 63, 94, 0.3)' },
        { name: 'NOTE', bg: 'rgba(14, 165, 233, 0.15)', text: '#38bdf8', border: 'rgba(14, 165, 233, 0.3)' }
    ];
    
    statuses.forEach(status => {
        const item = document.createElement('div');
        item.style.padding = '8px 12px';
        item.style.borderRadius = '6px';
        item.style.fontSize = '0.72rem';
        item.style.fontWeight = '700';
        item.style.cursor = 'pointer';
        item.style.transition = 'all 0.2s';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        
        // Label badge styling
        item.innerHTML = `
            <span style="color: ${status.text}; text-transform: uppercase;">${status.name}</span>
            ${currentStatus === status.name ? `<i class="fa-solid fa-check" style="color: ${status.text}; font-size: 0.8rem;"></i>` : ''}
        `;
        
        // Hover styles
        item.style.background = currentStatus === status.name ? status.bg : 'transparent';
        item.style.border = currentStatus === status.name ? `1px solid ${status.border}` : '1px solid transparent';
        
        item.onmouseover = () => {
            if (currentStatus !== status.name) {
                item.style.background = 'rgba(255, 255, 255, 0.05)';
            }
        };
        item.onmouseout = () => {
            if (currentStatus !== status.name) {
                item.style.background = 'transparent';
            }
        };
        
        item.onclick = async (e) => {
            e.stopPropagation();
            popover.remove();
            
            if (currentStatus === status.name) return; // No change
            
            // Show loading on badge
            badge.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>`;
            badge.style.opacity = '0.7';
            
            await updateBandingStatusDirect(id, status.name);
        };
        
        popover.appendChild(item);
    });
    
    document.body.appendChild(popover);
    
    // Add global click listener to close popover
    const closeListener = () => {
        popover.remove();
        document.removeEventListener('click', closeListener);
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeListener);
    }, 50);
}

// Update status directly to Supabase
async function updateBandingStatusDirect(id, newStatus) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from('bukti_banding_kesalahan')
            .update({ keterangan: newStatus })
            .eq('id', id);
            
        if (error) throw error;
        showToast(`Status berhasil diubah ke ${newStatus}!`, "success");
        await fetchBandingData();
        renderBandingTable();
        renderBandingStats();
    } catch (err) {
        console.error("Gagal memperbarui status:", err);
        showToast("Gagal memperbarui status: " + err.message, "danger");
    }
}
