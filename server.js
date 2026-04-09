const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 💡 public 폴더 안의 파일들(client.js 등)을 읽을 수 있도록 권한 부여
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./chat.db', (err) => {
  if (err) console.error(err.message);
  console.log('데이터베이스 연결 완료');
});

db.run(`CREATE TABLE IF NOT EXISTS messages_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT,
  content TEXT,
  short_ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 기본 주소 접속 시 public 폴더의 index.html 제공
app.get('/', (req, res) => { 
  res.sendFile(path.join(__dirname, 'public', 'index.html')); 
});

const connectedUsers = {};
const ADMIN_PASSWORD = '1234asdf!'; // 관리자 비밀번호

io.on('connection', (socket) => {
  let rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  if (typeof rawIp === 'string') rawIp = rawIp.split(',')[0].trim();
  let shortIp = rawIp.includes('.') ? rawIp.split('.')[0] + '.' + rawIp.split('.')[1] + '.*.*' : "IP 숨김";

  // 이전 대화 기록 불러오기
  db.all("SELECT nickname, content as message, short_ip, created_at FROM messages_v2 ORDER BY created_at ASC", [], (err, rows) => {
    if (err) throw err;
    socket.emit('load history', rows);
  });

  socket.on('join', (data) => {
    const { nickname, password } = data;
    let isAdmin = false;

    if (nickname === 'Admin') {
      if (password === ADMIN_PASSWORD) {
        isAdmin = true;
      } else {
        socket.emit('login error', '관리자 비밀번호가 틀렸습니다.');
        return;
      }
    }

    connectedUsers[socket.id] = { nickname, shortIp, isAdmin };
    socket.emit('login success', { nickname, isAdmin });

    io.emit('update user list', Object.values(connectedUsers));
    io.emit('system message', {
      message: `${nickname}${isAdmin ? '(관리자)' : ''}님이 입장하셨습니다.`,
      userCount: Object.keys(connectedUsers).length
    });
  });

  socket.on('typing', (nickname) => {
    socket.broadcast.emit('typing', nickname);
  });

  socket.on('stop typing', (nickname) => {
    socket.broadcast.emit('stop typing', nickname);
  });

  socket.on('chat message', (data) => {
    const user = connectedUsers[socket.id];
    if (!user) return;

    const msg = data.message.trim();

    // 귓속말 처리 (/w 닉네임 내용)
    if (msg.startsWith('/w ')) {
      const parts = msg.split(' ');
      const targetNickname = parts[1];
      const whisperMsg = parts.slice(2).join(' ');
      
      const targetSocketId = Object.keys(connectedUsers).find(id => connectedUsers[id].nickname === targetNickname);
      
      if (targetSocketId) {
        io.to(targetSocketId).emit('whisper', { from: user.nickname, message: whisperMsg });
        socket.emit('whisper', { to: targetNickname, message: whisperMsg });
      } else {
        socket.emit('system message', { message: `${targetNickname}님을 찾을 수 없습니다.` });
      }
      return;
    }

    // 관리자 강퇴 처리 (/kick 닉네임)
    if (msg.startsWith('/kick ') && user.isAdmin) {
      const targetNickname = msg.split(' ')[1];
      const targetSocketId = Object.keys(connectedUsers).find(id => connectedUsers[id].nickname === targetNickname);
      
      if (targetSocketId) {
        io.to(targetSocketId).emit('force disconnect', '관리자에 의해 강퇴되었습니다.');
        io.sockets.sockets.get(targetSocketId).disconnect();
      }
      return;
    }

    // 일반 메시지 처리
    const now = new Date().toISOString(); 
    db.run(`INSERT INTO messages_v2(nickname, content, short_ip, created_at) VALUES(?, ?, ?, ?)`, [user.nickname, msg, user.shortIp, now]);
    io.emit('chat message', {
      nickname: user.nickname,
      message: msg,
      short_ip: user.shortIp,
      created_at: now,
      isAdmin: user.isAdmin
    });
  });

  socket.on('disconnect', () => {
    if (connectedUsers[socket.id]) {
      const nickname = connectedUsers[socket.id].nickname;
      delete connectedUsers[socket.id];
      io.emit('update user list', Object.values(connectedUsers));
      io.emit('system message', {
        message: `${nickname}님이 퇴장하셨습니다.`,
        userCount: Object.keys(connectedUsers).length
      });
      socket.broadcast.emit('stop typing', nickname);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 ${PORT} 포트에서 실행 중입니다.`);
});