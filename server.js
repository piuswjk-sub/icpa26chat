const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new sqlite3.Database('./chat.db', (err) => {
  if (err) console.error(err.message);
  console.log('데이터베이스에 연결되었습니다.');
});

// 💡 IP를 저장할 수 있도록 새로운 테이블(messages_v2)을 만듭니다.
db.run(`CREATE TABLE IF NOT EXISTS messages_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT,
  content TEXT,
  short_ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  // 1. 접속한 유저의 IP 가져오기 (클라우드 프록시 환경 대응)
  let rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  if (typeof rawIp === 'string') rawIp = rawIp.split(',')[0].trim(); // 여러 IP가 찍힐 경우 첫 번째(실제 유저) IP만 가져옴

  // 2. IP 짧게 마스킹하기 (예: 123.45.67.89 -> 123.45.*.*)
  let shortIp = "알 수 없음";
  if (rawIp.includes('.')) {
    let parts = rawIp.split('.');
    shortIp = parts[0] + '.' + parts[1] + '.*.*';
  } else if (rawIp.includes(':')) {
    // IPv6 환경일 경우
    let parts = rawIp.split(':');
    shortIp = parts.slice(0, 3).join(':') + ':*';
  }

  // 3. 이전 기록을 가져올 때 short_ip도 함께 가져옵니다.
  db.all("SELECT nickname, content as message, short_ip, created_at FROM messages_v2 ORDER BY created_at ASC", [], (err, rows) => {
    if (err) throw err;
    socket.emit('load history', rows);
  });

  socket.on('chat message', (data) => {
    const now = new Date().toISOString(); 
    
    // DB에 IP도 함께 저장합니다.
    db.run(`INSERT INTO messages_v2(nickname, content, short_ip, created_at) VALUES(?, ?, ?, ?)`, [data.nickname, data.message, shortIp, now], function(err) {
      if (err) return console.log(err.message);
      
      // 접속자들에게 메시지와 닉네임, 시간, '짧은 IP'를 함께 보냅니다.
      io.emit('chat message', {
        nickname: data.nickname,
        message: data.message,
        short_ip: shortIp,
        created_at: now
      });
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 ${PORT} 포트에서 실행 중입니다.`);
});