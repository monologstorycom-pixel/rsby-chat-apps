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

// --- EMOJI LIST ---
const EMOJIS = [
    '😀','😂','🤣','😍','🥰','😎','🤔','😅','😭','😱',
    '👍','👎','❤️','🔥','✨','🎉','👏','🙏','💪','😏',
    '😒','🤦','🤷','😜','😬','🥳','😴','🤩','😡','😢',
    '🐶','🐱','🍕','🍔','☕','🎮','🏆','💯','✅','❌'
];

// --- SESSION & PWA ---
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
    if (Notification.permission !== 'granted') Notification.requestPermission();
    buildEmojiPicker();
}

socket.on('connect', () => {
    mySocketId = socket.id;
});

// --- EMOJI PICKER ---
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
    document.getElementById('emoji-picker').classList.toggle('hidden');
};

document.addEventListener('click', () => {
    document.getElementById('emoji-picker').classList.add('hidden');
});

document.getElementById('emoji-picker').onclick = (e) => e.stopPropagation();

// --- REPLY LOGIC ---
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

// --- NAVIGATION ---
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

// --- TYPING INDICATOR ---
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

// --- MESSAGING ---
function send() {
    const val = messageInput.value.trim();
    if (!val) return;

    isTyping = false;
    clearTimeout(typingTimer);
    socket.emit('stop typing', { to: currentTarget, isPrivate: currentTarget !== 'lobby' });

    const payload = {
        type: 'text',
        content: val,
        replyTo: replyingTo,
        isPrivate: currentTarget !== 'lobby',
        to: currentTarget
    };
    socket.emit('send message', payload);
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

// --- RECEIVE ---
socket.on('load history', (history) => {
    if (currentTarget === 'lobby') {
        messagesContainer.innerHTML = "";
        history.forEach(m => appendMsg(m));
        // Mark semua pesan yang belum terbaca
        history.forEach(m => {
            if (m.sender !== myName && !m.readBy?.includes(socket.id)) {
                socket.emit('mark read', { msgId: m.id, fromSocketId: m.fromSocketId });
            }
        });
    }
});

socket.on('receive message', (msg) => {
    if (msg.sender !== myName && document.visibilityState === 'hidden' && Notification.permission === 'granted') {
        new Notification(`Pesan dari ${msg.sender}`, { body: msg.type === 'text' ? msg.content : '📷 Foto' });
    }

    if (currentTarget === 'lobby' && !msg.isPrivate) {
        appendMsg(msg);
        // Kalau bukan pesan sendiri, langsung mark read
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

// Update centang ketika pesan terbaca
socket.on('message read', ({ msgId }) => {
    const el = document.querySelector(`.message[data-id="${msgId}"] .read-receipt`);
    if (el) {
        el.textContent = '✓✓';
        el.classList.add('read');
    }
});

// --- APPEND MSG ---
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
        : `<img src="${msg.content}" class="chat-img" onclick="window.open(this.src)">`;

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