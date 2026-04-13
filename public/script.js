const socket = io();
const body = document.body;
const messagesContainer = document.getElementById('messages');
const messagesWrapper = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const replyPreview = document.getElementById('reply-preview');

let myName = "";
let currentTarget = "lobby";
let replyingTo = null;

// --- 1. SESSION & PWA ---
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
}

// --- 2. REPLY LOGIC ---
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

// --- 3. NAVIGATION ---
socket.on('update users', (users) => {
    const list = document.getElementById('user-list');
    list.innerHTML = `<li class="user-item ${currentTarget === 'lobby' ? 'active' : ''}" onclick="switchChat('lobby', 'Lobby Group')">📢 Lobby Group</li>`;
    users.forEach(u => {
        if (u.username !== myName) {
            list.innerHTML += `<li class="user-item ${currentTarget === u.socketId ? 'active' : ''}" onclick="switchChat('${u.socketId}', '${u.username}')">👤 ${u.username}</li>`;
        }
    });
});

window.switchChat = (id, name) => {
    currentTarget = id;
    document.getElementById('target-name').innerText = name;
    messagesContainer.innerHTML = "";
    if (id === 'lobby') socket.emit('join', myName); 
    body.classList.add('chat-open');
};

document.getElementById('btn-back').onclick = () => body.classList.remove('chat-open');

// --- 4. MESSAGING ---
function send() {
    const val = messageInput.value.trim();
    if (!val) return;
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
messageInput.onkeypress = (e) => { if(e.key === 'Enter') send(); };

fileInput.onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
        socket.emit('send message', { type: 'image', content: ev.target.result, isPrivate: currentTarget !== 'lobby', to: currentTarget });
    };
    reader.readAsDataURL(e.target.files[0]);
};

// --- 5. RECEIVE ---
socket.on('load history', (history) => {
    if (currentTarget === 'lobby') {
        messagesContainer.innerHTML = "";
        history.forEach(m => appendMsg(m));
    }
});

socket.on('receive message', (msg) => {
    // Notification
    if (msg.sender !== myName && document.visibilityState === 'hidden' && Notification.permission === 'granted') {
        new Notification(`Pesan dari ${msg.sender}`, { body: msg.type === 'text' ? msg.content : "📷 Foto" });
    }

    if (currentTarget === 'lobby' && !msg.isPrivate) appendMsg(msg);
    else if (msg.isPrivate && (msg.fromSocketId === currentTarget || msg.sender === myName || msg.to === socket.id)) {
        appendMsg(msg);
    }
});

function appendMsg(msg) {
    const isMe = msg.sender === myName;
    const div = document.createElement('div');
    div.className = `message ${isMe ? 'me' : 'others'}`;
    
    let html = `<div class="bubble" onclick="setReply('${msg.sender}', '${msg.type === 'text' ? msg.content : '📷 Foto'}')">`;
    html += `<small>${msg.sender}</small>`;
    
    if (msg.replyTo) {
        html += `<div class="reply-quote"><strong>${msg.replyTo.sender}</strong>${msg.replyTo.content}</div>`;
    }

    html += msg.type === 'text' ? `<p>${msg.content}</p>` : `<img src="${msg.content}" class="chat-img" onclick="window.open(this.src)">`;
    html += `</div>`;
    
    div.innerHTML = html;
    messagesContainer.appendChild(div);
    messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
}