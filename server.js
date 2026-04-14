const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

const PORT = 4000;

// =====================================================
// VAPID KEYS - Generate sekali pakai dengan command:
// node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k,null,2))"
// Lalu isi di sini atau pakai environment variable
// =====================================================
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || 'BFTPQUGMDzZ_5pqdNUJDZtbl_O0q1Qmjy3-unScRa_fleLT5cTOSf6AKzg5nlvWeY788_9UWnfb4pfJrF0eOF-M';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'JEin9EC9Uhfy-N9h644lLFI_A6QJ5-utXexVyq7_8l8';

webpush.setVapidDetails('mailto:admin@rsby.chat', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

let users = {};
let pushSubscriptions = {}; // socketId -> push subscription
let publicHistory = [];

app.use(express.static('public'));
app.use(express.json());

// Client daftar push subscription
app.post('/subscribe', (req, res) => {
    const { socketId, subscription } = req.body;
    if (socketId && subscription) pushSubscriptions[socketId] = subscription;
    res.json({ ok: true });
});

// Kirim VAPID public key ke client
app.get('/vapid-public-key', (req, res) => {
    res.json({ key: VAPID_PUBLIC_KEY });
});

async function pushTo(socketId, payload) {
    const sub = pushSubscriptions[socketId];
    if (!sub) return;
    try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
            delete pushSubscriptions[socketId];
        }
    }
}

io.on('connection', (socket) => {

    socket.on('join', (username) => {
        users[socket.id] = { username, socketId: socket.id };
        socket.emit('load history', publicHistory);
        io.emit('update users', Object.values(users));
        console.log(`User Join: ${username}`);
    });

    socket.on('send message', async (payload) => {
        const senderName = users[socket.id]?.username;
        const msg = {
            id: Date.now(),
            sender: senderName,
            fromSocketId: socket.id,
            ...payload,
            timestamp: new Date(),
            readBy: [socket.id]
        };

        const notif = {
            title: `💬 ${senderName}`,
            body: payload.type === 'text' ? payload.content : '📷 Mengirim foto',
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
            await Promise.all(targets.map(sid => pushTo(sid, { ...notif, title: `💬 Lobby · ${senderName}` })));
            setTimeout(() => {
                publicHistory = publicHistory.filter(m => m.id !== msg.id);
            }, 24 * 60 * 60 * 1000);
        }
    });

    socket.on('mark read', ({ msgId, fromSocketId }) => {
        const msg = publicHistory.find(m => m.id === msgId);
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
        if (users[socket.id]) {
            delete users[socket.id];
            delete pushSubscriptions[socket.id];
            io.emit('update users', Object.values(users));
        }
    });
});

http.listen(PORT, () => {
    console.log(`RSBY Chat Engine: http://localhost:${PORT}`);
});