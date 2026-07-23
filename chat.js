/* =============================================================
   CHAT.JS — WB Team Chat System
   Fitur: Group Chat, Direct Message, Ganti Foto Profil,
          Kirim Gambar & Link, Kontrol Akses Role
   ============================================================= */

// Roles yang boleh BUAT grup / DM baru
const CHAT_CREATOR_ROLES = ["CS LINE", "KAPTEN KASIR"];

// Normalisasi role agar perbandingan tidak gagal karena huruf/spasi
function normalizeChatRole(r) {
    return String(r || "").trim().replace(/\s+/g, " ").toUpperCase();
}

// State chat
const chatState = {
    myUser: null,
    activeConvId: null,
    activeConvType: null,
    activeTab: "groups",
    groups: [],
    dms: [],
    messages: [],
    pendingAvatarBase64: null,
    pendingImageBase64: null,
    realtimeChannel: null,
    groupMemberSelections: new Set(),
    // Unread tracking: { [groupId]: count }
    unreadCounts: {},
    lastReadAt: {},
    // Reply state
    replyTo: null,   // { id, sender_name, preview }
    // Pinned conversations (Set of groupId), persisted per user in localStorage
    pinnedConvs: new Set(JSON.parse(localStorage.getItem('chat_pinned') || '[]')),
};

function isChatViewActive() {
    const chatView = document.getElementById('chatView');
    return !!chatView && chatView.classList.contains('active');
}

// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
async function initChat() {
    if (!supabaseClient) return;
    await ensureChatUser();
    loadChatLastReadAt();
    // Sync semua staff ke chat_users agar bisa dipakai di grup/DM
    await syncAllStaffToChatUsers();
    await loadChatGroups();
    await loadChatDMs();
    // Hitung unread saat pertama load
    await recalculateAllUnread();
    setupChatRealtime();
    requestNotificationPermission();
    renderChatSidebar();
    updateChatProfileHeader();
    updateChatUnreadBadge();
}

function onChatViewOpen() {
    // Jika user sudah login tapi myUser belum di-init (login setelah loadAllData)
    const staff = getChatCurrentStaff();
    if (staff && !chatState.myUser) {
        // Re-init async
        initChat().then(() => {
            renderChatSidebar();
            updateChatProfileHeader();
        });
        return;
    }
    // Jika belum login sama sekali, tampilkan prompt
    if (!staff) {
        const convList = document.getElementById('chatConvList');
        if (convList) {
            convList.innerHTML = '<div class="chat-conv-empty"><i class="fa-solid fa-lock"></i><span>Login terlebih dahulu untuk menggunakan chat</span></div>';
        }
        const nameEl = document.getElementById('chatMyName');
        const roleEl = document.getElementById('chatMyRoleLabel');
        if (nameEl) nameEl.textContent = 'Belum login';
        if (roleEl) roleEl.textContent = '—';
        return;
    }
    renderChatSidebar();
    updateChatProfileHeader();
}

// ----------------------------------------------------------------
// HELPERS ROLE
// ----------------------------------------------------------------
function getChatCurrentStaff() {
    return state.currentStaff || null;
}

function canCreateChat() {
    const s = getChatCurrentStaff();
    if (!s) return false;
    const role = normalizeChatRole(s.role);
    return CHAT_CREATOR_ROLES.includes(role);
}

function normalizeRole(r) {
    return (r || "").toUpperCase().trim();
}

// ----------------------------------------------------------------
// ENSURE CHAT USER (buat/update profil di chat_users)
// ----------------------------------------------------------------
async function ensureChatUser() {
    const staff = getChatCurrentStaff();
    if (!staff) return;

    const { data: existing } = await supabaseClient
        .from('chat_users')
        .select('*')
        .eq('id', staff.id)
        .maybeSingle();

    if (existing) {
        chatState.myUser = existing;
        // Update last_seen & name
        await supabaseClient.from('chat_users').update({
            name: staff.name,
            last_seen: new Date().toISOString()
        }).eq('id', staff.id);
        chatState.myUser.name = staff.name;
    } else {
        const { data: inserted } = await supabaseClient
            .from('chat_users')
            .insert({ id: staff.id, name: staff.name, avatar_url: null })
            .select()
            .single();
        chatState.myUser = inserted;
    }
}

// ----------------------------------------------------------------
// LOAD DATA
// ----------------------------------------------------------------
async function loadChatGroups() {
    if (!chatState.myUser) return;
    // Ambil group_id yang diikuti user ini
    const { data: memberships } = await supabaseClient
        .from('chat_group_members')
        .select('group_id')
        .eq('user_id', chatState.myUser.id);

    if (!memberships || memberships.length === 0) {
        chatState.groups = [];
        return;
    }
    const ids = memberships.map(m => m.group_id);
    const { data: groups } = await supabaseClient
        .from('chat_groups')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false });

    chatState.groups = groups || [];
}

async function loadChatDMs() {
    if (!chatState.myUser) return;
    // DM = grup dengan is_dm=true yang memiliki user ini sebagai anggota
    const { data: memberships } = await supabaseClient
        .from('chat_group_members')
        .select('group_id')
        .eq('user_id', chatState.myUser.id);

    if (!memberships || memberships.length === 0) {
        chatState.dms = [];
        return;
    }
    const ids = memberships.map(m => m.group_id);
    const { data: dms } = await supabaseClient
        .from('chat_groups')
        .select('*')
        .in('id', ids)
        .eq('is_dm', true)
        .order('created_at', { ascending: false });

    chatState.dms = dms || [];
}

async function loadMessages(convId) {
    const { data } = await supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('group_id', convId)
        .order('created_at', { ascending: true })
        .limit(200);
    chatState.messages = data || [];
}

async function getGroupMembers(groupId) {
    const { data } = await supabaseClient
        .from('chat_group_members')
        .select('user_id')
        .eq('group_id', groupId);
    if (!data) return [];
    const ids = data.map(m => m.user_id);
    const { data: users } = await supabaseClient
        .from('chat_users')
        .select('id, name, avatar_url')
        .in('id', ids);
    return users || [];
}

// ----------------------------------------------------------------
// REALTIME
// ----------------------------------------------------------------
function setupChatRealtime() {
    if (chatState.realtimeChannel) {
        supabaseClient.removeChannel(chatState.realtimeChannel);
    }
    chatState.realtimeChannel = supabaseClient
        .channel('chat_realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
            handleNewMessageRealtime(payload.new);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_groups' }, payload => {
            handleNewGroupRealtime(payload.new);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_groups' }, payload => {
            const deletedId = payload.old?.id;
            if (deletedId) {
                chatState.groups = chatState.groups.filter(g => g.id !== deletedId);
                chatState.dms = chatState.dms.filter(d => d.id !== deletedId);
                delete chatState.unreadCounts[deletedId];
                delete chatState.lastReadAt[deletedId];
                chatState.pinnedConvs.delete(deletedId);
                if (chatState.activeConvId === deletedId) {
                    chatState.activeConvId = null;
                    chatState.activeConvType = null;
                    chatState.messages = [];
                    document.getElementById('chatConversation')?.classList.add('hide');
                    document.getElementById('chatEmptyState')?.classList.remove('hide');
                }
                renderChatSidebar();
                updateChatUnreadBadge();
            }
        })
        .subscribe();
}

async function handleNewMessageRealtime(msg) {
    // Skip pesan dari diri sendiri
    if (msg.sender_id === chatState.myUser?.id) return;

    if (msg.group_id === chatState.activeConvId) {
        // Konv sedang aktif: tampilkan langsung, tandai sudah baca
        if (!chatState.messages.find(m => m.id === msg.id)) {
            chatState.messages.push(msg);
            appendMessageToUI(msg);
            scrollChatToBottom();
            markConvAsRead(msg.group_id);
        }
    } else {
        // Konv lain: tambah unread count
        chatState.unreadCounts[msg.group_id] = (chatState.unreadCounts[msg.group_id] || 0) + 1;
        updateChatUnreadBadge();
        // Kirim notifikasi browser / popup PC
        const convName = getConvName(msg.group_id);
        sendChatNotification(msg.sender_name, msg.content || '📷 Gambar', convName, msg.group_id);
    }
    if (isChatViewActive()) {
        renderChatSidebar();
    }
}

async function handleNewGroupRealtime(group) {
    // Cek apakah user ini anggota grup baru
    const { data } = await supabaseClient
        .from('chat_group_members')
        .select('user_id')
        .eq('group_id', group.id)
        .eq('user_id', chatState.myUser?.id)
        .maybeSingle();
    if (data) {
        if (group.is_dm) {
            chatState.dms.unshift(group);
        } else {
            chatState.groups.unshift(group);
        }
        if (isChatViewActive()) {
            renderChatSidebar();
        }
        updateChatUnreadBadge();
    }
}

function getConvName(groupId) {
    const g = [...chatState.groups, ...chatState.dms].find(x => x.id === groupId);
    return g ? g.name : "Percakapan";
}

// ----------------------------------------------------------------
// RENDER: SIDEBAR
// ----------------------------------------------------------------
function renderChatSidebar() {
    const search = (document.getElementById('chatSearchInput')?.value || '').toLowerCase();
    const listEl = document.getElementById('chatConvList');
    if (!listEl) return;

    const newActionsEl = document.getElementById('chatNewActions');
    if (newActionsEl) {
        newActionsEl.style.display = canCreateChat() ? 'flex' : 'none';
    }

    const items = chatState.activeTab === 'groups' ? chatState.groups : chatState.dms;
    const filtered = items.filter(c => (c.name || '').toLowerCase().includes(search));

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="chat-conv-empty"><i class="fa-solid fa-comments"></i><span>${chatState.activeTab === 'groups' ? 'Belum ada grup' : 'Belum ada DM'}</span></div>`;
        return;
    }

    listEl.innerHTML = '';

    const renderItem = (conv, type) => {
        const isActive  = conv.id === chatState.activeConvId;
        const isPinned  = chatState.pinnedConvs.has(conv.id);
        const unread    = chatState.unreadCounts[conv.id] || 0;
        const avatarHtml = buildConvAvatarHtml(conv);
        const item = document.createElement('div');
        item.className = `chat-conv-item${isActive ? ' active' : ''}${isPinned ? ' chat-conv-pinned' : ''}`;
        item.setAttribute('data-id', conv.id);
        item.innerHTML = `
            ${avatarHtml}
            <div class="chat-conv-item-info">
                <div class="chat-conv-item-name-row">
                    ${isPinned ? '<i class="fa-solid fa-thumbtack chat-pin-icon"></i>' : ''}
                    <span class="chat-conv-item-name">${escHtml(conv.name)}</span>
                </div>
                <span class="chat-conv-item-sub">${escHtml(conv.last_message || '')}</span>
            </div>
            ${unread > 0 ? `<span class="chat-conv-unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
            <button class="chat-conv-more-btn" title="Opsi" onclick="openConvContextMenu(event, '${conv.id}', '${type}')">
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
        `;
        item.onclick = (e) => {
            if (e.target.closest('.chat-conv-more-btn')) return;
            openConversation(conv.id, type);
        };
        listEl.appendChild(item);
    };

    // Pisahkan pinned dan unpinned
    const pinned   = filtered.filter(c => chatState.pinnedConvs.has(c.id));
    const unpinned = filtered.filter(c => !chatState.pinnedConvs.has(c.id));
    const type     = chatState.activeTab === 'groups' ? 'group' : 'dm';

    // Render pinned section
    if (pinned.length > 0) {
        const pinnedHeader = document.createElement('div');
        pinnedHeader.className = 'chat-section-label';
        pinnedHeader.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Disematkan';
        listEl.appendChild(pinnedHeader);
        pinned.forEach(c => renderItem(c, type));
    }

    // Divider
    if (pinned.length > 0 && unpinned.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'chat-section-label';
        divider.innerHTML = chatState.activeTab === 'groups' ? '<i class="fa-solid fa-users"></i> Semua Grup' : '<i class="fa-solid fa-comment-dots"></i> Semua Chat';
        listEl.appendChild(divider);
    }

    unpinned.forEach(c => renderItem(c, type));
}

function buildConvAvatarHtml(conv) {
    if (conv.avatar_url) {
        return `<div class="chat-conv-avatar"><img src="${conv.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>`;
    }
    const initials = (conv.name || '?').slice(0, 2).toUpperCase();
    return `<div class="chat-conv-avatar chat-conv-avatar-initials">${initials}</div>`;
}

function updateChatProfileHeader() {
    const staff = getChatCurrentStaff();
    const nameEl = document.getElementById('chatMyName');
    const roleEl = document.getElementById('chatMyRoleLabel');
    const initialsEl = document.getElementById('chatMyAvatarInitials');
    const imgEl = document.getElementById('chatMyAvatarImg');

    if (!staff) {
        if (nameEl) nameEl.textContent = 'Login untuk chat';
        if (roleEl) roleEl.textContent = '—';
        return;
    }
    if (nameEl) nameEl.textContent = staff.name;
    if (roleEl) roleEl.textContent = staff.role;
    if (initialsEl) initialsEl.textContent = staff.name.slice(0, 2).toUpperCase();

    const avatar = chatState.myUser?.avatar_url;
    if (imgEl && initialsEl) {
        if (avatar) {
            imgEl.src = avatar;
            imgEl.style.display = 'block';
            initialsEl.style.display = 'none';
        } else {
            imgEl.style.display = 'none';
            initialsEl.style.display = 'block';
        }
    }
}

function updateChatUnreadBadge() {
    // Total unread di semua konversasi
    const total = Object.values(chatState.unreadCounts).reduce((a, b) => a + b, 0);
    const badge = document.getElementById('chatUnreadBadge');
    if (badge) {
        if (total > 0) {
            badge.textContent = total > 99 ? '99+' : total;
            badge.classList.remove('hide');
        } else {
            badge.classList.add('hide');
        }
    }
    // Update document title
    updateDocumentTitle(total);
}

function switchChatTab(tab, btn) {
    chatState.activeTab = tab;
    document.querySelectorAll('.chat-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderChatSidebar();
}

// ----------------------------------------------------------------
// OPEN CONVERSATION
// ----------------------------------------------------------------
async function openConversation(convId, type) {
    chatState.activeConvId = convId;
    chatState.activeConvType = type;

    // Immediately clear unread badge for this conversation in UI
    markConvAsRead(convId);
    renderChatSidebar();

    const conv = [...chatState.groups, ...chatState.dms].find(c => c.id === convId);
    if (!conv) return;

    // Show conversation panel
    document.getElementById('chatEmptyState').classList.add('hide');
    const convEl = document.getElementById('chatConversation');
    convEl.classList.remove('hide');

    // Header
    document.getElementById('convHeaderName').textContent = conv.name;
    const members = await getGroupMembers(convId);
    document.getElementById('convHeaderSub').textContent =
        type === 'group' ? `${members.length} anggota` : 'Direct Message';

    const headerAvatar = document.getElementById('convHeaderAvatar');
    headerAvatar.innerHTML = buildConvAvatarHtml(conv);

    // Load & render messages
    const loader = document.getElementById('chatMessagesLoader');
    if (loader) loader.style.display = 'flex';
    await loadMessages(convId);
    renderMessages();
    scrollChatToBottom();

    // Mark active in sidebar
    document.querySelectorAll('.chat-conv-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-id') === convId);
    });

    // Reset unread untuk konv ini
    markConvAsRead(convId);
    renderChatSidebar();
}

// ----------------------------------------------------------------
// RENDER MESSAGES
// ----------------------------------------------------------------
function renderMessages() {
    const area = document.getElementById('chatMessagesArea');
    if (!area) return;
    area.innerHTML = '';

    chatState.messages.forEach(msg => {
        area.appendChild(buildMessageEl(msg));
    });

    const loader = document.getElementById('chatMessagesLoader');
    if (loader) loader.style.display = 'none';
}

function appendMessageToUI(msg) {
    const area = document.getElementById('chatMessagesArea');
    if (!area) return;
    area.appendChild(buildMessageEl(msg));
}

function buildMessageEl(msg) {
    const isMe = chatState.myUser && msg.sender_id === chatState.myUser.id;
    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg-wrapper ${isMe ? 'chat-msg-me' : 'chat-msg-other'}${msg.is_pinned ? ' chat-msg-pinned' : ''}`;
    wrapper.setAttribute('data-id', msg.id);

    // Timestamp full
    const timeStr = msg.created_at
        ? new Date(msg.created_at).toLocaleString('id-ID', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : '';

    // Seen by
    const seenBy = Array.isArray(msg.seen_by) ? msg.seen_by : [];
    const seenCount = seenBy.filter(id => id !== msg.sender_id).length;
    const seenHtml = seenCount > 0
        ? `<span class="chat-msg-seen" title="Dilihat oleh ${seenCount} orang"><i class="fa-solid fa-eye"></i> ${seenCount}</span>`
        : '';

    // Reply quote
    let replyQuoteHtml = '';
    if (msg.reply_to_id && msg.reply_to_name) {
        replyQuoteHtml = `
            <div class="chat-msg-reply-quote" onclick="scrollToMessage('${msg.reply_to_id}')">
                <span class="chat-msg-reply-name">${escHtml(msg.reply_to_name)}</span>
                <span class="chat-msg-reply-text">${escHtml(msg.reply_preview || '...')}</span>
            </div>`;
    }

    // Pin indicator
    const pinHtml = msg.is_pinned ? `<span class="chat-msg-pin-tag"><i class="fa-solid fa-thumbtack"></i> Disematkan</span>` : '';

    // Content
    let contentHtml = '';
    if (msg.attachment_url) {
        if (msg.attachment_url.startsWith('data:image') || msg.attachment_url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            contentHtml = `<img class="chat-msg-image" src="${msg.attachment_url}" alt="gambar" onclick="openImageLightbox('${msg.attachment_url}')">`;
        } else if (msg.attachment_url.match(/^https?:\/\//)) {
            contentHtml = `<a class="chat-msg-link" href="${msg.attachment_url}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-link"></i> ${escHtml(msg.attachment_url)}</a>`;
        }
    }
    if (msg.content) {
        const linked = linkifyText(escHtml(msg.content));
        contentHtml += `<p class="chat-msg-text">${linked}</p>`;
    }

    const avatarHtml = isMe ? '' : buildUserAvatarHtml(msg.sender_avatar, msg.sender_name);

    // Action toolbar (Balas + Pin + [Hapus jika milik saya])
    const pinLabel = msg.is_pinned ? 'Lepas Pin' : 'Pin';
    const pinIcon  = msg.is_pinned ? 'fa-thumbtack-slash' : 'fa-thumbtack';
    const toolbarHtml = `
        <div class="chat-msg-toolbar">
            <button class="chat-msg-action" title="Balas" onclick="startReply('${msg.id}','${escHtml(msg.sender_name)}','${escHtml((msg.content||'').slice(0,60))}')">
                <i class="fa-solid fa-reply"></i><span>Balas</span>
            </button>
            <button class="chat-msg-action" title="${pinLabel}" onclick="togglePinMessage('${msg.id}',${!msg.is_pinned})">
                <i class="fa-solid ${pinIcon}"></i><span>${pinLabel}</span>
            </button>
            ${isMe ? `<button class="chat-msg-action chat-msg-action-danger" title="Hapus" onclick="deleteMessage('${msg.id}')">
                <i class="fa-solid fa-trash-can"></i><span>Hapus</span>
            </button>` : ''}
        </div>`;

    wrapper.innerHTML = `
        ${avatarHtml}
        <div class="chat-msg-col">
            ${pinHtml}
            <div class="chat-msg-meta">
                ${!isMe ? `<span class="chat-msg-sender-name">${escHtml(msg.sender_name || '')}</span>` : '<span class="chat-msg-sender-name chat-msg-sender-me">Saya</span>'}
                <span class="chat-msg-timestamp">${timeStr}</span>
            </div>
            <div class="chat-msg-bubble">
                ${replyQuoteHtml}
                ${contentHtml}
            </div>
            <div class="chat-msg-footer">
                ${seenHtml}
                ${toolbarHtml}
            </div>
        </div>
    `;

    // Mark as seen saat message dirender (jika bukan milik saya)
    if (!isMe && chatState.myUser) {
        markMessageSeen(msg);
    }

    return wrapper;
}

function buildUserAvatarHtml(avatarUrl, name) {
    const initials = (name || '?').slice(0, 2).toUpperCase();
    if (avatarUrl) {
        return `<div class="chat-msg-avatar"><img src="${avatarUrl}" alt="${initials}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>`;
    }
    return `<div class="chat-msg-avatar chat-msg-avatar-initials">${initials}</div>`;
}

// ----------------------------------------------------------------
// REPLY
// ----------------------------------------------------------------
function startReply(msgId, senderName, preview) {
    chatState.replyTo = { id: msgId, sender_name: senderName, preview };
    const bar = document.getElementById('chatReplyBar');
    if (bar) {
        document.getElementById('chatReplyBarName').textContent = senderName;
        document.getElementById('chatReplyBarText').textContent = preview || '...';
        bar.classList.remove('hide');
    }
    document.getElementById('chatMessageInput')?.focus();
}

function cancelReply() {
    chatState.replyTo = null;
    const bar = document.getElementById('chatReplyBar');
    if (bar) bar.classList.add('hide');
}

function scrollToMessage(msgId) {
    const el = document.querySelector(`.chat-msg-wrapper[data-id="${msgId}"]`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('chat-msg-highlight');
        setTimeout(() => el.classList.remove('chat-msg-highlight'), 1800);
    }
}

// ----------------------------------------------------------------
// PIN MESSAGE
// ----------------------------------------------------------------
async function togglePinMessage(msgId, pin) {
    try {
        const { error } = await supabaseClient
            .from('chat_messages')
            .update({ is_pinned: pin })
            .eq('id', msgId);
        if (error) throw error;
        // Update local state
        const msg = chatState.messages.find(m => m.id === msgId);
        if (msg) msg.is_pinned = pin;
        // Re-render only this message
        const el = document.querySelector(`.chat-msg-wrapper[data-id="${msgId}"]`);
        if (el) el.replaceWith(buildMessageEl(msg));
        showToast(pin ? 'Pesan disematkan.' : 'Pin dilepas.', 'success');
    } catch (err) {
        showToast('Gagal: ' + err.message, 'error');
    }
}

// ----------------------------------------------------------------
// DELETE MESSAGE
// ----------------------------------------------------------------
async function deleteMessage(msgId) {
    const ok = await showCustomConfirm('Hapus pesan ini?', 'Hapus Pesan', true);
    if (!ok) return;
    try {
        const { error } = await supabaseClient.from('chat_messages').delete().eq('id', msgId);
        if (error) throw error;
        chatState.messages = chatState.messages.filter(m => m.id !== msgId);
        const el = document.querySelector(`.chat-msg-wrapper[data-id="${msgId}"]`);
        if (el) {
            el.classList.add('chat-msg-deleting');
            setTimeout(() => el.remove(), 300);
        }
    } catch (err) {
        showToast('Gagal hapus: ' + err.message, 'error');
    }
}

// ----------------------------------------------------------------
// SEEN BY
// ----------------------------------------------------------------
async function markMessageSeen(msg) {
    const myId = chatState.myUser?.id;
    if (!myId || !msg.id) return;
    const seenBy = Array.isArray(msg.seen_by) ? msg.seen_by : [];
    if (seenBy.includes(myId)) return; // sudah ditandai
    const updated = [...seenBy, myId];
    // Update DB tanpa await agar tidak blocking render
    supabaseClient.from('chat_messages')
        .update({ seen_by: updated })
        .eq('id', msg.id)
        .then(() => { msg.seen_by = updated; });
}

function scrollChatToBottom() {
    const area = document.getElementById('chatMessagesArea');
    if (area) setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
}

function scrollChatToBottom() {
    const area = document.getElementById('chatMessagesArea');
    if (area) setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
}

function linkifyText(text) {
    if (!text) return '';

    // 1. Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
    let formatted = text.replace(urlRegex, url => `<a class="chat-inline-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);

    // 2. Format @mentions (@Nama Staff or @Nama)
    const mentionRegex = /@([A-Za-z0-9_ -]+?)(?=[.,!?\s]|$)/g;
    const staffList = (window.state && Array.isArray(window.state.staff)) ? window.state.staff : [];

    formatted = formatted.replace(mentionRegex, (match, nameGroup) => {
        const trimmed = nameGroup.trim();
        if (!trimmed) return match;
        const isStaff = staffList.some(s => s.name && s.name.toLowerCase() === trimmed.toLowerCase()) || trimmed.length >= 3;
        if (isStaff) {
            return `<span class="chat-mention"><i class="fa-solid fa-at"></i>${trimmed}</span>`;
        }
        return match;
    });

    return formatted;
}

// ----------------------------------------------------------------
// MENTION (@STAFF) AUTOCOMPLETE SYSTEM
// ----------------------------------------------------------------
let chatMentionState = {
    active: false,
    query: '',
    atIndex: -1,
    selectedIndex: 0,
    matches: []
};

function handleChatInputMention(e) {
    const input = e.target;
    const val = input.value;
    const cursorPos = input.selectionStart;

    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

    if (lastAtIdx !== -1) {
        const query = textBeforeCursor.slice(lastAtIdx + 1);
        const charBeforeAt = lastAtIdx > 0 ? textBeforeCursor[lastAtIdx - 1] : ' ';

        if ((/[\s\n,.;:(!?]/.test(charBeforeAt) || lastAtIdx === 0) && !/\n/.test(query) && query.length <= 30) {
            openChatMentionDropdown(query, lastAtIdx);
            return;
        }
    }

    closeChatMentionDropdown();
}

function openChatMentionDropdown(query, atIndex) {
    const dropdown = document.getElementById('chatMentionDropdown');
    if (!dropdown) return;

    let staffList = (window.state && Array.isArray(window.state.staff)) ? window.state.staff : [];

    // Filter staff matching query
    const matches = staffList.filter(s =>
        s.name && s.name.toLowerCase().includes(query.toLowerCase())
    );

    if (matches.length === 0) {
        closeChatMentionDropdown();
        return;
    }

    chatMentionState = {
        active: true,
        query,
        atIndex,
        selectedIndex: 0,
        matches
    };

    dropdown.innerHTML = matches.map((s, idx) => `
        <div class="chat-mention-item ${idx === 0 ? 'selected' : ''}" onclick="selectMentionStaff('${escHtml(s.name)}')">
            <div class="chat-mention-avatar">${escHtml((s.name || '?').slice(0,2).toUpperCase())}</div>
            <div class="chat-mention-info">
                <span class="chat-mention-name">@${escHtml(s.name)}</span>
                <span class="chat-mention-role">${escHtml(s.role || 'Staff')}</span>
            </div>
        </div>
    `).join('');

    dropdown.classList.remove('hide');
}

function updateMentionDropdownSelection() {
    const dropdown = document.getElementById('chatMentionDropdown');
    if (!dropdown) return;

    const items = dropdown.querySelectorAll('.chat-mention-item');
    items.forEach((item, idx) => {
        if (idx === chatMentionState.selectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function selectMentionStaff(staffName) {
    const input = document.getElementById('chatMessageInput');
    if (!input) return;

    const val = input.value;
    const atIdx = chatMentionState.atIndex;
    const cursorPos = input.selectionStart;

    const beforeAt = val.slice(0, atIdx);
    const afterCursor = val.slice(cursorPos);

    const replacement = `@${staffName} `;
    input.value = beforeAt + replacement + afterCursor;

    const newCursorPos = atIdx + replacement.length;
    input.setSelectionRange(newCursorPos, newCursorPos);

    closeChatMentionDropdown();
    input.focus();
}

function closeChatMentionDropdown() {
    chatMentionState.active = false;
    const dropdown = document.getElementById('chatMentionDropdown');
    if (dropdown) dropdown.classList.add('hide');
}

// ----------------------------------------------------------------
// SEND MESSAGE
// ----------------------------------------------------------------
async function sendChatMessage() {
    if (!chatState.myUser) {
        showToast("Login terlebih dahulu untuk mengirim pesan.", "error"); return;
    }
    if (!chatState.activeConvId) {
        showToast("Pilih percakapan terlebih dahulu.", "warning"); return;
    }

    const input = document.getElementById('chatMessageInput');
    const text = (input?.value || '').trim();
    const imgB64 = chatState.pendingImageBase64;

    if (!text && !imgB64) return;

    const btn = document.getElementById('chatSendBtn');
    if (btn) btn.disabled = true;

    try {
        const msg = {
            group_id: chatState.activeConvId,
            sender_id: chatState.myUser.id,
            sender_name: chatState.myUser.name,
            sender_avatar: chatState.myUser.avatar_url || null,
            content: text || null,
            attachment_url: imgB64 || null,
            reply_to_id: chatState.replyTo?.id || null,
            reply_to_name: chatState.replyTo?.sender_name || null,
            reply_preview: chatState.replyTo?.preview || null,
        };

        const { data, error } = await supabaseClient.from('chat_messages').insert(msg).select().single();
        if (error) throw error;

        // Optimistic: append immediately
        chatState.messages.push(data);
        appendMessageToUI(data);
        scrollChatToBottom();

        // Update last_message preview on group
        await supabaseClient.from('chat_groups')
            .update({ last_message: text ? text.slice(0, 60) : '📷 Gambar' })
            .eq('id', chatState.activeConvId);

        // Reset input & mentions
        if (input) { input.value = ''; input.style.height = 'auto'; }
        closeChatMentionDropdown();
        clearImageAttachment();
        cancelReply();
        renderChatSidebar();
    } catch (err) {
        console.error("Gagal kirim pesan:", err);
        showToast("Gagal mengirim pesan.", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

function handleChatInputKeydown(e) {
    const dropdown = document.getElementById('chatMentionDropdown');
    const isDropdownVisible = dropdown && !dropdown.classList.contains('hide') && chatMentionState.active;

    if (isDropdownVisible) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            chatMentionState.selectedIndex = (chatMentionState.selectedIndex + 1) % chatMentionState.matches.length;
            updateMentionDropdownSelection();
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            chatMentionState.selectedIndex = (chatMentionState.selectedIndex - 1 + chatMentionState.matches.length) % chatMentionState.matches.length;
            updateMentionDropdownSelection();
            return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            const selected = chatMentionState.matches[chatMentionState.selectedIndex];
            if (selected) {
                selectMentionStaff(selected.name);
            }
            return;
        }
        if (e.key === 'Escape') {
            closeChatMentionDropdown();
            return;
        }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
}

function autoResizeChatInput(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ----------------------------------------------------------------
// IMAGE ATTACHMENT
// ----------------------------------------------------------------
function handleChatImageSelect(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
        showToast("Ukuran gambar maksimal 1MB.", "warning");
        input.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        chatState.pendingImageBase64 = e.target.result;
        const previewEl = document.getElementById('chatImgPreview');
        const previewImg = document.getElementById('chatImgPreviewImg');
        if (previewEl && previewImg) {
            previewImg.src = e.target.result;
            previewEl.classList.remove('hide');
        }
    };
    reader.readAsDataURL(file);
}

function clearImageAttachment() {
    chatState.pendingImageBase64 = null;
    const previewEl = document.getElementById('chatImgPreview');
    const previewImg = document.getElementById('chatImgPreviewImg');
    const imgInput = document.getElementById('chatImageInput');
    if (previewEl) previewEl.classList.add('hide');
    if (previewImg) previewImg.src = '';
    if (imgInput) imgInput.value = '';
}

// ----------------------------------------------------------------
// LIGHTBOX
// ----------------------------------------------------------------
function openImageLightbox(src) {
    const lb = document.createElement('div');
    lb.className = 'chat-lightbox';
    lb.innerHTML = `<div class="chat-lightbox-backdrop" onclick="this.parentElement.remove()"></div><img src="${src}" alt="gambar besar"><button onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>`;
    document.body.appendChild(lb);
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// SYNC: Pastikan SEMUA staff di tabel staff ada di chat_users
// Dipanggil saat initChat() agar semua staff langsung bisa di-mention, di-DM, dll.
// ----------------------------------------------------------------
async function syncAllStaffToChatUsers() {
    if (!state.staff || state.staff.length === 0) return;

    try {
        // 1. Ambil semua id yang sudah ada di chat_users (satu query)
        const { data: existingUsers } = await supabaseClient
            .from('chat_users')
            .select('id, name');

        const existingIds = new Set((existingUsers || []).map(u => u.id));

        // 2. Filter staff yang belum ada
        const toInsert = state.staff
            .filter(s => !existingIds.has(s.id))
            .map(s => ({ id: s.id, name: s.name, avatar_url: null }));

        // 3. Update nama jika berubah (staff rename)
        const toUpdate = state.staff.filter(s => {
            const existing = (existingUsers || []).find(u => u.id === s.id);
            return existing && existing.name !== s.name;
        });

        // Batch insert yang belum ada
        if (toInsert.length > 0) {
            await supabaseClient.from('chat_users').insert(toInsert);
            console.log(`[Chat] Synced ${toInsert.length} staff baru ke chat_users`);
        }

        // Update nama satu per satu (biasanya jarang)
        for (const s of toUpdate) {
            await supabaseClient.from('chat_users')
                .update({ name: s.name })
                .eq('id', s.id);
        }

    } catch (err) {
        console.warn('[Chat] syncAllStaffToChatUsers error:', err.message);
        // Non-fatal — chat tetap bisa dipakai
    }
}

// ----------------------------------------------------------------
// HELPER: Pastikan staff_ids ada di chat_users sebelum insert FK
// Staff yang belum pernah login tidak punya record di chat_users
// ----------------------------------------------------------------
async function ensureChatUsersExist(userIds) {
    for (const uid of userIds) {
        const staffObj = state.staff.find(s => s.id === uid);
        if (!staffObj) continue;
        const { data: existing } = await supabaseClient
            .from('chat_users')
            .select('id')
            .eq('id', uid)
            .maybeSingle();
        if (!existing) {
            await supabaseClient
                .from('chat_users')
                .insert({ id: uid, name: staffObj.name, avatar_url: null });
        }
    }
}

// ----------------------------------------------------------------
// CREATE GROUP
// ----------------------------------------------------------------
function openCreateGroupModal() {
    if (!canCreateChat()) {
        showToast("Hanya CS LINE dan KAPTEN KASIR yang dapat membuat grup.", "error"); return;
    }
    chatState.groupMemberSelections = new Set();
    document.getElementById('newGroupName').value = '';
    document.getElementById('groupMemberSearch').value = '';
    renderGroupMemberPickList('');
    renderGroupMemberSelected();
    document.getElementById('modalCreateGroup').classList.remove('hide');
}

function filterGroupMemberList(q) {
    renderGroupMemberPickList(q);
}

function renderGroupMemberPickList(q) {
    const listEl = document.getElementById('groupMemberPickList');
    if (!listEl) return;
    const lq = q.toLowerCase();
    const others = state.staff.filter(s =>
        s.id !== chatState.myUser?.id &&
        !chatState.groupMemberSelections.has(s.id) &&
        (s.name.toLowerCase().includes(lq) || (s.role || '').toLowerCase().includes(lq))
    );

    listEl.innerHTML = '';

    // Counter header
    const totalEligible = state.staff.filter(s =>
        s.id !== chatState.myUser?.id && !chatState.groupMemberSelections.has(s.id)
    ).length;
    const counter = document.createElement('div');
    counter.className = 'chat-list-counter';
    counter.innerHTML = lq
        ? `<i class="fa-solid fa-magnifying-glass"></i> ${others.length} hasil dari ${totalEligible} staff`
        : `<i class="fa-solid fa-users"></i> ${totalEligible} Staff · ${chatState.groupMemberSelections.size} dipilih`;
    listEl.appendChild(counter);

    if (others.length === 0) {
        listEl.innerHTML += '<span style="font-size:0.75rem;color:var(--text-muted);padding:8px 12px;display:block;">Tidak ditemukan</span>';
        return;
    }

    others.forEach(s => {
        const item = document.createElement('div');
        item.className = 'chat-member-item';
        item.innerHTML = `
            <div class="chat-member-avatar-sm">${s.name.slice(0,2).toUpperCase()}</div>
            <span class="chat-member-name">${escHtml(s.name)}</span>
            <span class="chat-member-role-tag">${escHtml(s.role)}</span>
            <button class="chat-icon-btn" onclick="addGroupMember('${s.id}')"><i class="fa-solid fa-plus"></i></button>
        `;
        listEl.appendChild(item);
    });
}

function addGroupMember(staffId) {
    chatState.groupMemberSelections.add(staffId);
    renderGroupMemberSelected();
    renderGroupMemberPickList(document.getElementById('groupMemberSearch')?.value || '');
}

function removeGroupMember(staffId) {
    chatState.groupMemberSelections.delete(staffId);
    renderGroupMemberSelected();
    renderGroupMemberPickList(document.getElementById('groupMemberSearch')?.value || '');
}

function renderGroupMemberSelected() {
    const el = document.getElementById('groupMemberSelected');
    if (!el) return;
    if (chatState.groupMemberSelections.size === 0) {
        el.innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted);">Belum ada anggota dipilih</span>';
        return;
    }
    el.innerHTML = '';
    chatState.groupMemberSelections.forEach(id => {
        const s = state.staff.find(x => x.id === id);
        if (!s) return;
        const chip = document.createElement('div');
        chip.className = 'chat-selected-chip';
        chip.innerHTML = `${escHtml(s.name)} <button onclick="removeGroupMember('${s.id}')"><i class="fa-solid fa-xmark"></i></button>`;
        el.appendChild(chip);
    });
}

async function submitCreateGroup() {
    const name = (document.getElementById('newGroupName')?.value || '').trim();
    if (!name) { showToast("Nama grup tidak boleh kosong.", "warning"); return; }
    if (!chatState.myUser) return;

    try {
        const { data: group, error } = await supabaseClient
            .from('chat_groups')
            .insert({ name, created_by: chatState.myUser.id, is_dm: false, last_message: '' })
            .select().single();
        if (error) throw error;

        // Pastikan semua anggota sudah ada di chat_users sebelum insert FK
        const memberIds = [chatState.myUser.id, ...chatState.groupMemberSelections];
        await ensureChatUsersExist(memberIds);

        const members = memberIds.map(uid => ({
            group_id: group.id,
            user_id: uid,
            role: uid === chatState.myUser.id ? 'admin' : 'member'
        }));
        await supabaseClient.from('chat_group_members').insert(members);

        chatState.groups.unshift(group);
        document.getElementById('modalCreateGroup').classList.add('hide');
        renderChatSidebar();
        openConversation(group.id, 'group');
        showToast(`Grup "${name}" berhasil dibuat!`, "success");
    } catch (err) {
        console.error(err);
        showToast("Gagal membuat grup.", "error");
    }
}

// ----------------------------------------------------------------
// DIRECT MESSAGE
// ----------------------------------------------------------------
function openNewDmModal() {
    if (!canCreateChat()) {
        showToast("Hanya CS LINE dan KAPTEN KASIR yang dapat memulai DM.", "error"); return;
    }
    document.getElementById('dmStaffSearch').value = '';
    filterDmStaffList('');
    document.getElementById('modalNewDm').classList.remove('hide');
}

function filterDmStaffList(q) {
    const listEl = document.getElementById('dmStaffPickList');
    if (!listEl) return;
    const lq = q.toLowerCase();
    const others = state.staff.filter(s =>
        s.id !== chatState.myUser?.id &&
        (s.name.toLowerCase().includes(lq) || (s.role || '').toLowerCase().includes(lq))
    );

    listEl.innerHTML = '';

    // Counter header
    const total = state.staff.filter(s => s.id !== chatState.myUser?.id).length;
    const counter = document.createElement('div');
    counter.className = 'chat-list-counter';
    counter.innerHTML = lq
        ? `<i class="fa-solid fa-magnifying-glass"></i> ${others.length} hasil dari ${total} staff`
        : `<i class="fa-solid fa-users"></i> ${total} Staff Tersedia`;
    listEl.appendChild(counter);

    if (others.length === 0) {
        listEl.innerHTML += '<span style="font-size:0.75rem;color:var(--text-muted);padding:8px 12px;display:block;">Tidak ditemukan</span>';
        return;
    }

    others.forEach(s => {
        const item = document.createElement('div');
        item.className = 'chat-member-item';
        item.innerHTML = `
            <div class="chat-member-avatar-sm">${s.name.slice(0,2).toUpperCase()}</div>
            <span class="chat-member-name">${escHtml(s.name)}</span>
            <span class="chat-member-role-tag">${escHtml(s.role)}</span>
            <button class="btn btn-primary" style="padding:4px 12px;font-size:0.72rem;" onclick="startDmWith('${s.id}', '${escHtml(s.name)}')">Chat</button>
        `;
        listEl.appendChild(item);
    });
}

async function startDmWith(targetId, targetName) {
    if (!chatState.myUser) return;
    // Cek apakah DM sudah ada
    const existing = chatState.dms.find(d => d.name === buildDmName(chatState.myUser.name, targetName));
    if (existing) {
        document.getElementById('modalNewDm').classList.add('hide');
        chatState.activeTab = 'dms';
        document.querySelectorAll('.chat-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === 'dms'));
        renderChatSidebar();
        openConversation(existing.id, 'dm');
        return;
    }

    try {
        const dmName = buildDmName(chatState.myUser.name, targetName);
        const { data: group, error } = await supabaseClient
            .from('chat_groups')
            .insert({ name: dmName, created_by: chatState.myUser.id, is_dm: true, last_message: '' })
            .select().single();
        if (error) throw error;

        // Pastikan kedua user ada di chat_users sebelum insert FK
        await ensureChatUsersExist([chatState.myUser.id, targetId]);

        await supabaseClient.from('chat_group_members').insert([
            { group_id: group.id, user_id: chatState.myUser.id, role: 'member' },
            { group_id: group.id, user_id: targetId, role: 'member' }
        ]);

        chatState.dms.unshift(group);
        document.getElementById('modalNewDm').classList.add('hide');
        chatState.activeTab = 'dms';
        document.querySelectorAll('.chat-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === 'dms'));
        renderChatSidebar();
        openConversation(group.id, 'dm');
    } catch (err) {
        console.error(err);
        showToast("Gagal membuat DM.", "error");
    }
}

function buildDmName(a, b) {
    return [a, b].sort().join(' ↔ ');
}

// ----------------------------------------------------------------
// GROUP INFO PANEL
// ----------------------------------------------------------------
function toggleConvInfo() {
    const panel = document.getElementById('chatInfoPanel');
    if (!panel) return;
    const isHidden = panel.classList.contains('hide');
    if (isHidden) {
        panel.classList.remove('hide');
        renderConvInfoPanel();
    } else {
        panel.classList.add('hide');
    }
}

async function renderConvInfoPanel() {
    const titleEl = document.getElementById('chatInfoTitle');
    const bodyEl = document.getElementById('chatInfoBody');
    if (!bodyEl) return;

    const conv = [...chatState.groups, ...chatState.dms].find(c => c.id === chatState.activeConvId);
    if (!conv) return;

    if (titleEl) titleEl.textContent = conv.is_dm ? 'Info DM' : 'Info Grup';

    const members = await getGroupMembers(chatState.activeConvId);

    const isAdmin = canCreateChat();
    const addMemberBtn = (isAdmin && !conv.is_dm) ? `<button class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:0.78rem;" onclick="openAddMemberModal('${conv.id}')"><i class="fa-solid fa-user-plus"></i> Tambah Anggota</button>` : '';
    const changePhotoBtn = (isAdmin && !conv.is_dm) ? `<button class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:0.78rem;" onclick="openGroupAvatarModal('${conv.id}')"><i class="fa-solid fa-camera"></i> Ganti Foto Grup</button>` : '';

    // Avatar grup
    const groupAvatarHtml = conv.avatar_url
        ? `<img src="${conv.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : `<span style="font-size:1.4rem;font-weight:800;color:#fff;">${(conv.name||'?').slice(0,2).toUpperCase()}</span>`;

    bodyEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;padding:16px 0 14px;border-bottom:1px solid var(--glass-border);margin-bottom:14px;gap:10px;">
            <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 0 0 3px rgba(139,92,246,0.3);cursor:${isAdmin && !conv.is_dm ? 'pointer' : 'default'};"
                 onclick="${isAdmin && !conv.is_dm ? `openGroupAvatarModal('${conv.id}')` : ''}">
                ${groupAvatarHtml}
            </div>
            <div style="text-align:center;">
                <div style="font-size:1rem;font-weight:800;">${escHtml(conv.name)}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);margin-top:3px;">${conv.is_dm ? 'Direct Message' : 'Grup'} · Dibuat ${new Date(conv.created_at).toLocaleDateString('id-ID')}</div>
            </div>
        </div>
        <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:1px;margin-bottom:8px;">${members.length} Anggota</div>
        <div class="chat-info-members">
            ${members.map(m => `
                <div class="chat-info-member-row">
                    ${buildUserAvatarHtml(m.avatar_url, m.name)}
                    <span>${escHtml(m.name)}</span>
                    ${m.id === conv.created_by ? '<span class="chat-info-admin-badge">Admin</span>' : ''}
                </div>
            `).join('')}
        </div>
        ${addMemberBtn}
        ${changePhotoBtn}
    `;
}

// ----------------------------------------------------------------
// GROUP AVATAR (FOTO PROFIL GRUP)
// ----------------------------------------------------------------
function openGroupAvatarModal(groupId) {
    if (!canCreateChat()) {
        showToast("Hanya CS LINE dan KAPTEN KASIR yang dapat mengubah foto grup.", "error"); return;
    }

    chatState._groupAvatarTargetId = groupId;
    chatState._groupAvatarPending = null;

    const conv = [...chatState.groups, ...chatState.dms].find(c => c.id === groupId);

    // Hapus modal lama jika ada
    const oldModal = document.getElementById('modalGroupAvatar');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'modalGroupAvatar';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9000;backdrop-filter:blur(4px);';

    const currentAvatar = conv?.avatar_url;
    const initials = (conv?.name || '?').slice(0, 2).toUpperCase();

    modal.innerHTML = `
        <div class="glass-card chat-modal" style="max-width:380px;width:92%;position:relative;text-align:center;">
            <button class="modal-close-btn" onclick="document.getElementById('modalGroupAvatar').remove()"><i class="fa-solid fa-xmark"></i></button>
            <h3 style="font-size:1rem;font-weight:800;color:var(--text-main);display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--glass-border);padding-bottom:14px;margin-bottom:20px;justify-content:center;">
                <i class="fa-solid fa-camera" style="color:var(--accent)"></i> Foto Profil Grup
            </h3>
            <div style="display:flex;flex-direction:column;align-items:center;gap:16px;">
                <div id="groupAvatarPreviewWrap" style="width:110px;height:110px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 0 0 3px rgba(139,92,246,0.4),0 8px 24px rgba(0,0,0,0.4);">
                    ${currentAvatar
                        ? `<img id="groupAvatarPreviewImg" src="${currentAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                        : `<span id="groupAvatarPreviewImg" style="font-size:2rem;font-weight:800;color:white;">${initials}</span>`}
                </div>
                <label class="btn btn-secondary" style="cursor:pointer;font-size:0.8rem;">
                    <i class="fa-solid fa-upload"></i> Pilih Foto
                    <input type="file" id="groupAvatarFileInput" accept="image/*" style="display:none;" onchange="handleGroupAvatarSelect(this)">
                </label>
                <p style="font-size:0.7rem;color:var(--text-muted);">Max 500KB · akan tersimpan sebagai base64</p>
            </div>
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button class="btn btn-secondary" style="flex:1" onclick="document.getElementById('modalGroupAvatar').remove()">Batal</button>
                <button class="btn btn-primary" style="flex:1" onclick="submitGroupAvatarChange()"><i class="fa-solid fa-check"></i> Simpan</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function handleGroupAvatarSelect(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
        showToast("Ukuran foto maksimal 500KB.", "warning");
        input.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        chatState._groupAvatarPending = e.target.result;
        const wrap = document.getElementById('groupAvatarPreviewWrap');
        if (wrap) {
            wrap.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        }
    };
    reader.readAsDataURL(file);
}

async function submitGroupAvatarChange() {
    const groupId = chatState._groupAvatarTargetId;
    const avatarB64 = chatState._groupAvatarPending;

    if (!avatarB64) { showToast("Pilih foto terlebih dahulu.", "warning"); return; }
    if (!groupId) return;

    const btn = document.querySelector('#modalGroupAvatar .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

    try {
        const { error } = await supabaseClient
            .from('chat_groups')
            .update({ avatar_url: avatarB64 })
            .eq('id', groupId);
        if (error) throw error;

        // Update local state
        const conv = [...chatState.groups, ...chatState.dms].find(c => c.id === groupId);
        if (conv) conv.avatar_url = avatarB64;

        document.getElementById('modalGroupAvatar')?.remove();
        showToast("Foto grup berhasil diperbarui!", "success");

        // Refresh UI
        renderChatSidebar();
        renderConvInfoPanel();
        // Update header avatar
        const headerAvatar = document.getElementById('convHeaderAvatar');
        if (headerAvatar && conv) headerAvatar.innerHTML = buildConvAvatarHtml(conv);
    } catch (err) {
        console.error(err);
        showToast("Gagal menyimpan foto: " + err.message, "error");
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Simpan'; }
    }
}

async function openAddMemberModal(groupId) {
    const allMembers = await getGroupMembers(groupId);
    const memberIds = new Set(allMembers.map(m => m.id));
    const eligible = state.staff.filter(s => !memberIds.has(s.id));

    if (eligible.length === 0) {
        showToast("Semua staff sudah menjadi anggota grup ini.", "info");
        return;
    }

    // Simpan context ke state sementara
    chatState._addMemberGroupId = groupId;
    chatState._addMemberSelections = new Set();
    chatState._existingMemberIds = memberIds; // simpan agar renderAddMemberList bisa filter

    // Build modal HTML dinamis
    const existing = document.getElementById('modalAddMember');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modalAddMember';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9000;backdrop-filter:blur(4px);';
    modal.innerHTML = `
        <div class="glass-card chat-modal" style="max-width:460px;width:95%;position:relative;max-height:90vh;overflow-y:auto;">
            <button onclick="document.getElementById('modalAddMember').remove()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.85rem;">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <h3 style="font-size:1rem;font-weight:800;color:var(--text-main);display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--glass-border);padding-bottom:14px;margin-bottom:18px;">
                <i class="fa-solid fa-user-plus" style="color:var(--accent)"></i> Tambah Anggota ke Grup
            </h3>
            <div style="margin-bottom:12px;">
                <input type="text" id="addMemberSearch" class="chat-modal-input" placeholder="Cari nama staff..."
                    oninput="renderAddMemberList(this.value)" style="width:100%;box-sizing:border-box;">
            </div>
            <div id="addMemberPickList" class="chat-member-pick-list" style="max-height:220px;overflow-y:auto;margin-bottom:12px;"></div>
            <div id="addMemberSelected" class="chat-member-selected" style="min-height:32px;margin-bottom:16px;"></div>
            <div style="display:flex;gap:10px;">
                <button class="btn btn-secondary" style="flex:1" onclick="document.getElementById('modalAddMember').remove()">Batal</button>
                <button class="btn btn-primary" style="flex:1" onclick="submitAddMembers()">
                    <i class="fa-solid fa-check"></i> Tambah Anggota
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Render list awal
    renderAddMemberList('');
}

function renderAddMemberList(q) {
    const listEl = document.getElementById('addMemberPickList');
    if (!listEl) return;

    const groupId = chatState._addMemberGroupId;
    const selected = chatState._addMemberSelections;

    // Ambil staff yang belum di grup DAN belum dipilih saat ini
    const existing = document.getElementById('modalAddMember');
    if (!existing) return;

    const lq = (q || '').toLowerCase();
    const eligible = state.staff.filter(s => {
        // Bukan anggota grup saat ini (kita cek dari DOM state saat open)
        const alreadyMember = chatState._existingMemberIds?.has(s.id) || false;
        const alreadySelected = selected.has(s.id);
        const matchQ = !lq || s.name.toLowerCase().includes(lq) || (s.role || '').toLowerCase().includes(lq);
        return !alreadyMember && !alreadySelected && matchQ;
    });

    listEl.innerHTML = '';
    if (eligible.length === 0) {
        listEl.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);padding:8px 12px;display:block;">Tidak ada staff yang bisa ditambahkan</span>';
        return;
    }

    eligible.forEach(s => {
        const item = document.createElement('div');
        item.className = 'chat-member-item';
        item.innerHTML = `
            <div class="chat-member-avatar-sm">${s.name.slice(0,2).toUpperCase()}</div>
            <span class="chat-member-name">${escHtml(s.name)}</span>
            <span class="chat-member-role-tag">${escHtml(s.role)}</span>
            <button class="chat-icon-btn" onclick="selectAddMember('${s.id}')"><i class="fa-solid fa-plus"></i></button>
        `;
        listEl.appendChild(item);
    });
}

function selectAddMember(staffId) {
    if (!chatState._addMemberSelections) return;
    chatState._addMemberSelections.add(staffId);
    renderAddMemberSelected();
    renderAddMemberList(document.getElementById('addMemberSearch')?.value || '');
}

function deselectAddMember(staffId) {
    if (!chatState._addMemberSelections) return;
    chatState._addMemberSelections.delete(staffId);
    renderAddMemberSelected();
    renderAddMemberList(document.getElementById('addMemberSearch')?.value || '');
}

function renderAddMemberSelected() {
    const el = document.getElementById('addMemberSelected');
    if (!el) return;
    const selected = chatState._addMemberSelections;

    if (!selected || selected.size === 0) {
        el.innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted);">Belum ada yang dipilih</span>';
        return;
    }

    el.innerHTML = '';
    selected.forEach(id => {
        const s = state.staff.find(x => x.id === id);
        if (!s) return;
        const chip = document.createElement('div');
        chip.className = 'chat-selected-chip';
        chip.innerHTML = `${escHtml(s.name)} <button onclick="deselectAddMember('${s.id}')"><i class="fa-solid fa-xmark"></i></button>`;
        el.appendChild(chip);
    });
}

async function submitAddMembers() {
    const groupId = chatState._addMemberGroupId;
    const selected = chatState._addMemberSelections;

    if (!selected || selected.size === 0) {
        showToast("Pilih minimal satu anggota.", "warning");
        return;
    }

    const btn = document.querySelector('#modalAddMember .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...'; }

    try {
        // Pastikan semua staff yang dipilih ada di chat_users (mungkin belum pernah login)
        const selectedIds = [...selected];
        await ensureChatUsersExist(selectedIds);

        const inserts = selectedIds.map(uid => ({
            group_id: groupId,
            user_id: uid,
            role: 'member'
        }));
        const { error } = await supabaseClient.from('chat_group_members').insert(inserts);
        if (error) throw error;

        document.getElementById('modalAddMember')?.remove();
        showToast(`${selected.size} anggota berhasil ditambahkan!`, "success");

        // Refresh info panel
        renderConvInfoPanel();
        // Update header sub (jumlah anggota)
        const members = await getGroupMembers(groupId);
        const subEl = document.getElementById('convHeaderSub');
        if (subEl) subEl.textContent = `${members.length} anggota`;
    } catch (err) {
        console.error(err);
        showToast("Gagal menambahkan anggota: " + err.message, "error");
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Tambah Anggota'; }
    }
}

// ----------------------------------------------------------------
// CHANGE AVATAR (FOTO PROFIL)
// ----------------------------------------------------------------
function openChangeAvatarModal() {
    const staff = getChatCurrentStaff();
    if (!staff) { showToast("Login terlebih dahulu.", "error"); return; }
    chatState.pendingAvatarBase64 = null;

    const previewImg = document.getElementById('avatarPreviewImg');
    const previewInitials = document.getElementById('avatarPreviewInitials');
    const current = chatState.myUser?.avatar_url;

    if (previewInitials) previewInitials.textContent = staff.name.slice(0, 2).toUpperCase();

    if (current && previewImg) {
        previewImg.src = current;
        previewImg.style.display = 'block';
        if (previewInitials) previewInitials.style.display = 'none';
    } else {
        if (previewImg) previewImg.style.display = 'none';
        if (previewInitials) previewInitials.style.display = 'flex';
    }

    document.getElementById('avatarFileInput').value = '';
    document.getElementById('modalChangeAvatar').classList.remove('hide');
}

function handleAvatarFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
        showToast("Ukuran foto maksimal 500KB.", "warning");
        input.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        chatState.pendingAvatarBase64 = e.target.result;
        const previewImg = document.getElementById('avatarPreviewImg');
        const previewInitials = document.getElementById('avatarPreviewInitials');
        if (previewImg) { previewImg.src = e.target.result; previewImg.style.display = 'block'; }
        if (previewInitials) previewInitials.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function submitAvatarChange() {
    if (!chatState.pendingAvatarBase64) {
        showToast("Pilih foto terlebih dahulu.", "warning"); return;
    }
    if (!chatState.myUser) return;
    try {
        await supabaseClient.from('chat_users').update({ avatar_url: chatState.pendingAvatarBase64 }).eq('id', chatState.myUser.id);
        chatState.myUser.avatar_url = chatState.pendingAvatarBase64;
        chatState.pendingAvatarBase64 = null;
        document.getElementById('modalChangeAvatar').classList.add('hide');
        updateChatProfileHeader();
        showToast("Foto profil berhasil diperbarui!", "success");
    } catch (err) {
        console.error(err);
        showToast("Gagal menyimpan foto profil.", "error");
    }
}

// ----------------------------------------------------------------
// NOTIFICATIONS & UNREAD TRACKING
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// NOTIFICATIONS & UNREAD TRACKING
// ----------------------------------------------------------------

function requestNotificationPermission() {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
        // Tampilkan banner — JANGAN langsung request (browser akan block)
        const banner = document.getElementById('chatNotifBanner');
        if (banner) banner.classList.remove('hide');
    } else if (Notification.permission === 'granted') {
        // Sudah diizinkan, sembunyikan banner jika masih ada
        const banner = document.getElementById('chatNotifBanner');
        if (banner) banner.classList.add('hide');
    }
    // Jika 'denied' — tidak tampilkan apapun
}

// Dipanggil saat user KLIK tombol "Izinkan" di banner
async function enableChatNotifications() {
    if (!('Notification' in window)) {
        showToast("Browser Anda tidak mendukung notifikasi.", "warning");
        return;
    }

    const permission = await Notification.requestPermission();
    const banner = document.getElementById('chatNotifBanner');

    if (permission === 'granted') {
        if (banner) banner.classList.add('hide');
        showToast("Notifikasi berhasil diaktifkan!", "success");
        // Kirim notifikasi percobaan
        _sendBrowserNotification(
            'WB Team Chat',
            'Notifikasi berhasil diaktifkan. Anda akan mendapat pesan baru di sini.',
            null
        );
    } else if (permission === 'denied') {
        if (banner) banner.classList.add('hide');
        showToast("Notifikasi ditolak. Aktifkan manual di ikon kunci di address bar.", "error");
    }
}

function _sendBrowserNotification(title, body, groupId) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
        const notif = new Notification(title, {
            body,
            icon: 'wdbos_icon.png',
            badge: 'wdbos_icon.png',
            tag: groupId ? `chat-${groupId}` : `chat-system`,
            renotify: !!groupId,
            silent: false,
            requireInteraction: false,
        });

        if (groupId) {
            notif.onclick = () => {
                window.focus();
                const chatNavBtn = document.querySelector('.nav-item-main[data-target="chatView"]');
                if (chatNavBtn) chatNavBtn.click();
                setTimeout(() => {
                    const type = chatState.groups.find(g => g.id === groupId) ? 'group' : 'dm';
                    openConversation(groupId, type);
                }, 300);
                notif.close();
            };
        }

        setTimeout(() => notif.close(), 6000);
    } catch (e) {
        console.warn('Browser notification failed:', e);
    }
}

function sendChatNotification(senderName, messageText, convName, groupId) {
    const preview = messageText.length > 80 ? messageText.slice(0, 80) + '…' : messageText;

    // 1. In-app toast (selalu tampil)
    showChatToast(senderName, preview, convName, groupId);

    // 2. OS Browser notification (hanya jika tab tidak fokus ATAU konv lain)
    const tabActive = document.visibilityState === 'visible';
    const convActive = groupId === chatState.activeConvId;

    if (!tabActive || !convActive) {
        _sendBrowserNotification(
            `💬 ${senderName}`,
            `${convName}: ${preview}`,
            groupId
        );
    }
}

function showChatToast(senderName, messageText, convName, groupId) {
    // Buat elemen toast khusus chat (lebih kaya dari showToast biasa)
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'chat-notif-toast';
    toast.innerHTML = `
        <div class="chat-notif-avatar">${senderName.slice(0,2).toUpperCase()}</div>
        <div class="chat-notif-content">
            <div class="chat-notif-sender">${escHtml(senderName)}<span class="chat-notif-group"> · ${escHtml(convName)}</span></div>
            <div class="chat-notif-msg">${escHtml(messageText)}</div>
        </div>
        <button class="chat-notif-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
    `;

    // Klik toast → buka konversasi
    toast.addEventListener('click', (e) => {
        if (e.target.closest('.chat-notif-close')) return;
        const chatNavBtn = document.querySelector('.nav-item-main[data-target="chatView"]');
        if (chatNavBtn) chatNavBtn.click();
        setTimeout(() => {
            const type = chatState.groups.find(g => g.id === groupId) ? 'group' : 'dm';
            openConversation(groupId, type);
        }, 300);
        toast.remove();
    });

    container.appendChild(toast);

    // Auto-dismiss setelah 5 detik
    setTimeout(() => {
        toast.classList.add('chat-notif-toast-out');
        setTimeout(() => toast.remove(), 400);
    }, 5000);
}

function getChatLastReadStorageKey() {
    const userId = chatState.myUser?.id || window.state?.currentStaff?.id || 'guest';
    return `chat_lastReadAt_${userId}`;
}

function loadChatLastReadAt() {
    try {
        const key = getChatLastReadStorageKey();
        chatState.lastReadAt = JSON.parse(localStorage.getItem(key) || '{}');
    } catch (e) {
        chatState.lastReadAt = {};
    }
}

function saveChatLastReadAt() {
    try {
        const key = getChatLastReadStorageKey();
        localStorage.setItem(key, JSON.stringify(chatState.lastReadAt));
    } catch (e) {}
}

function markConvAsRead(groupId) {
    if (!groupId) return;

    // Delete unread count for this conversation immediately
    if (chatState.unreadCounts[groupId] !== undefined) {
        delete chatState.unreadCounts[groupId];
        updateChatUnreadBadge();
    }

    // Set lastReadAt timestamp with 5 seconds future buffer to prevent DB microsecond time skew
    let nowBuffer = new Date(Date.now() + 5000).toISOString();

    if (Array.isArray(chatState.messages) && chatState.messages.length > 0) {
        const timestamps = chatState.messages
            .filter(m => m.group_id === groupId && m.created_at)
            .map(m => new Date(m.created_at).getTime())
            .filter(t => !isNaN(t));

        if (timestamps.length > 0) {
            const maxTime = Math.max(...timestamps) + 5000;
            if (maxTime > new Date(nowBuffer).getTime()) {
                nowBuffer = new Date(maxTime).toISOString();
            }
        }

        // Mark seen_by for messages in this active conversation
        const myId = chatState.myUser?.id;
        if (myId) {
            chatState.messages.forEach(msg => {
                if (msg.group_id === groupId && msg.sender_id !== myId) {
                    markMessageSeen(msg);
                }
            });
        }
    }

    chatState.lastReadAt[groupId] = nowBuffer;
    saveChatLastReadAt();
}

async function recalculateAllUnread() {
    const allConvs = [...chatState.groups, ...chatState.dms];
    chatState.unreadCounts = {};

    for (const conv of allConvs) {
        // If this conversation is currently open and active, keep unread at 0
        if (conv.id === chatState.activeConvId) {
            delete chatState.unreadCounts[conv.id];
            continue;
        }

        const lastRead = chatState.lastReadAt[conv.id];
        if (!lastRead) {
            const { count } = await supabaseClient
                .from('chat_messages')
                .select('id', { count: 'exact', head: true })
                .eq('group_id', conv.id)
                .neq('sender_id', chatState.myUser?.id || '');
            if (count > 0) chatState.unreadCounts[conv.id] = count;
        } else {
            const { count } = await supabaseClient
                .from('chat_messages')
                .select('id', { count: 'exact', head: true })
                .eq('group_id', conv.id)
                .gt('created_at', lastRead)
                .neq('sender_id', chatState.myUser?.id || '');
            if (count > 0) chatState.unreadCounts[conv.id] = count;
        }
    }

    if (chatState.activeConvId) {
        delete chatState.unreadCounts[chatState.activeConvId];
    }
}

function updateDocumentTitle(unreadTotal) {
    const base = 'WB Team — Dashboard';
    document.title = base;
}

// ----------------------------------------------------------------
// PIN / UNPIN CONVERSATION
// ----------------------------------------------------------------
function togglePinConv(convId) {
    if (chatState.pinnedConvs.has(convId)) {
        chatState.pinnedConvs.delete(convId);
        showToast("Percakapan dilepas dari sematkan.", "info");
    } else {
        chatState.pinnedConvs.add(convId);
        showToast("Percakapan disematkan di atas.", "success");
    }
    // Persist ke localStorage
    localStorage.setItem('chat_pinned', JSON.stringify([...chatState.pinnedConvs]));
    renderChatSidebar();
}

async function deleteConversation(convId) {
    if (!convId || !supabaseClient) return;

    const conv = [...chatState.groups, ...chatState.dms].find(c => c.id === convId);
    const isDM = conv ? conv.is_dm : true;
    const label = isDM ? `chat Direct "${conv?.name || 'Staff'}"` : `grup "${conv?.name || 'Grup'}"`;

    const confirmMsg = `Apakah Anda yakin ingin menghapus seluruh riwayat ${label}? Seluruh pesan di dalamnya akan terhapus secara permanen.`;
    const isConfirmed = typeof window.showCustomConfirm === 'function'
        ? await window.showCustomConfirm(confirmMsg, isDM ? "Hapus Chat Direct" : "Hapus Grup Chat", true)
        : confirm(confirmMsg);

    if (!isConfirmed) return;

    try {
        // 1. Hapus semua pesan di tabel chat_messages
        await supabaseClient.from('chat_messages').delete().eq('group_id', convId);

        // 2. Hapus anggota di chat_group_members
        await supabaseClient.from('chat_group_members').delete().eq('group_id', convId);

        // 3. Hapus grup/DM di chat_groups
        await supabaseClient.from('chat_groups').delete().eq('id', convId);

        // 4. Bersihkan state lokal
        chatState.groups = chatState.groups.filter(g => g.id !== convId);
        chatState.dms = chatState.dms.filter(d => d.id !== convId);
        delete chatState.unreadCounts[convId];
        delete chatState.lastReadAt[convId];
        chatState.pinnedConvs.delete(convId);
        saveChatLastReadAt();

        // 5. Jika sedang membuka conversation yang dihapus, reset UI
        if (chatState.activeConvId === convId) {
            chatState.activeConvId = null;
            chatState.activeConvType = null;
            chatState.messages = [];
            const convEl = document.getElementById('chatConversation');
            const emptyEl = document.getElementById('chatEmptyState');
            if (convEl) convEl.classList.add('hide');
            if (emptyEl) emptyEl.classList.remove('hide');
        }

        renderChatSidebar();
        updateChatUnreadBadge();
        showToast(`Berhasil menghapus ${label}.`, 'success');
    } catch (err) {
        console.error('Gagal menghapus percakapan:', err);
        showToast('Gagal menghapus percakapan: ' + err.message, 'error');
    }
}

function confirmDeleteActiveConv() {
    if (chatState.activeConvId) {
        deleteConversation(chatState.activeConvId);
    } else {
        showToast('Pilih percakapan terlebih dahulu.', 'info');
    }
}

function openConvContextMenu(e, convId, type) {
    e.stopPropagation();
    // Hapus context menu lama
    document.querySelectorAll('.chat-context-menu').forEach(m => m.remove());

    const isPinned = chatState.pinnedConvs.has(convId);
    const conv = [...chatState.groups, ...chatState.dms].find(c => c.id === convId);
    const isDM = conv ? conv.is_dm : (type === 'dm');

    const menu = document.createElement('div');
    menu.className = 'chat-context-menu';
    menu.innerHTML = `
        <button onclick="togglePinConv('${convId}'); this.closest('.chat-context-menu').remove();">
            <i class="fa-solid fa-thumbtack"></i>
            ${isPinned ? 'Lepas Sematkan' : 'Sematkan'}
        </button>
        <button onclick="markConvAsRead('${convId}'); renderChatSidebar(); this.closest('.chat-context-menu').remove();">
            <i class="fa-solid fa-check-double"></i>
            Tandai Sudah Dibaca
        </button>
        <button onclick="openConversation('${convId}','${type}'); this.closest('.chat-context-menu').remove();">
            <i class="fa-solid fa-comment"></i>
            Buka Chat
        </button>
        <button class="danger-btn" onclick="deleteConversation('${convId}'); this.closest('.chat-context-menu').remove();">
            <i class="fa-solid fa-trash-can"></i>
            Hapus ${isDM ? 'Chat Direct' : 'Grup'}
        </button>
    `;

    // Posisikan menu dekat tombol
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    menu.style.top  = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;

    document.body.appendChild(menu);

    // Tutup saat klik di luar
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 10);
}

// ----------------------------------------------------------------
// UTILITIES
// ----------------------------------------------------------------
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Expose globals for HTML onclick handlers
window.openCreateGroupModal = openCreateGroupModal;
window.openNewDmModal = openNewDmModal;
window.openChangeAvatarModal = openChangeAvatarModal;
window.filterGroupMemberList = filterGroupMemberList;
window.filterDmStaffList = filterDmStaffList;
window.addGroupMember = addGroupMember;
window.removeGroupMember = removeGroupMember;
window.submitCreateGroup = submitCreateGroup;
window.startDmWith = startDmWith;
window.sendChatMessage = sendChatMessage;
window.handleChatInputKeydown = handleChatInputKeydown;
window.autoResizeChatInput = autoResizeChatInput;
window.handleChatInputMention = handleChatInputMention;
window.selectMentionStaff = selectMentionStaff;
window.closeChatMentionDropdown = closeChatMentionDropdown;
window.handleChatImageSelect = handleChatImageSelect;
window.clearImageAttachment = clearImageAttachment;
window.openImageLightbox = openImageLightbox;
window.handleAvatarFileSelect = handleAvatarFileSelect;
window.submitAvatarChange = submitAvatarChange;
window.toggleConvInfo = toggleConvInfo;
window.switchChatTab = switchChatTab;
// Add member modal
window.openAddMemberModal = openAddMemberModal;
window.renderAddMemberList = renderAddMemberList;
window.selectAddMember = selectAddMember;
window.deselectAddMember = deselectAddMember;
window.submitAddMembers = submitAddMembers;
window.requestNotificationPermission = requestNotificationPermission;
window.enableChatNotifications = enableChatNotifications;
// Message actions
window.startReply = startReply;
window.cancelReply = cancelReply;
window.scrollToMessage = scrollToMessage;
window.togglePinMessage = togglePinMessage;
window.deleteMessage = deleteMessage;
// Pin conversation
window.togglePinConv = togglePinConv;
window.openConvContextMenu = openConvContextMenu;
window.deleteConversation = deleteConversation;
window.confirmDeleteActiveConv = confirmDeleteActiveConv;
window.togglePinConv = togglePinConv;
window.openConvContextMenu = openConvContextMenu;
