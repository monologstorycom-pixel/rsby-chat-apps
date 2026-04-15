const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

const PORT = process.env.PORT || 4000;
const MSG_TTL_MS = 5 * 60 * 60 * 1000;

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || 'BFTPQUGMDzZ_5pqdNUJDZtbl_O0q1Qmjy3-unScRa_fleLT5cTOSf6AKzg5nlvWeY788_9UWnfb4pfJrF0eOF-M';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'JEin9EC9Uhfy-N9h644lLFI_A6QJ5-utXexVyq7_8l8';

try {
    webpush.setVapidDetails('mailto:admin@rsby.chat', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
    console.warn('VAPID setup gagal:', e.message);
}

let users = {};
let pushSubscriptions = {};
let publicHistory = [];

setInterval(() => {
    const cutoff = Date.now() - MSG_TTL_MS;
    const before = publicHistory.length;
    publicHistory = publicHistory.filter(m => new Date(m.timestamp).getTime() > cutoff);
    const removed = before - publicHistory.length;
    if (removed > 0) console.log(`Cleared ${removed} expired messages`);
}, 10 * 60 * 1000);

app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

app.post('/subscribe', (req, res) => {
    const { socketId, subscription } = req.body;
    if (socketId && subscription) pushSubscriptions[socketId] = subscription;
    res.json({ ok: true });
});

app.get('/vapid-public-key', (req, res) => {
    res.json({ key: VAPID_PUBLIC_KEY });
});

async function pushTo(socketId, payload) {
    const sub = pushSubscriptions[socketId];
    if (!sub) return;
    try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) delete pushSubscriptions[socketId];
    }
}

io.on('connection', (socket) => {

    socket.on('join', (username) => {
        if (!username || typeof username !== 'string') return;
        username = username.trim().slice(0, 15);
        users[socket.id] = { username, socketId: socket.id };
        const cutoff = Date.now() - MSG_TTL_MS;
        const freshHistory = publicHistory.filter(m => new Date(m.timestamp).getTime() > cutoff);
        socket.emit('load history', freshHistory);
        io.emit('update users', Object.values(users));
        console.log('[+]', username);
    });

    socket.on('send message', async (payload) => {
        const senderUser = users[socket.id];
        if (!senderUser) return;
        const validTypes = ['text', 'image', 'sticker'];
        if (!validTypes.includes(payload.type)) return;
        if (payload.type === 'text' && payload.content.length > 2000) return;

        const msg = {
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            sender: senderUser.username,
            fromSocketId: socket.id,
            type: payload.type,
            content: payload.content,
            replyTo: payload.replyTo || null,
            isPrivate: !!payload.isPrivate,
            to: payload.to || null,
            timestamp: new Date().toISOString(),
            readBy: [socket.id]
        };

        const notif = {
            title: `💬 ${senderUser.username}`,
            body: payload.type === 'text' ? payload.content.slice(0, 80) : payload.type === 'sticker' ? '🎭 Mengirim stiker' : '📷 Mengirim foto',
            tag: `msg-${socket.id}`,
            url: '/'
        };

        if (payload.isPrivate) {
            socket.to(payload.to).emit('receive message', msg);
            socket.emit('receive message', msg);
            await pushTo(payload.to, notif);
        } else {
            publicHistory.push(msg);
            io.emit('receive message', msg);
            const targets = Object.keys(users).filter(sid => sid !== socket.id);
            await Promise.all(targets.map(sid => pushTo(sid, { ...notif, title: `💬 Lobby · ${senderUser.username}` })));
        }
    });

    socket.on('mark read', ({ msgId, fromSocketId }) => {
        if (!msgId || !fromSocketId) return;
        const msg = publicHistory.find(m => m.id == msgId);
        if (msg && !msg.readBy.includes(socket.id)) msg.readBy.push(socket.id);
        socket.to(fromSocketId).emit('message read', { msgId, bySocketId: socket.id });
    });

    socket.on('typing', ({ to, isPrivate }) => {
        const username = users[socket.id]?.username;
        if (!username) return;
        if (isPrivate) socket.to(to).emit('user typing', { username, to: socket.id });
        else socket.broadcast.emit('user typing', { username, to: 'lobby' });
    });

    socket.on('stop typing', ({ to, isPrivate }) => {
        if (isPrivate) socket.to(to).emit('user stop typing', { to: socket.id });
        else socket.broadcast.emit('user stop typing', { to: 'lobby' });
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            console.log('[-]', user.username);
            delete users[socket.id];
            delete pushSubscriptions[socket.id];
            io.emit('update users', Object.values(users));
        }
    });
});

http.listen(PORT, () => {
    console.log(`RSBY Chat: http://localhost:${PORT} | TTL: 5 jam`);
});