// ==========================================================================
// CEK QRIS — JAVASCRIPT LOGIC
// ==========================================================================

const qrisState = {
    items: [],
    selectedMonth: new Date().toLocaleDateString('sv-SE').substring(0, 7),
    activeFilters: { search: '', status: 'ALL', jenis: 'ALL' }
};

// ── HELPER FUNCTIONS ──────────────────────────────────────────────────────────
function formatNominalInput(input) {
    // Ambil nilai dan hapus semua karakter non-digit
    let value = input.value.replace(/\D/g, '');
    
    // Jika kosong, biarkan kosong
    if (value === '') {
        input.value = '';
        document.getElementById('qrisNominalValue').value = '';
        return;
    }
    
    // Format dengan koma sebagai pemisah ribuan
    let formattedValue = parseInt(value).toLocaleString('id-ID');
    
    // Set nilai yang terformat ke input display
    input.value = formattedValue;
    
    // Simpan nilai asli (angka) ke hidden input
    document.getElementById('qrisNominalValue').value = value;
}

function validateNominalInput(input) {
    // Pastikan nilai tidak kosong saat blur
    let value = input.value.replace(/\D/g, '');
    if (value === '' || value === '0') {
        input.value = '';
        document.getElementById('qrisNominalValue').value = '';
    }
}

function isImageUrl(url) {
    // Check if URL has image extension
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const lowUrl = url.toLowerCase();
    return imageExts.some(ext => lowUrl.includes(ext)) || 
           lowUrl.includes('image') || 
           lowUrl.includes('photo') ||
           lowUrl.includes('img');
}

function retryImageLoad(url) {
    const img = document.getElementById('qrisProofImage');
    const loading = document.getElementById('qrisImageLoading');
    const error = document.getElementById('qrisImageError');
    
    // Reset states
    error.style.display = 'none';
    loading.style.display = 'flex';
    img.style.opacity = '1';
    img.style.filter = 'none';
    
    // Try with cache busting
    img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
}

function forceReloadImage(url) {
    const img = document.getElementById('qrisProofImage');
    const loading = document.getElementById('qrisImageLoading');
    const error = document.getElementById('qrisImageError');
    
    // Show loading overlay
    error.style.display = 'none';
    loading.style.display = 'flex';
    
    // Reset image styles
    img.style.opacity = '1';
    img.style.filter = 'none';
    
    // Force reload with multiple cache busting strategies
    const cacheBust = Date.now() + Math.random().toString(36);
    const newUrl = url + (url.includes('?') ? '&' : '?') + 'cb=' + cacheBust;
    
    // Preload image first
    const preloader = new Image();
    preloader.crossOrigin = 'anonymous';
    preloader.referrerPolicy = 'no-referrer';
    
    preloader.onload = function() {
        console.log('Preload successful, updating main image');
        img.src = newUrl;
        loading.style.display = 'none';
        error.style.display = 'none';
        img.style.opacity = '1';
        img.style.filter = 'none';
    };
    
    preloader.onerror = function() {
        console.log('Preload failed, but showing image anyway');
        img.src = newUrl;
        loading.style.display = 'none';
        // Don't show error immediately, give the main img tag a chance
        setTimeout(() => {
            if (img.style.opacity === '0.1') {
                error.style.display = 'flex';
            }
        }, 2000);
    };
    
    preloader.src = newUrl;
}

function openImageModal(url) {
    // Create fullscreen image modal
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.9);
        backdrop-filter: blur(8px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        cursor: pointer;
    `;
    
    overlay.onclick = () => overlay.remove();
    
    overlay.innerHTML = `
        <div style="max-width: 90vw; max-height: 90vh; position: relative;">
            <img src="${url}" 
                 style="max-width: 100%; max-height: 100%; border-radius: 12px; box-shadow: 0 25px 60px rgba(0,0,0,0.5);"
                 onerror="
                     this.style.display = 'none';
                     this.nextElementSibling.style.display = 'flex';
                 "
            >
            <div style="display: none; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center; padding: 60px;">
                <i class="fa-solid fa-external-link" style="font-size: 3rem; margin-bottom: 20px; opacity: 0.7;"></i>
                <div style="font-size: 1.2rem; margin-bottom: 16px; font-weight: 600;">Tidak dapat menampilkan gambar</div>
                <div style="font-size: 0.9rem; margin-bottom: 20px; opacity: 0.8;">Klik tombol di bawah untuk membuka di tab baru</div>
                <button onclick="window.open('${url}', '_blank')" 
                        style="padding: 12px 24px; background: #38bdf8; border: none; border-radius: 8px; color: white; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s;"
                        onmouseover="this.style.background='#0ea5e9'" 
                        onmouseout="this.style.background='#38bdf8'">
                    <i class="fa-solid fa-external-link"></i> Buka di Tab Baru
                </button>
            </div>
            <button onclick="event.stopPropagation(); overlay.remove();" 
                    style="position: absolute; top: -15px; right: -15px; width: 40px; height: 40px; background: rgba(255,255,255,0.9); border: none; border-radius: 50%; color: #333; font-size: 1.1rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center;"
                    onmouseover="this.style.background='rgba(244,63,94,0.9)'; this.style.color='white';"
                    onmouseout="this.style.background='rgba(255,255,255,0.9)'; this.style.color='#333';">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Animate in
    requestAnimationFrame(() => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });
    });
}

// ── FETCH ──────────────────────────────────────────────────────────────────
async function fetchQrisData() {
    if (!supabaseClient) return;
    try {
        const month = qrisState.selectedMonth;
        const [year, mon] = month.split('-').map(Number);
        const startDate = `${month}-01T00:00:00.000Z`;
        const lastDay   = new Date(year, mon, 0).getDate();
        const endDate   = `${month}-${String(lastDay).padStart(2,'0')}T23:59:59.999Z`;

        const { data, error } = await supabaseClient
            .from('qris_transactions')
            .select('*')
            .gte('waktu', startDate)
            .lte('waktu', endDate)
            .order('waktu', { ascending: false });

        if (error) throw error;
        qrisState.items = data || [];
    } catch (err) {
        console.error('Gagal memuat data QRIS:', err);
        showToast('Gagal memuat data QRIS: ' + err.message, 'error');
    }
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function renderQrisView() {
    const monthInput = document.getElementById('qrisFilterMonth');
    if (monthInput && !monthInput.value) monthInput.value = qrisState.selectedMonth;
    renderQrisStats();
    renderQrisTable();
}

function renderQrisStats() {
    const items = qrisState.items;
    const sukses  = items.filter(i => i.status === 'SUKSES').length;
    const pending = items.filter(i => i.status === 'PENDING').length;
    const gagal   = items.filter(i => i.status === 'GAGAL').length;
    const belum   = items.filter(i => !i.status).length;
    const nominal = items
        .filter(i => i.status === 'SUKSES')
        .reduce((sum, i) => sum + (Number(i.nominal) || 0), 0);

    document.getElementById('qrisStatTotal').textContent   = items.length;
    document.getElementById('qrisStatSukses').textContent  = sukses;
    document.getElementById('qrisStatPending').textContent = pending;
    document.getElementById('qrisStatGagal').textContent   = gagal;
    document.getElementById('qrisStatBelum').textContent   = belum;
    document.getElementById('qrisStatNominal').textContent =
        'Rp ' + nominal.toLocaleString('id-ID');
}

function renderQrisTable() {
    const tbody      = document.getElementById('qrisTableBody');
    const emptyState = document.getElementById('qrisEmptyState');
    if (!tbody) return;

    const search = qrisState.activeFilters.search.toLowerCase().trim();
    const fStatus = qrisState.activeFilters.status;
    const fJenis  = qrisState.activeFilters.jenis;

    const filtered = qrisState.items.filter(item => {
        const matchSearch = !search ||
            (item.user_id    || '').toLowerCase().includes(search) ||
            (item.order_id   || '').toLowerCase().includes(search) ||
            (item.rrn        || '').toLowerCase().includes(search) ||
            (item.catatan    || '').toLowerCase().includes(search);
        const matchStatus = fStatus === 'ALL' || (fStatus === '' ? !item.status : item.status === fStatus);
        const matchJenis  = fJenis  === 'ALL' || item.jenis_qris === fJenis;
        return matchSearch && matchStatus && matchJenis;
    });

    tbody.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    filtered.forEach((item, idx) => {
        // status badge style
        const badgeMap = {
            'SUKSES':  { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', border: 'rgba(16,185,129,0.25)'  },
            'PENDING': { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', border: 'rgba(245,158,11,0.25)'  },
            'GAGAL':   { bg: 'rgba(244,63,94,0.12)',   color: '#fb7185', border: 'rgba(244,63,94,0.25)'   },
        };
        const bs = badgeMap[item.status] || { bg:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.3)', border:'rgba(255,255,255,0.1)' };
        const statusLabel = item.status || '—';
        const badge = `<span style="padding:3px 9px;border-radius:5px;font-size:0.68rem;font-weight:700;letter-spacing:0.5px;background:${bs.bg};color:${bs.color};border:1px solid ${bs.border};">${statusLabel}</span>`;

        // jenis badge
        const jenisBg = item.jenis_qris === 'DINAMIS'
            ? 'rgba(139,92,246,0.12)' : 'rgba(56,189,248,0.12)';
        const jenisColor = item.jenis_qris === 'DINAMIS' ? '#a78bfa' : '#38bdf8';
        const jenisBadge = `<span style="padding:2px 8px;border-radius:4px;font-size:0.65rem;font-weight:700;background:${jenisBg};color:${jenisColor};">${item.jenis_qris || '-'}</span>`;

        // format waktu
        const waktuStr = item.waktu
            ? new Date(item.waktu).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
            : '-';

        // format nominal
        const nominalStr = item.nominal != null
            ? 'Rp ' + Number(item.nominal).toLocaleString('id-ID')
            : '-';

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
        tr.style.transition    = 'background 0.15s';
        tr.onmouseover = () => tr.style.background = 'rgba(255,255,255,0.02)';
        tr.onmouseout  = () => tr.style.background = 'transparent';

        tr.innerHTML = `
            <td style="padding:11px 14px;font-size:0.75rem;color:rgba(255,255,255,0.3);font-weight:700;">${idx + 1}</td>
            <td style="padding:11px 14px;font-size:0.78rem;color:rgba(255,255,255,0.65);white-space:nowrap;">${waktuStr}</td>
            <td style="padding:11px 14px;font-size:0.82rem;color:#fbbf24;font-weight:700;">${item.user_id || '-'}</td>
            <td style="padding:11px 14px;font-size:0.78rem;color:rgba(255,255,255,0.8);font-family:monospace;">${item.order_id || '-'}</td>
            <td style="padding:11px 14px;font-size:0.78rem;color:rgba(255,255,255,0.65);font-family:monospace;">${item.rrn || '-'}</td>
            <td style="padding:11px 14px;font-size:0.75rem;color:#38bdf8;">${item.bukti_url ? `<a href="${item.bukti_url}" target="_blank" style="color:#38bdf8;text-decoration:none;border-bottom:1px dotted rgba(56,189,248,0.4);transition:all 0.15s;" title="${item.bukti_url}" onmouseover="this.style.borderBottom='1px solid #38bdf8';this.style.color='#0ea5e9'" onmouseout="this.style.borderBottom='1px dotted rgba(56,189,248,0.4)';this.style.color='#38bdf8'">🔗 ${item.bukti_url.length > 18 ? item.bukti_url.substring(0,18) + '...' : item.bukti_url}</a>` : '—'}</td>
            <td style="padding:11px 14px;text-align:center;">${jenisBadge}</td>
            <td style="padding:11px 14px;text-align:right;font-size:0.82rem;font-weight:700;color:#a78bfa;white-space:nowrap;">${nominalStr}</td>
            <td style="padding:11px 14px;text-align:center;">${badge}</td>
            <td style="padding:11px 14px;text-align:center;">
                <div style="display:flex;gap:5px;justify-content:center;">
                    <button onclick="openQrisDetailModal('${item.id}')" title="Lihat Detail"
                        style="width:27px;height:27px;border-radius:5px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);color:#34d399;display:flex;align-items:center;justify-content:center;font-size:0.7rem;cursor:pointer;">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button onclick="openEditQrisModal('${item.id}')" title="Edit"
                        style="width:27px;height:27px;border-radius:5px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.15);color:#fbbf24;display:flex;align-items:center;justify-content:center;font-size:0.7rem;cursor:pointer;">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="deleteQrisRecord('${item.id}')" title="Hapus"
                        style="width:27px;height:27px;border-radius:5px;background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.15);color:#fb7185;display:flex;align-items:center;justify-content:center;font-size:0.7rem;cursor:pointer;">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                    <button onclick="copyQrisSummary('${item.id}')" title="Salin"
                        style="width:27px;height:27px;border-radius:5px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.15);color:#38bdf8;display:flex;align-items:center;justify-content:center;font-size:0.7rem;cursor:pointer;">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ── FILTER ─────────────────────────────────────────────────────────────────
function filterQrisTable() {
    qrisState.activeFilters.search = document.getElementById('qrisSearchInput')?.value || '';
    qrisState.activeFilters.status = document.getElementById('qrisFilterStatus')?.value || 'ALL';
    qrisState.activeFilters.jenis  = document.getElementById('qrisFilterJenis')?.value  || 'ALL';
    renderQrisStats();
    renderQrisTable();
}

async function onQrisMonthChange() {
    const input = document.getElementById('qrisFilterMonth');
    if (!input?.value) return;
    qrisState.selectedMonth = input.value;
    await fetchQrisData();
    renderQrisView();
}

// ── MODAL ──────────────────────────────────────────────────────────────────
let _qrisWaktuInterval = null;

// Helper: set input waktu ke jam sekarang (lokal)
function _setQrisWaktuNow() {
    const now = new Date();
    // Format YYYY-MM-DDTHH:MM untuk datetime-local (lokal, bukan UTC)
    const pad  = n => String(n).padStart(2, '0');
    const localStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const el = document.getElementById('qrisWaktu');
    // Hanya update jika user belum mengubah manual (tidak ada karakter yang diketik)
    // Tandai dengan data-auto="1"
    if (el && el.getAttribute('data-auto') !== '0') {
        el.value = localStr;
    }
}

function openAddQrisModal() {
    document.getElementById('formQris').reset();
    document.getElementById('qrisEditId').value = '';
    document.getElementById('qrisModalTitle').textContent = 'Tambah Transaksi QRIS';

    // Tandai waktu sebagai auto-update
    const waktuEl = document.getElementById('qrisWaktu');
    if (waktuEl) waktuEl.setAttribute('data-auto', '1');

    // Set waktu sekarang langsung
    _setQrisWaktuNow();

    // Update setiap detik selama modal terbuka
    clearInterval(_qrisWaktuInterval);
    _qrisWaktuInterval = setInterval(_setQrisWaktuNow, 1000);

    // Saat user sentuh/edit field waktu → stop auto-update
    if (waktuEl) {
        waktuEl.addEventListener('input', function onManualInput() {
            waktuEl.setAttribute('data-auto', '0');
            clearInterval(_qrisWaktuInterval);
            waktuEl.removeEventListener('input', onManualInput);
        }, { once: true });
    }

    selectQrisStatus('');
    document.getElementById('modalQrisForm').classList.remove('hide');
}

function openEditQrisModal(id) {
    const item = qrisState.items.find(x => x.id === id);
    if (!item) return;
    document.getElementById('qrisEditId').value    = item.id;
    document.getElementById('qrisModalTitle').textContent = 'Edit Transaksi QRIS';
    // format waktu untuk input datetime-local
    if (item.waktu) {
        const d = new Date(item.waktu);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        document.getElementById('qrisWaktu').value = d.toISOString().slice(0, 16);
    }
    document.getElementById('qrisUserId').value   = item.user_id   || '';
    document.getElementById('qrisOrderId').value  = item.order_id  || '';
    document.getElementById('qrisRrn').value       = item.rrn       || '';
    document.getElementById('qrisBuktiUrl').value  = item.bukti_url || '';
    document.getElementById('qrisJenis').value     = item.jenis_qris || 'STATIS';
    // Format nominal dengan koma
    if (item.nominal != null && item.nominal > 0) {
        document.getElementById('qrisNominal').value = Number(item.nominal).toLocaleString('id-ID');
        document.getElementById('qrisNominalValue').value = item.nominal;
    } else {
        document.getElementById('qrisNominal').value = '';
        document.getElementById('qrisNominalValue').value = '';
    }
    document.getElementById('qrisCatatan').value   = item.catatan   || '';
    selectQrisStatus(item.status || '');
    document.getElementById('modalQrisForm').classList.remove('hide');
}

function closeQrisModal() {
    clearInterval(_qrisWaktuInterval);
    _qrisWaktuInterval = null;
    document.getElementById('modalQrisForm').classList.add('hide');
}

function selectQrisStatus(status) {
    document.getElementById('qrisStatus').value = status;
    document.querySelectorAll('.qris-status-pill').forEach(pill => {
        const isActive = pill.getAttribute('data-status') === status;
        pill.style.opacity   = isActive ? '1'   : '0.4';
        pill.style.transform = isActive ? 'scale(1.04)' : 'scale(1)';
        pill.style.boxShadow = isActive ? '0 0 12px rgba(255,255,255,0.1)' : 'none';
    });
}

// ── SAVE ───────────────────────────────────────────────────────────────────
async function saveQrisRecord(e) {
    e.preventDefault();
    if (!supabaseClient) return;

    // Stop live clock saat simpan
    clearInterval(_qrisWaktuInterval);
    _qrisWaktuInterval = null;

    const id = document.getElementById('qrisEditId').value;

    const payload = {
        waktu:      document.getElementById('qrisWaktu').value     || null,
        user_id:    document.getElementById('qrisUserId').value.trim(),
        order_id:   document.getElementById('qrisOrderId').value.trim(),
        rrn:        document.getElementById('qrisRrn').value.trim() || null,
        bukti_url:  document.getElementById('qrisBuktiUrl').value.trim() || null,
        jenis_qris: document.getElementById('qrisJenis').value,
        nominal:    Number(document.getElementById('qrisNominalValue').value) || 0,
        status:     document.getElementById('qrisStatus').value,
        catatan:    document.getElementById('qrisCatatan').value.trim() || null,
    };

    try {
        if (id) {
            const { error } = await supabaseClient
                .from('qris_transactions').update(payload).eq('id', id);
            if (error) throw error;
            showToast('Data QRIS berhasil diperbarui.', 'success');
        } else {
            const { error } = await supabaseClient
                .from('qris_transactions').insert([payload]);
            if (error) throw error;
            showToast('Data QRIS berhasil ditambahkan.', 'success');
        }
        closeQrisModal();
        // Tidak perlu fetchQrisData() karena realtime akan handle otomatis
        // await fetchQrisData();
        // renderQrisView();
    } catch (err) {
        console.error('Gagal simpan QRIS:', err);
        showToast('Gagal menyimpan data QRIS: ' + err.message, 'error');
    }
}

// ── DETAIL MODAL ───────────────────────────────────────────────────────────
function openQrisDetailModal(id) {
    const item = qrisState.items.find(x => x.id === id);
    if (!item) return;

    // Format waktu
    const waktuStr = item.waktu
        ? new Date(item.waktu).toLocaleString('id-ID', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' })
        : '-';

    // Nominal
    const nominalStr = item.nominal != null
        ? 'Rp ' + Number(item.nominal).toLocaleString('id-ID')
        : '-';

    // Status badge
    const badgeMap = {
        'SUKSES':  { bg:'rgba(16,185,129,0.15)',  color:'#34d399', border:'rgba(16,185,129,0.3)'  },
        'PENDING': { bg:'rgba(245,158,11,0.15)',  color:'#fbbf24', border:'rgba(245,158,11,0.3)'  },
        'GAGAL':   { bg:'rgba(244,63,94,0.15)',   color:'#fb7185', border:'rgba(244,63,94,0.3)'   },
    };
    const bs = badgeMap[item.status] || { bg:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.35)', border:'rgba(255,255,255,0.1)' };
    const statusLabel = item.status || '— Belum Diisi';

    // Jenis badge
    const jenisColors = {
        'MINERA': { bg:'rgba(16,185,129,0.12)',  color:'#34d399'  },
        'VIP':    { bg:'rgba(245,158,11,0.12)',  color:'#fbbf24'  },
        'XPAY':   { bg:'rgba(139,92,246,0.12)',  color:'#a78bfa'  },
        'PAY2ME': { bg:'rgba(56,189,248,0.12)',  color:'#38bdf8'  },
    };
    const jc = jenisColors[item.jenis_qris] || { bg:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.5)' };

    // Buat overlay
    const overlay = document.createElement('div');
    overlay.id = 'qrisDetailOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.onclick = (e) => { if (e.target === overlay) closeQrisDetailModal(); };

    overlay.innerHTML = `
        <div style="background:linear-gradient(145deg,rgba(14,20,40,0.98),rgba(10,15,30,0.96));border:1px solid rgba(16,185,129,0.2);border-radius:16px;width:100%;max-width:800px;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.6);">
            <!-- Header -->
            <div style="padding:20px 24px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:40px;height:40px;border-radius:10px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.25);display:flex;align-items:center;justify-content:center;color:#34d399;font-size:1.1rem;">
                        <i class="fa-solid fa-qrcode"></i>
                    </div>
                    <div>
                        <div style="font-size:1rem;font-weight:800;color:white;">Detail Transaksi QRIS</div>
                        <div style="font-size:0.7rem;color:rgba(255,255,255,0.35);margin-top:2px;">${waktuStr}</div>
                    </div>
                </div>
                <button id="qrisDetailCloseBtn" onclick="closeQrisDetailModal()" class="btn-close-luxury">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- Body: 2 Column Layout -->
            <div style="padding:20px 24px;display:grid;grid-template-columns:300px 1fr;gap:24px;">
                
                <!-- Left Column: Image Preview -->
                <div style="display:flex;flex-direction:column;">
                    <div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Preview Bukti</div>
                    <div style="aspect-ratio:1;border-radius:12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.05);overflow:hidden;position:relative;">
                        ${item.bukti_url ? `
                            <div id="qrisImageContainer" style="width:100%;height:100%;position:relative;">
                                
                                <!-- Loading Overlay -->
                                <div id="qrisImageLoading" style="position:absolute;inset:0;background:rgba(14,20,40,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;color:rgba(255,255,255,0.7);border-radius:11px;z-index:2;">
                                    <div style="width:32px;height:32px;border:3px solid rgba(56,189,248,0.3);border-top-color:#38bdf8;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:12px;"></div>
                                    <div style="font-size:0.75rem;font-weight:600;">Memuat bukti...</div>
                                </div>

                                <!-- Iframe untuk halaman web (Sleekshot, dll) -->
                                <iframe 
                                    id="qrisBuktiFrame"
                                    src="${item.bukti_url}"
                                    style="width:100%;height:100%;border:none;border-radius:11px;display:block;"
                                    onload="
                                        document.getElementById('qrisImageLoading').style.display='none';
                                        document.getElementById('qrisImageError').style.display='none';
                                    "
                                    onerror="
                                        document.getElementById('qrisImageLoading').style.display='none';
                                        document.getElementById('qrisImageError').style.display='flex';
                                    "
                                ></iframe>
                                
                                <!-- Error Overlay -->
                                <div id="qrisImageError" style="position:absolute;inset:0;background:rgba(14,20,40,0.97);display:none;flex-direction:column;align-items:center;justify-content:center;color:rgba(255,255,255,0.8);text-align:center;padding:20px;border-radius:11px;z-index:3;">
                                    <i class="fa-solid fa-external-link" style="font-size:2.5rem;margin-bottom:14px;color:#38bdf8;opacity:0.9;"></i>
                                    <div style="font-size:0.85rem;margin-bottom:6px;font-weight:700;">Preview tidak bisa dimuat</div>
                                    <div style="font-size:0.7rem;margin-bottom:18px;opacity:0.7;line-height:1.5;">Layanan ini memblokir embedding.<br>Buka di tab baru untuk melihat bukti.</div>
                                    <button onclick="window.open('${item.bukti_url}', '_blank')" 
                                            style="padding:9px 20px;background:linear-gradient(135deg,#38bdf8,#0ea5e9);border:none;border-radius:8px;color:white;font-size:0.8rem;cursor:pointer;font-weight:700;transition:all 0.2s;"
                                            onmouseover="this.style.transform='scale(1.04)';this.style.opacity='0.9'" 
                                            onmouseout="this.style.transform='scale(1)';this.style.opacity='1'">
                                        <i class="fa-solid fa-external-link"></i>&nbsp; Buka Bukti
                                    </button>
                                </div>
                            </div>
                        ` : `
                            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.25);text-align:center;">
                                <i class="fa-solid fa-image" style="font-size:2.5rem;margin-bottom:12px;opacity:0.3;"></i>
                                <div style="font-size:0.8rem;font-weight:600;margin-bottom:4px;">Tidak Ada Bukti</div>
                                <div style="font-size:0.7rem;opacity:0.7;">Bukti URL belum diisi</div>
                            </div>
                        `}
                    </div>
                    
                    <!-- URL Link Below Image -->
                    ${item.bukti_url ? `
                        <div style="margin-top:12px;padding:10px;background:rgba(56,189,248,0.05);border:1px solid rgba(56,189,248,0.15);border-radius:8px;">
                            <div style="font-size:0.7rem;font-weight:700;color:rgba(56,189,248,0.6);text-transform:uppercase;margin-bottom:6px;">Bukti URL</div>
                            <div style="display:flex;flex-direction:column;gap:6px;">
                                <a href="${item.bukti_url}" target="_blank" 
                                   style="font-size:0.75rem;color:#38bdf8;text-decoration:none;word-break:break-all;line-height:1.4;display:block;border-bottom:1px dotted rgba(56,189,248,0.4);transition:all 0.2s;"
                                   onmouseover="this.style.borderBottom='1px solid #38bdf8'" 
                                   onmouseout="this.style.borderBottom='1px dotted rgba(56,189,248,0.4)'">
                                    🔗 ${item.bukti_url}
                                </a>
                                <div style="display:flex;gap:6px;margin-top:4px;">
                                    <button onclick="navigator.clipboard.writeText('${item.bukti_url}').then(() => showToast('URL disalin!', 'success')).catch(() => showToast('Gagal menyalin', 'error'))" 
                                            style="flex:1;padding:4px 8px;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.2);border-radius:4px;color:#38bdf8;font-size:0.65rem;cursor:pointer;transition:all 0.2s;"
                                            onmouseover="this.style.background='rgba(56,189,248,0.15)'" 
                                            onmouseout="this.style.background='rgba(56,189,248,0.1)'">
                                        <i class="fa-solid fa-copy"></i> Salin URL
                                    </button>
                                    <button onclick="openImageModal('${item.bukti_url}')" 
                                            style="flex:1;padding:4px 8px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:4px;color:#34d399;font-size:0.65rem;cursor:pointer;transition:all 0.2s;"
                                            onmouseover="this.style.background='rgba(16,185,129,0.15)'" 
                                            onmouseout="this.style.background='rgba(16,185,129,0.1)'">
                                        <i class="fa-solid fa-eye"></i> Lihat
                                    </button>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Right Column: Transaction Details -->
                <div style="display:flex;flex-direction:column;gap:0;">

                    <!-- User ID -->
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;">User ID</span>
                        <span style="font-size:0.88rem;font-weight:700;color:#fbbf24;">${item.user_id || '-'}</span>
                    </div>

                    <!-- Order ID -->
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;">Order ID</span>
                        <span style="font-size:0.85rem;font-weight:600;color:rgba(255,255,255,0.85);font-family:monospace;">${item.order_id || '-'}</span>
                    </div>

                    <!-- RRN -->
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;">RRN</span>
                        <span style="font-size:0.85rem;font-weight:600;color:rgba(255,255,255,0.65);font-family:monospace;">${item.rrn || '-'}</span>
                    </div>

                    <!-- Jenis QRIS -->
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;">Jenis QRIS</span>
                        <span style="padding:3px 10px;border-radius:5px;font-size:0.72rem;font-weight:700;background:${jc.bg};color:${jc.color};">${item.jenis_qris || '-'}</span>
                    </div>

                    <!-- Nominal -->
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;">Nominal</span>
                        <span style="font-size:1rem;font-weight:800;color:#a78bfa;">${nominalStr}</span>
                    </div>

                    <!-- Status saat ini -->
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;">Status</span>
                        <span id="qrisDetailStatusBadge" style="padding:4px 12px;border-radius:6px;font-size:0.75rem;font-weight:700;background:${bs.bg};color:${bs.color};border:1px solid ${bs.border};">${statusLabel}</span>
                    </div>

                    <!-- Catatan -->
                    ${item.catatan ? `
                    <div style="padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Catatan</div>
                        <div style="font-size:0.82rem;color:rgba(255,255,255,0.65);line-height:1.5;">${item.catatan}</div>
                    </div>` : ''}

                    <!-- Ubah Status -->
                    <div style="padding-top:16px;">
                        <div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Ubah Status Transaksi</div>
                        <div style="display:flex;gap:8px;">
                            <button onclick="changeQrisStatusFromDetail('${item.id}','SUKSES')"
                                style="flex:1;padding:9px 6px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;border:1.5px solid rgba(16,185,129,0.3);background:${item.status==='SUKSES'?'rgba(16,185,129,0.18)':'rgba(16,185,129,0.06)'};color:#34d399;transition:all 0.2s;${item.status==='SUKSES'?'box-shadow:0 0 12px rgba(16,185,129,0.2);':'' }">
                                <i class="fa-solid fa-circle-check"></i> SUKSES
                            </button>
                            <button onclick="changeQrisStatusFromDetail('${item.id}','PENDING')"
                                style="flex:1;padding:9px 6px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;border:1.5px solid rgba(245,158,11,0.3);background:${item.status==='PENDING'?'rgba(245,158,11,0.18)':'rgba(245,158,11,0.06)'};color:#fbbf24;transition:all 0.2s;${item.status==='PENDING'?'box-shadow:0 0 12px rgba(245,158,11,0.2);':'' }">
                                <i class="fa-solid fa-clock"></i> PENDING
                            </button>
                            <button onclick="changeQrisStatusFromDetail('${item.id}','GAGAL')"
                                style="flex:1;padding:9px 6px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;border:1.5px solid rgba(244,63,94,0.3);background:${item.status==='GAGAL'?'rgba(244,63,94,0.18)':'rgba(244,63,94,0.06)'};color:#fb7185;transition:all 0.2s;${item.status==='GAGAL'?'box-shadow:0 0 12px rgba(244,63,94,0.2);':'' }">
                                <i class="fa-solid fa-circle-xmark"></i> GAGAL
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            <!-- Footer -->
            <div style="padding:14px 24px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid rgba(255,255,255,0.05);">
                <button onclick="copyQrisSummary('${item.id}')" style="padding:8px 16px;border-radius:8px;font-size:0.8rem;font-weight:700;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);color:#38bdf8;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(56,189,248,0.15)'" onmouseout="this.style.background='rgba(56,189,248,0.08)'">
                    <i class="fa-solid fa-copy"></i> Salin
                </button>
                <button onclick="closeQrisDetailModal(); openEditQrisModal('${item.id}')" style="padding:8px 16px;border-radius:8px;font-size:0.8rem;font-weight:700;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);color:#fbbf24;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(251,191,36,0.15)'" onmouseout="this.style.background='rgba(251,191,36,0.08)'">
                    <i class="fa-solid fa-pen-to-square"></i> Edit
                </button>
                <button onclick="closeQrisDetailModal()" style="padding:8px 18px;border-radius:8px;font-size:0.8rem;font-weight:700;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                    Tutup
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    
    // Add CSS for spinner animation if not exists
    if (!document.getElementById('qrisSpinnerCSS')) {
        const style = document.createElement('style');
        style.id = 'qrisSpinnerCSS';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Auto-check iframe setelah 5 detik — kalau masih loading, kemungkinan diblokir
    if (item.bukti_url) {
        setTimeout(() => {
            const loading = document.getElementById('qrisImageLoading');
            const error = document.getElementById('qrisImageError');
            if (loading && loading.style.display !== 'none') {
                loading.style.display = 'none';
                if (error) error.style.display = 'flex';
            }
        }, 5000);
    }
    
    // Setup hover animation untuk tombol close
    const closeBtn = document.getElementById('qrisDetailCloseBtn');
    const closeIcon = closeBtn.querySelector('i');
    
    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = 'rgba(244,63,94,0.1)';
        closeBtn.style.borderColor = 'rgba(244,63,94,0.25)';
        closeBtn.style.color = '#fb7185';
        closeBtn.style.transform = 'scale(1.08)';
        closeIcon.style.transform = 'rotate(90deg)';
    });
    
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.04)';
        closeBtn.style.borderColor = 'rgba(255,255,255,0.08)';
        closeBtn.style.color = 'rgba(255,255,255,0.4)';
        closeBtn.style.transform = 'scale(1)';
        closeIcon.style.transform = 'rotate(0deg)';
    });
    
    // Animasi masuk
    requestAnimationFrame(() => {
        const card = overlay.querySelector('div');
        card.style.transform = 'scale(0.95)';
        card.style.opacity   = '0';
        card.style.transition = 'transform 0.22s cubic-bezier(0.16,1,0.3,1), opacity 0.22s ease';
        requestAnimationFrame(() => {
            card.style.transform = 'scale(1)';
            card.style.opacity   = '1';
        });
    });
}

function closeQrisDetailModal() {
    const overlay = document.getElementById('qrisDetailOverlay');
    if (overlay) overlay.remove();
}

async function changeQrisStatusFromDetail(id, newStatus) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from('qris_transactions')
            .update({ status: newStatus })
            .eq('id', id);
        if (error) throw error;

        // Update local state
        const idx = qrisState.items.findIndex(i => i.id === id);
        if (idx !== -1) qrisState.items[idx].status = newStatus;

        showToast(`Status diubah ke ${newStatus}.`, 'success');

        // Tutup dan buka ulang modal dengan data terbaru
        closeQrisDetailModal();
        openQrisDetailModal(id);

        // Refresh tabel & stats di background
        renderQrisStats();
        renderQrisTable();
    } catch (err) {
        console.error('Gagal ubah status:', err);
        showToast('Gagal mengubah status: ' + err.message, 'error');
    }
}
async function deleteQrisRecord(id) {
    if (!supabaseClient) return;
    const ok = await showCustomConfirm(
        'Hapus data transaksi QRIS ini secara permanen?', 'Hapus Transaksi QRIS', true
    );
    if (!ok) return;
    try {
        const { error } = await supabaseClient
            .from('qris_transactions').delete().eq('id', id);
        if (error) throw error;
        showToast('Data QRIS berhasil dihapus.', 'success');
        // Tidak perlu fetchQrisData() karena realtime akan handle otomatis
        // await fetchQrisData();
        // renderQrisView();
    } catch (err) {
        console.error('Gagal hapus QRIS:', err);
        showToast('Gagal menghapus data QRIS: ' + err.message, 'error');
    }
}

// ── COPY ───────────────────────────────────────────────────────────────────
function copyQrisSummary(id) {
    const item = qrisState.items.find(x => x.id === id);
    if (!item) return;
    const nominalFormatted = Number(item.nominal || 0).toLocaleString('id-ID');
    const buktiUrl = item.bukti_url || '-';
    const text = `User ID : ${item.user_id || '-'}
Order ID : ${item.order_id || '-'}
RRN : ${item.rrn || '-'}
Nominal : ${nominalFormatted}
Bukti : \`${buktiUrl}\``;
    navigator.clipboard.writeText(text)
        .then(() => showToast('Ringkasan QRIS berhasil disalin!', 'success'))
        .catch(() => showToast('Gagal menyalin ringkasan.', 'error'));
}

// ── REALTIME ───────────────────────────────────────────────────────────────
function handleQrisRealtime(payload) {
    const month = qrisState.selectedMonth;
    if (payload.eventType === 'INSERT') {
        const itemMonth = (payload.new.waktu || '').substring(0, 7);
        if (itemMonth === month) qrisState.items.unshift(payload.new);
    } else if (payload.eventType === 'UPDATE') {
        const idx = qrisState.items.findIndex(i => i.id === payload.new.id);
        if (idx !== -1) qrisState.items[idx] = payload.new;
    } else if (payload.eventType === 'DELETE') {
        qrisState.items = qrisState.items.filter(i => i.id !== payload.old.id);
    }
    renderQrisView();
}

// ── CETAK PDF ─────────────────────────────────────────────────────────────────
function printQrisToPDF() {
    const search = qrisState.activeFilters.search.toLowerCase().trim();
    const fStatus = qrisState.activeFilters.status;
    const fJenis  = qrisState.activeFilters.jenis;

    const filtered = qrisState.items.filter(item => {
        const matchSearch = !search ||
            (item.user_id    || '').toLowerCase().includes(search) ||
            (item.order_id   || '').toLowerCase().includes(search) ||
            (item.rrn        || '').toLowerCase().includes(search) ||
            (item.catatan    || '').toLowerCase().includes(search);
        const matchStatus = fStatus === 'ALL' || (fStatus === '' ? !item.status : item.status === fStatus);
        const matchJenis  = fJenis  === 'ALL' || item.jenis_qris === fJenis;
        return matchSearch && matchStatus && matchJenis;
    });

    if (filtered.length === 0) {
        showToast('Tidak ada data untuk dicetak.', 'warning');
        return;
    }

    const monthName = new Date(qrisState.selectedMonth + '-01').toLocaleDateString('id-ID', {
        month: 'long', year: 'numeric'
    });

    // Stats untuk PDF
    const stats = {
        total: filtered.length,
        sukses: filtered.filter(i => i.status === 'SUKSES').length,
        pending: filtered.filter(i => i.status === 'PENDING').length,
        gagal: filtered.filter(i => i.status === 'GAGAL').length,
        belum: filtered.filter(i => !i.status).length,
        nominal: filtered.filter(i => i.status === 'SUKSES').reduce((sum, i) => sum + (Number(i.nominal) || 0), 0)
    };

    // Filter info
    const filterInfo = [];
    if (search) filterInfo.push(`Pencarian: "${search}"`);
    if (fStatus !== 'ALL') filterInfo.push(`Status: ${fStatus || 'Belum Diisi'}`);
    if (fJenis !== 'ALL') filterInfo.push(`Jenis: ${fJenis}`);

    // Buat HTML untuk PDF
    const pdfContent = `
        <div style="font-family:Arial,sans-serif;color:#333;padding:20px;max-width:1200px;margin:0 auto;">
            <!-- Header -->
            <div style="text-align:center;margin-bottom:30px;border-bottom:3px solid #10b981;padding-bottom:15px;">
                <h1 style="margin:0;font-size:24px;color:#10b981;font-weight:800;">LAPORAN TRANSAKSI QRIS</h1>
                <h2 style="margin:8px 0 0;font-size:18px;color:#666;font-weight:600;">${monthName}</h2>
                ${filterInfo.length > 0 ? `<p style="margin:8px 0 0;font-size:12px;color:#888;">${filterInfo.join(' • ')}</p>` : ''}
                <p style="margin:8px 0 0;font-size:11px;color:#aaa;">Dicetak: ${new Date().toLocaleString('id-ID')}</p>
            </div>

            <!-- Summary Stats -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:15px;margin-bottom:25px;">
                <div style="background:#f8f9fa;border:1px solid #e9ecef;border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:11px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Total</div>
                    <div style="font-size:20px;font-weight:800;color:#333;">${stats.total}</div>
                </div>
                <div style="background:#d1fae5;border:1px solid #10b981;border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:11px;color:#065f46;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Sukses</div>
                    <div style="font-size:20px;font-weight:800;color:#065f46;">${stats.sukses}</div>
                </div>
                <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:11px;color:#92400e;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Pending</div>
                    <div style="font-size:20px;font-weight:800;color:#92400e;">${stats.pending}</div>
                </div>
                <div style="background:#fecaca;border:1px solid #ef4444;border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:11px;color:#991b1b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Gagal</div>
                    <div style="font-size:20px;font-weight:800;color:#991b1b;">${stats.gagal}</div>
                </div>
                <div style="background:#e0e7ff;border:1px solid #6366f1;border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:11px;color:#3730a3;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Belum Diisi</div>
                    <div style="font-size:20px;font-weight:800;color:#3730a3;">${stats.belum}</div>
                </div>
                <div style="background:#f3e8ff;border:1px solid #a855f7;border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:11px;color:#6b21a8;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Total Nominal</div>
                    <div style="font-size:16px;font-weight:800;color:#6b21a8;">Rp ${stats.nominal.toLocaleString('id-ID')}</div>
                </div>
            </div>

            <!-- Table -->
            <table style="width:100%;border-collapse:collapse;font-size:10px;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        <th style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-weight:700;color:#475569;">No</th>
                        <th style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-weight:700;color:#475569;">Waktu</th>
                        <th style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-weight:700;color:#475569;">User ID</th>
                        <th style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-weight:700;color:#475569;">Order ID</th>
                        <th style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-weight:700;color:#475569;">RRN</th>
                        <th style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-weight:700;color:#475569;">Bukti URL</th>
                        <th style="border:1px solid #cbd5e1;padding:8px;text-align:center;font-weight:700;color:#475569;">Jenis</th>
                        <th style="border:1px solid #cbd5e1;padding:8px;text-align:right;font-weight:700;color:#475569;">Nominal</th>
                        <th style="border:1px solid #cbd5e1;padding:8px;text-align:center;font-weight:700;color:#475569;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map((item, idx) => {
                        const waktuStr = item.waktu
                            ? new Date(item.waktu).toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
                            : '-';
                        const nominalStr = item.nominal != null
                            ? 'Rp ' + Number(item.nominal).toLocaleString('id-ID')
                            : '-';
                        const statusLabel = item.status || '—';
                        const buktiStr = item.bukti_url 
                            ? (item.bukti_url.length > 25 ? item.bukti_url.substring(0,25) + '...' : item.bukti_url)
                            : '-';
                        
                        let statusColor = '#6b7280';
                        if (item.status === 'SUKSES')  statusColor = '#10b981';
                        if (item.status === 'PENDING') statusColor = '#f59e0b';
                        if (item.status === 'GAGAL')   statusColor = '#ef4444';

                        return `
                            <tr style="${idx % 2 === 0 ? 'background:#f9fafb;' : 'background:white;'}">
                                <td style="border:1px solid #e2e8f0;padding:6px;text-align:center;">${idx + 1}</td>
                                <td style="border:1px solid #e2e8f0;padding:6px;">${waktuStr}</td>
                                <td style="border:1px solid #e2e8f0;padding:6px;font-weight:600;">${item.user_id || '-'}</td>
                                <td style="border:1px solid #e2e8f0;padding:6px;font-family:monospace;">${item.order_id || '-'}</td>
                                <td style="border:1px solid #e2e8f0;padding:6px;font-family:monospace;">${item.rrn || '-'}</td>
                                <td style="border:1px solid #e2e8f0;padding:6px;font-size:9px;color:#0ea5e9;">${buktiStr}</td>
                                <td style="border:1px solid #e2e8f0;padding:6px;text-align:center;font-weight:600;">${item.jenis_qris || '-'}</td>
                                <td style="border:1px solid #e2e8f0;padding:6px;text-align:right;font-weight:600;">${nominalStr}</td>
                                <td style="border:1px solid #e2e8f0;padding:6px;text-align:center;font-weight:700;color:${statusColor};">${statusLabel}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <!-- Footer -->
            <div style="margin-top:20px;padding-top:15px;border-top:1px solid #e2e8f0;text-align:center;font-size:9px;color:#9ca3af;">
                <p>WB Team Management System — Laporan Transaksi QRIS</p>
                <p>Total ${filtered.length} transaksi • ${filtered.filter(i => i.status === 'SUKSES').length} sukses • Nominal: Rp ${stats.nominal.toLocaleString('id-ID')}</p>
            </div>
        </div>
    `;

    // Show loading
    showToast('Sedang membuat PDF...', 'info');

    // Buat temporary div untuk PDF
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = pdfContent;
    tempDiv.style.position = 'absolute';
    tempDiv.style.top = '-9999px';
    document.body.appendChild(tempDiv);

    // Generate PDF
    const opt = {
        margin:       [10, 10, 10, 10],
        filename:     `Laporan_QRIS_${qrisState.selectedMonth}_${new Date().getTime()}.pdf`,
        image:        { type: 'jpeg', quality: 0.95 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(tempDiv).save().then(() => {
        document.body.removeChild(tempDiv);
        showToast(`PDF berhasil diunduh! (${filtered.length} data)`, 'success');
    }).catch(err => {
        document.body.removeChild(tempDiv);
        console.error('PDF Error:', err);
        showToast('Gagal membuat PDF: ' + err.message, 'error');
    });
}

window.openAddQrisModal         = openAddQrisModal;
window.openEditQrisModal        = openEditQrisModal;
window.openQrisDetailModal      = openQrisDetailModal;
window.closeQrisDetailModal     = closeQrisDetailModal;
window.changeQrisStatusFromDetail = changeQrisStatusFromDetail;
window.closeQrisModal           = closeQrisModal;
window.saveQrisRecord           = saveQrisRecord;
window.deleteQrisRecord         = deleteQrisRecord;
window.copyQrisSummary          = copyQrisSummary;
window.filterQrisTable          = filterQrisTable;
window.onQrisMonthChange        = onQrisMonthChange;
window.selectQrisStatus         = selectQrisStatus;
window.fetchQrisData            = fetchQrisData;
window.renderQrisView           = renderQrisView;
window.handleQrisRealtime       = handleQrisRealtime;
window.printQrisToPDF           = printQrisToPDF;
window.formatNominalInput       = formatNominalInput;
window.validateNominalInput     = validateNominalInput;
window.isImageUrl               = isImageUrl;
window.retryImageLoad           = retryImageLoad;
window.forceReloadImage         = forceReloadImage;
window.openImageModal           = openImageModal;
