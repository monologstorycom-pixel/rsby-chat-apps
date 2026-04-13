const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = 4000;

// RAM STORAGE (Menguap setelah 24 jam atau server restart)
let users = {};         
let publicHistory = []; 

app.use(express.static('public'));

io.on('connection', (socket) => {
    
    socket.on('join', (username) => {
        users[socket.id] = { username, socketId: socket.id };
        // Kirim history yang tersisa di RAM ke user yang baru join/refresh
        socket.emit('load history', publicHistory);
        io.emit('update users', Object.values(users));
        console.log(`User Join: ${username}`);
    });

    socket.on('send message', (payload) => {
        const msg = {
            id: Date.now(),
            sender: users[socket.id].username,
            fromSocketId: socket.id,
            ...payload, // type, content, isPrivate, to
            timestamp: new Date()
        };

        if (payload.isPrivate) {
            // Jalur Private (N-to-N)
            socket.to(payload.to).emit('receive message', msg);
            socket.emit('receive message', msg); 
        } else {
            // Jalur Public (Lobby)
            publicHistory.push(msg);
            io.emit('receive message', msg);

            // TIMER 24 JAM: Hapus pesan dari RAM
            setTimeout(() => {
                publicHistory = publicHistory.filter(m => m.id !== msg.id);
            }, 24 * 60 * 60 * 1000);
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