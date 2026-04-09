const socket = io();
let myNickname = "";
let amIAdmin = false;
let isFocused = true;
let unreadCount = 0;

// 알림음 설정 (무료 CDN 링크)
const notifySound = new Audio('https://t1.daumcdn.net/kakaotalk/public/sound/talk.mp3');

// 브라우저 탭 활성화 상태 체크
window.onfocus = () => { 
    isFocused = true; 
    unreadCount = 0; 
    document.title = "Night Chat"; // 🌙 제거
};
window.onblur = () => { 
    isFocused = false; 
};

// XSS 방지 함수 (보안)
function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

// ----------------- 로그인 처리 -----------------
document.getElementById('login-btn').addEventListener('click', joinChat);
document.getElementById('password-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') joinChat();
});
document.getElementById('nickname-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') joinChat();
});

function joinChat() {
    const nickname = document.getElementById('nickname-input').value.trim();
    const password = document.getElementById('password-input').value.trim();

    if (nickname) {
        socket.emit('join', { nickname, password });
    }
}

socket.on('login error', (msg) => {
    document.getElementById('error-msg').textContent = msg;
});

socket.on('login success', (data) => {
    myNickname = data.nickname;
    amIAdmin = data.isAdmin;
    
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('chat-input').focus();
});

// ----------------- 메시지 출력 -----------------
const messagesDiv = document.getElementById('messages');

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.classList.add('system-message');
    div.textContent = text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendMessage(data, type = 'normal') {
    const div = document.createElement('div');
    const safeMsg = escapeHtml(data.message);
    const safeNick = escapeHtml(data.nickname || '');

    if (type === 'whisper') {
        div.classList.add('msg-whisper');
        // 🤫 제거 및 텍스트 유지
        div.innerHTML = `<strong>[귓속말]</strong> ${data.from ? data.from + '님으로부터' : data.to + '님에게'}: ${safeMsg}`;
    } else {
        div.classList.add('message-row');
        if (data.nickname === myNickname) {
            div.classList.add('msg-mine');
            div.innerHTML = `<div class="message">${safeMsg}</div>`;
        } else {
            div.classList.add('msg-other');
            if (data.isAdmin) {
                div.classList.add('msg-admin');
                // 👑 제거 및 [관리자] 텍스트로 대체
                div.innerHTML = `<div class="nickname">[관리자] <strong>${safeNick}</strong></div><div class="message">${safeMsg}</div>`;
            } else {
                div.innerHTML = `<div class="nickname">${safeNick}</div><div class="message">${safeMsg}</div>`;
            }
        }
    }

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    if (!isFocused && type !== 'system') {
        notifySound.play().catch(()=>{});
        unreadCount++;
        document.title = `(${unreadCount}) 새 메시지!`;
    }
}

socket.on('load history', (rows) => {
    rows.forEach(row => appendMessage(row));
});

socket.on('chat message', data => appendMessage(data));
socket.on('whisper', data => appendMessage(data, 'whisper'));

socket.on('system message', (data) => {
    appendSystemMessage(data.message);
    if(data.userCount) {
        document.getElementById('user-count').textContent = `접속자: ${data.userCount}명`;
    }
});

socket.on('update user list', (users) => {
    const list = document.getElementById('user-list');
    list.innerHTML = users.map(u => 
        // 👑, 👤 이모지 제거 후 관리자일 경우 텍스트로 대체
        `<div class="user-item" onclick="document.getElementById('chat-input').value='/w ${u.nickname} '">
            ${u.isAdmin ? '[관리자] ' : ''}${escapeHtml(u.nickname)}
        </div>`
    ).join('');
});

socket.on('force disconnect', (msg) => {
    alert(msg);
    location.reload();
});

// ----------------- 메시지 발송 & 타이핑 인디케이터 -----------------
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const typingIndicator = document.getElementById('typing-indicator');

let typingTimer;
let isTyping = false;
let typingUsers = new Set();

function updateTypingUI() {
    if (typingUsers.size > 0) {
        const users = Array.from(typingUsers);
        typingIndicator.textContent = users.length > 2 ? `${users.length}명이 입력 중입니다...` : `${users.join(', ')}님이 입력 중입니다...`;
        typingIndicator.classList.add('show');
    } else {
        typingIndicator.classList.remove('show');
    }
}

chatInput.addEventListener('input', () => {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', myNickname);
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        isTyping = false;
        socket.emit('stop typing', myNickname);
    }, 1000);
});

socket.on('typing', (nickname) => { 
    typingUsers.add(nickname); 
    updateTypingUI(); 
});

socket.on('stop typing', (nickname) => { 
    typingUsers.delete(nickname); 
    updateTypingUI(); 
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (chatInput.value.trim()) {
        socket.emit('chat message', { message: chatInput.value });
        chatInput.value = '';
        
        isTyping = false;
        socket.emit('stop typing', myNickname);
        chatInput.focus();
    }
});