const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = 4000;

let users = {};
let publicHistory = [];

app.use(express.static('public'));

io.on('connection', (socket) => {

    socket.on('join', (username) => {
        users[socket.id] = { username, socketId: socket.id, online: true };
        socket.emit('load history', publicHistory);
        io.emit('update users', Object.values(users));
        console.log(`User Join: ${username}`);
    });

    socket.on('send message', (payload) => {
        const msg = {
            id: Date.now(),
            sender: users[socket.id]?.username,
            fromSocketId: socket.id,
            ...payload,
            timestamp: new Date(),
            readBy: [socket.id]
        };

        if (payload.isPrivate) {
            socket.to(payload.to).emit('receive message', msg);
            socket.emit('receive message', msg);
        } else {
            publicHistory.push(msg);
            io.emit('receive message', msg);

            setTimeout(() => {
                publicHistory = publicHistory.filter(m => m.id !== msg.id);
            }, 24 * 60 * 60 * 1000);
        }
    });

    // Read receipt: client kasih tau server pesan mana yang sudah dibaca
    socket.on('mark read', ({ msgId, fromSocketId }) => {
        const msg = publicHistory.find(m => m.id === msgId);
        if (msg && !msg.readBy.includes(socket.id)) {
            msg.readBy.push(socket.id);
        }
        // Kasih tau pengirim asli bahwa pesannya sudah dibaca
        socket.to(fromSocketId).emit('message read', { msgId, bySocketId: socket.id });
    });

    // Typing indicator
    socket.on('typing', ({ to, isPrivate }) => {
        const username = users[socket.id]?.username;
        if (!username) return;
        if (isPrivate) {
            socket.to(to).emit('user typing', { username, to: socket.id });
        } else {
            socket.broadcast.emit('user typing', { username, to: 'lobby' });
        }
    });

    socket.on('stop typing', ({ to, isPrivate }) => {
        if (isPrivate) {
            socket.to(to).emit('user stop typing', { to: socket.id });
        } else {
            socket.broadcast.emit('user stop typing', { to: 'lobby' });
        }
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            delete users[socket.id];
            io.emit('update users', Object.values(users));
        }
    });
});

http.listen(PORT, () => {
    console.log(`RSBY Chat Engine: http://localhost:${PORT}`);
});