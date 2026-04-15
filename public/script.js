const socket = io();
const body = document.body;
const messagesContainer = document.getElementById('messages');
const messagesWrapper = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const replyPreview = document.getElementById('reply-preview');

let myName = "";
let mySocketId = "";
let currentTarget = "lobby";
let replyingTo = null;
let typingTimer = null;
let isTyping = false;

const EMOJIS = [
    '😀','😂','🤣','😍','🥰','😎','🤔','😅','😭','😱',
    '👍','👎','❤️','🔥','✨','🎉','👏','🙏','💪','😏',
    '😒','🤦','🤷','😜','😬','🥳','😴','🤩','😡','😢',
    '🐶','🐱','🍕','🍔','☕','🎮','🏆','💯','✅','❌'
];

// Format timestamp -> "HH:MM"
function formatTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d)) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return h + ':' + m;
}

// Escape HTML - mencegah XSS
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =====================================================
// PUSH NOTIFICATION SETUP
// =====================================================
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

async function setupPushNotification(socketId) {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        const reg = await navigator.serviceWorker.ready;
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        const res = await fetch('/vapid-public-key');
        const { key } = await res.json();
        if (!key || key.startsWith('GANTI')) return;
        let subscription = await reg.pushManager.getSubscription();
        if (!subscription) {
            subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key)
            });
        }
        await fetch('/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ socketId, subscription })
        });
    } catch (err) {
        console.warn('Push setup gagal:', err.message);
    }
}

// =====================================================
// SESSION & PWA
// =====================================================
window.onload = () => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
    const saved = localStorage.getItem('rsby_tg_session_v4');
    if (saved) {
        try {
            const session = JSON.parse(saved);
            if (new Date().getTime() - session.time < 24 * 60 * 60 * 1000) {
                myName = session.name;
                startApp();
            }
        } catch(e) { localStorage.removeItem('rsby_tg_session_v4'); }
    }
};

document.getElementById('btn-join').onclick = () => {
    const val = document.getElementById('username-input').value.trim();
    if (val) {
        myName = val;
        localStorage.setItem('rsby_tg_session_v4', JSON.stringify({ name: val, time: new Date().getTime() }));
        startApp();
    }
};

function startApp() {
    socket.emit('join', myName);
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('chat-screen').classList.remove('hidden');
    buildEmojiPicker();
    buildStickerPicker();
}

socket.on('connect', () => {
    mySocketId = socket.id;
    setupPushNotification(socket.id);
    // Re-join jika reconnect
    if (myName) socket.emit('join', myName);
});

// =====================================================
// EMOJI PICKER
// =====================================================
function buildEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.innerHTML = '';
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.onclick = () => {
            messageInput.value += emoji;
            messageInput.focus();
            picker.classList.add('hidden');
        };
        picker.appendChild(btn);
    });
}

document.getElementById('btn-emoji').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('sticker-picker').classList.add('hidden');
    document.getElementById('emoji-picker').classList.toggle('hidden');
};

document.addEventListener('click', () => {
    document.getElementById('emoji-picker').classList.add('hidden');
    document.getElementById('sticker-picker').classList.add('hidden');
});

document.getElementById('emoji-picker').onclick = (e) => e.stopPropagation();

// =====================================================
// STICKER PICKER
// =====================================================
const STICKERS = {
    '🐱 Kucing': [
        'https://em-content.zobj.net/source/animated-noto-emoji/356/cat-face_1f431.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/crying-cat_1f63f.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/cat-with-tears-of-joy_1f639.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/smiling-cat-with-heart-eyes_1f63b.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/pouting-cat_1f63e.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/weary-cat_1f640.gif',
    ],
    '😂 Ngakak': [
        'https://em-content.zobj.net/source/animated-noto-emoji/356/rolling-on-the-floor-laughing_1f923.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/face-with-tears-of-joy_1f602.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/smiling-face-with-open-mouth_1f603.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/beaming-face-with-smiling-eyes_1f601.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/winking-face_1f609.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/squinting-face-with-tongue_1f61d.gif',
    ],
    '❤️ Cinta': [
        'https://em-content.zobj.net/source/animated-noto-emoji/356/red-heart_2764-fe0f.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/sparkling-heart_1f496.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/heart-with-arrow_1f498.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/growing-heart_1f497.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/revolving-hearts_1f49e.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/smiling-face-with-hearts_1f970.gif',
    ],
    '👋 Salam': [
        'https://em-content.zobj.net/source/animated-noto-emoji/356/waving-hand_1f44b.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/thumbs-up_1f44d.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/clapping-hands_1f44f.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/folded-hands_1f64f.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/flexed-biceps_1f4aa.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/ok-hand_1f44c.gif',
    ],
    '🔥 Hype': [
        'https://em-content.zobj.net/source/animated-noto-emoji/356/fire_1f525.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/party-popper_1f389.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/trophy_1f3c6.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/rocket_1f680.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/star-struck_1f929.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/hundred-points_1f4af.gif',
    ],
    '😢 Sedih': [
        'https://em-content.zobj.net/source/animated-noto-emoji/356/crying-face_1f622.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/loudly-crying-face_1f62d.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/pleading-face_1f97a.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/disappointed-face_1f61e.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/worried-face_1f61f.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/pensive-face_1f614.gif',
    ],
    '😡 Marah': [
        'https://em-content.zobj.net/source/animated-noto-emoji/356/pouting-face_1f621.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/angry-face_1f620.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/face-with-symbols-on-mouth_1f92c.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/hot-face_1f975.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/exploding-head_1f92f.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/skull_1f480.gif',
    ],
    '🎵 Musik': [
        'https://em-content.zobj.net/source/animated-noto-emoji/356/musical-notes_1f3b5.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/microphone_1f3a4.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/headphone_1f3a7.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/guitar_1f3b8.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/drum_1f941.gif',
        'https://em-content.zobj.net/source/animated-noto-emoji/356/saxophone_1f3b7.gif',
    ],
};

function buildStickerPicker() {
    const tabs = document.getElementById('sticker-tabs');
    const packNames = Object.keys(STICKERS);
    tabs.innerHTML = '';
    packNames.forEach((pack, i) => {
        const btn = document.createElement('button');
        btn.className = 'sticker-tab' + (i === 0 ? ' active' : '');
        btn.textContent = pack;
        btn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.sticker-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            renderStickerGrid(pack);
        };
        tabs.appendChild(btn);
    });
    renderStickerGrid(packNames[0]);
}

function renderStickerGrid(pack) {
    const grid = document.getElementById('sticker-grid');
    grid.innerHTML = '';
    STICKERS[pack].forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'sticker-item';
        img.loading = 'lazy';
        img.onerror = () => { img.style.opacity = '0.3'; };
        img.onclick = (e) => {
            e.stopPropagation();
            sendSticker(url);
            document.getElementById('sticker-picker').classList.add('hidden');
        };
        grid.appendChild(img);
    });
}

document.getElementById('btn-sticker').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('emoji-picker').classList.add('hidden');
    document.getElementById('sticker-picker').classList.toggle('hidden');
};

document.getElementById('sticker-picker').onclick = (e) => e.stopPropagation();

function sendSticker(url) {
    socket.emit('send message', {
        type: 'sticker',
        content: url,
        replyTo: replyingTo,
        isPrivate: currentTarget !== 'lobby',
        to: currentTarget
    });
    replyingTo = null;
    replyPreview.classList.add('hidden');
}

// =====================================================
// REPLY
// =====================================================
function setReply(sender, content) {
    replyingTo = { sender, content };
    document.getElementById('reply-name').innerText = sender;
    document.getElementById('reply-text').innerText = content;
    replyPreview.classList.remove('hidden');
    messageInput.focus();
}

document.getElementById('btn-cancel-reply').onclick = () => {
    replyingTo = null;
    replyPreview.classList.add('hidden');
};

// =====================================================
// NAVIGATION
// =====================================================
socket.on('update users', (users) => {
    const list = document.getElementById('user-list');
    list.innerHTML = `<li class="user-item ${currentTarget === 'lobby' ? 'active' : ''}" onclick="switchChat('lobby', 'Lobby Group')">
        <div class="user-avatar">LB</div>
        <span>Lobby Group</span>
    </li>`;
    users.forEach(u => {
        if (u.username !== myName) {
            const initials = u.username.slice(0, 2).toUpperCase();
            list.innerHTML += `<li class="user-item ${currentTarget === u.socketId ? 'active' : ''}" onclick="switchChat('${escapeHtml(u.socketId)}', '${escapeHtml(u.username)}')">
                <div class="user-avatar">${escapeHtml(initials)}</div>
                <span>👤 ${escapeHtml(u.username)}</span>
            </li>`;
        }
    });
});

window.switchChat = (id, name) => {
    currentTarget = id;
    document.getElementById('target-name').innerText = name;
    messagesContainer.innerHTML = "";
    // Clear typing indicator saat pindah chat
    document.getElementById('typing-status').textContent = '';
    // Hanya emit join sekali saat ganti ke lobby dari private
    body.classList.add('chat-open');
    document.getElementById('emoji-picker').classList.add('hidden');
    document.getElementById('sticker-picker').classList.add('hidden');
};

document.getElementById('btn-back').onclick = () => body.classList.remove('chat-open');

// =====================================================
// TYPING INDICATOR
// =====================================================
messageInput.addEventListener('input', () => {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', { to: currentTarget, isPrivate: currentTarget !== 'lobby' });
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        isTyping = false;
        socket.emit('stop typing', { to: currentTarget, isPrivate: currentTarget !== 'lobby' });
    }, 1500);
});

socket.on('user typing', ({ username, to }) => {
    if (to === currentTarget || (to === 'lobby' && currentTarget === 'lobby')) {
        document.getElementById('typing-status').textContent = `${username} sedang mengetik...`;
    }
});

socket.on('user stop typing', ({ to }) => {
    if (to === currentTarget || (to === 'lobby' && currentTarget === 'lobby')) {
        document.getElementById('typing-status').textContent = '';
    }
});

// =====================================================
// SEND MESSAGE
// =====================================================
function send() {
    const val = messageInput.value.trim();
    if (!val) return;

    isTyping = false;
    clearTimeout(typingTimer);
    socket.emit('stop typing', { to: currentTarget, isPrivate: currentTarget !== 'lobby' });

    socket.emit('send message', {
        type: 'text',
        content: val,
        replyTo: replyingTo,
        isPrivate: currentTarget !== 'lobby',
        to: currentTarget
    });
    messageInput.value = "";
    replyingTo = null;
    replyPreview.classList.add('hidden');
}

document.getElementById('btn-send').onclick = send;
messageInput.onkeypress = (e) => { if (e.key === 'Enter') send(); };

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Batas ukuran file 5MB
    if (file.size > 5 * 1024 * 1024) {
        alert('Ukuran gambar maksimal 5MB');
        fileInput.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
        socket.emit('send message', {
            type: 'image',
            content: ev.target.result,
            isPrivate: currentTarget !== 'lobby',
            to: currentTarget
        });
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
};

// =====================================================
// RECEIVE MESSAGE
// =====================================================
socket.on('load history', (history) => {
    if (currentTarget === 'lobby') {
        messagesContainer.innerHTML = "";
        history.forEach(m => appendMsg(m));
        scrollToBottom();
        history.forEach(m => {
            if (m.sender !== myName && !m.readBy?.includes(socket.id)) {
                socket.emit('mark read', { msgId: m.id, fromSocketId: m.fromSocketId });
            }
        });
    }
});

socket.on('receive message', (msg) => {
    const isLobbyMsg = !msg.isPrivate && currentTarget === 'lobby';
    const isPrivateMsg = msg.isPrivate && (
        msg.fromSocketId === currentTarget ||
        msg.sender === myName ||
        msg.to === socket.id
    );

    if (isLobbyMsg || isPrivateMsg) {
        appendMsg(msg);
        scrollToBottom();
        if (msg.sender !== myName) {
            socket.emit('mark read', { msgId: msg.id, fromSocketId: msg.fromSocketId });
        }
    }
});

socket.on('message read', ({ msgId }) => {
    const el = document.querySelector(`.message[data-id="${msgId}"] .read-receipt`);
    if (el) {
        el.textContent = '✓✓';
        el.classList.add('read');
    }
});

function scrollToBottom() {
    messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
}

// =====================================================
// LIGHTBOX
// =====================================================
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');

window.openLightbox = (src) => {
    lightboxImg.src = src;
    lightbox.classList.add('show');
    history.pushState({ lightbox: true }, '');
};

document.getElementById('lightbox-close').onclick = () => {
    lightbox.classList.remove('show');
    lightboxImg.src = '';
};

lightbox.onclick = (e) => {
    if (e.target === lightbox) {
        lightbox.classList.remove('show');
        lightboxImg.src = '';
    }
};

document.getElementById('lightbox-download').onclick = () => {
    const a = document.createElement('a');
    a.href = lightboxImg.src;
    a.download = 'foto-rsby-' + Date.now() + '.jpg';
    a.click();
};

window.addEventListener('popstate', () => {
    if (lightbox.classList.contains('show')) {
        lightbox.classList.remove('show');
        lightboxImg.src = '';
    }
});

// =====================================================
// RENDER MESSAGE
// =====================================================
function appendMsg(msg) {
    const isMe = msg.sender === myName;
    const div = document.createElement('div');
    div.className = `message ${isMe ? 'me' : 'others'}`;
    div.setAttribute('data-id', msg.id);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    // Reply handler pakai data attribute, bukan inline onclick string (aman dari XSS)
    bubble.addEventListener('click', () => {
        const preview = msg.type === 'text' ? msg.content : msg.type === 'sticker' ? '🎭 Stiker' : '📷 Foto';
        setReply(msg.sender, preview);
    });

    // Nama pengirim
    const nameEl = document.createElement('small');
    nameEl.textContent = msg.sender;
    bubble.appendChild(nameEl);

    // Reply quote
    if (msg.replyTo) {
        const quote = document.createElement('div');
        quote.className = 'reply-quote';
        const quoteStrong = document.createElement('strong');
        quoteStrong.textContent = msg.replyTo.sender;
        const quoteText = document.createElement('span');
        quoteText.textContent = msg.replyTo.content;
        quote.appendChild(quoteStrong);
        quote.appendChild(quoteText);
        bubble.appendChild(quote);
    }

    // Konten pesan
    if (msg.type === 'text') {
        const p = document.createElement('p');
        p.textContent = msg.content;
        bubble.appendChild(p);
    } else if (msg.type === 'sticker') {
        const img = document.createElement('img');
        img.src = msg.content;
        img.className = 'sticker-msg';
        img.addEventListener('click', e => e.stopPropagation());
        bubble.appendChild(img);
    } else if (msg.type === 'image') {
        const img = document.createElement('img');
        img.src = msg.content;
        img.className = 'chat-img';
        img.addEventListener('click', e => { e.stopPropagation(); openLightbox(img.src); });
        bubble.appendChild(img);
    }

    // Baris bawah: waktu + read receipt
    const metaRow = document.createElement('div');
    metaRow.className = 'msg-meta';

    const timeEl = document.createElement('span');
    timeEl.className = 'msg-time';
    timeEl.textContent = formatTime(msg.timestamp);
    metaRow.appendChild(timeEl);

    if (isMe) {
        const isRead = msg.readBy && msg.readBy.length > 1;
        const receipt = document.createElement('span');
        receipt.className = 'read-receipt' + (isRead ? ' read' : '');
        receipt.textContent = isRead ? '✓✓' : '✓';
        metaRow.appendChild(receipt);
    }

    bubble.appendChild(metaRow);
    div.appendChild(bubble);
    messagesContainer.appendChild(div);
}