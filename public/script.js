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

        // Ambil VAPID public key dari server
        const res = await fetch('/vapid-public-key');
        const { key } = await res.json();

        if (key.startsWith('GANTI')) {
            console.warn('VAPID key belum diset, push notif nonaktif');
            return;
        }

        // Subscribe push
        let subscription = await reg.pushManager.getSubscription();
        if (!subscription) {
            subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key)
            });
        }

        // Kirim subscription ke server
        await fetch('/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ socketId, subscription })
        });

        console.log('Push notification aktif ✓');
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
        const session = JSON.parse(saved);
        if (new Date().getTime() - session.time < 24 * 60 * 60 * 1000) {
            myName = session.name;
            startApp();
        }
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
    // Setup push setelah dapat socket id
    setupPushNotification(socket.id);
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
function buildStickerPicker() {
    const tabs = document.getElementById('sticker-tabs');
    const grid = document.getElementById('sticker-grid');
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
            list.innerHTML += `<li class="user-item ${currentTarget === u.socketId ? 'active' : ''}" onclick="switchChat('${u.socketId}', '${u.username}')">
                <div class="user-avatar">${initials}</div>
                <span>👤 ${u.username}</span>
            </li>`;
        }
    });
});

window.switchChat = (id, name) => {
    currentTarget = id;
    document.getElementById('target-name').innerText = name;
    messagesContainer.innerHTML = "";
    if (id === 'lobby') socket.emit('join', myName);
    body.classList.add('chat-open');
    document.getElementById('emoji-picker').classList.add('hidden');
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
    const reader = new FileReader();
    reader.onload = (ev) => {
        socket.emit('send message', {
            type: 'image',
            content: ev.target.result,
            isPrivate: currentTarget !== 'lobby',
            to: currentTarget
        });
    };
    reader.readAsDataURL(e.target.files[0]);
    fileInput.value = '';
};

// =====================================================
// RECEIVE MESSAGE
// =====================================================
socket.on('load history', (history) => {
    if (currentTarget === 'lobby') {
        messagesContainer.innerHTML = "";
        history.forEach(m => appendMsg(m));
        history.forEach(m => {
            if (m.sender !== myName && !m.readBy?.includes(socket.id)) {
                socket.emit('mark read', { msgId: m.id, fromSocketId: m.fromSocketId });
            }
        });
    }
});

socket.on('receive message', (msg) => {
    // Notif in-app (fallback kalau tab aktif)
    if (msg.sender !== myName && document.visibilityState === 'hidden') {
        // Push sudah ditangani server, skip Notification API supaya tidak dobel
    }

    if (currentTarget === 'lobby' && !msg.isPrivate) {
        appendMsg(msg);
        if (msg.sender !== myName) {
            socket.emit('mark read', { msgId: msg.id, fromSocketId: msg.fromSocketId });
        }
    } else if (msg.isPrivate && (msg.fromSocketId === currentTarget || msg.sender === myName || msg.to === socket.id)) {
        appendMsg(msg);
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
};

// =====================================================
// LIGHTBOX
// =====================================================
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');

window.openLightbox = (src) => {
    lightboxImg.src = src;
    lightbox.classList.add('show');
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

// Tutup lightbox dengan tombol back HP
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

    const contentEscaped = msg.type === 'text' ? escapeHtml(msg.content) : '📷 Foto';

    let html = `<div class="bubble" onclick="setReply('${escapeHtml(msg.sender)}', '${contentEscaped}')">`;
    html += `<small>${escapeHtml(msg.sender)}</small>`;

    if (msg.replyTo) {
        html += `<div class="reply-quote"><strong>${escapeHtml(msg.replyTo.sender)}</strong>${escapeHtml(msg.replyTo.content)}</div>`;
    }

    html += msg.type === 'text'
        ? `<p>${escapeHtml(msg.content)}</p>`
        : msg.type === 'sticker'
        ? `<img src="${msg.content}" class="sticker-msg" onclick="event.stopPropagation();">`
        : `<img src="${msg.content}" class="chat-img" onclick="event.stopPropagation(); openLightbox(this.src)">`;

    if (isMe) {
        const isRead = msg.readBy && msg.readBy.length > 1;
        html += `<span class="read-receipt ${isRead ? 'read' : ''}">${isRead ? '✓✓' : '✓'}</span>`;
    }

    html += `</div>`;
    div.innerHTML = html;
    messagesContainer.appendChild(div);
    messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}