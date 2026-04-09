const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 사용자가 접속하면 index.html 파일을 보여줍니다.
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// 클라이언트가 Socket.IO를 통해 연결되었을 때 실행됩니다.
io.on('connection', (socket) => {
  console.log('유저가 접속했습니다.');

  // 클라이언트로부터 'chat message'라는 이벤트를 받으면 실행됩니다.
  socket.on('chat message', (msg) => {
    // 접속한 모든 사람에게 메시지를 다시 보냅니다.
    io.emit('chat message', msg);
  });

  // 사용자가 연결을 끊었을 때 실행됩니다.
  socket.on('disconnect', () => {
    console.log('유저가 퇴장했습니다.');
  });
});

// Render가 지정하는 포트가 있으면 그걸 쓰고, 없으면 3000번을 쓰라는 뜻입니다.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 ${PORT} 포트에서 실행 중입니다.`);
});