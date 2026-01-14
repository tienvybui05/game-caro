// ===== DOM Elements =====
const loginScreen = document.getElementById("loginScreen");
const gameScreen = document.getElementById("gameScreen");
const nameInput = document.getElementById("nameInput");
const startBtn = document.getElementById("startBtn");
const loginError = document.getElementById("loginError");

// Player info elements
const playerNameEl = document.getElementById("playerName");
const playerNameDisplay = document.getElementById("playerNameDisplay");
const playerSymbolEl = document.getElementById("playerSymbol");
const playerSymbolDisplay = document.getElementById("playerSymbolDisplay");

const opponentNameEl = document.getElementById("opponentName");
const opponentNameDisplay = document.getElementById("opponentNameDisplay");
const opponentSymbolEl = document.getElementById("opponentSymbol");
const opponentSymbolDisplay = document.getElementById("opponentSymbolDisplay");

// Connection elements
const connDot = document.getElementById("connDot");
const connText = document.getElementById("connText");

// Game status elements
const gameStatus = document.getElementById("gameStatus");
const matchInfo = document.getElementById("matchInfo");

// Board and room elements
const board = document.getElementById("board");
const log = document.getElementById("log");
const roomInput = document.getElementById("roomInput");
const roomIdText = document.getElementById("roomIdText");
const copyRoomBtn = document.getElementById("copyRoomBtn");

// Timer elements
const timerEl = document.getElementById("timer");
const timerFillEl = document.getElementById("timerFill");

// Buttons
const quickBtn = document.getElementById("quickBtn");
const createBtn = document.getElementById("createBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const leaveBtn = document.getElementById("leaveBtn");
const leaveBtnSmall = document.getElementById("leaveBtnSmall");

// Tabs
const tabQuick = document.getElementById("tabQuick");
const tabJoin = document.getElementById("tabJoin");
const panelQuick = document.getElementById("panelQuick");
const panelJoin = document.getElementById("panelJoin");

// Overlay elements
const gameOverlay = document.getElementById("gameOverlay");
const resultIcon = document.getElementById("resultIcon");
const resultText = document.getElementById("resultText");
const overlayMessage = document.getElementById("overlayMessage");
const playAgainBtn = document.getElementById("playAgainBtn");
const findNewBtn = document.getElementById("findNewBtn");

// Chat elements
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

// Toast element
const toastEl = document.getElementById("toast");

// Stats elements
const totalGamesEl = document.getElementById("totalGames");
const winsEl = document.getElementById("wins");
const lossesEl = document.getElementById("losses");
const drawsEl = document.getElementById("draws");

// ===== State =====
let ws = null;
let playerName = "";
let mySymbol = null;
let opponentName = "Đang chờ...";
let currentRoomId = null;

let boardState = Array(9).fill(".");
let lastMoveIndex = -1;

let iWantPlayAgain = false;
let opponentWantsPlayAgain = false;
let gameEnded = false;

// Timer state
let turnTimerInterval = null;
let turnStartTime = 0;
let currentTurn = null;
const TURN_DURATION = 60;

// Game stats
let totalGames = 0;
let wins = 0;
let losses = 0;
let draws = 0;

// FIX fallback
let pendingOpponentAutoWin = null;

// ===== Utility Functions =====
function addLog(msg) {
    log.textContent += msg + "\n";
    log.scrollTop = log.scrollHeight;
}

function toast(msg, type = "ok") {
    toastEl.textContent = msg;
    toastEl.className = `toast ${type}`;
    toastEl.classList.remove("hidden");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => {
        toastEl.classList.add("fade-out");
        setTimeout(() => toastEl.classList.add("hidden"), 500);
    }, 3000);
}

function setStatus(s) {
    gameStatus.textContent = s;
}

function setMatchInfo(s) {
    matchInfo.textContent = s;
}

function setConnState(state) {
    connDot.classList.remove("on", "err");
    if (state === "on") connDot.classList.add("on");
    if (state === "err") connDot.classList.add("err");
    connText.textContent = state === "on" ? "Đã kết nối" : (state === "err" ? "Lỗi" : "Đang kết nối...");
}

function decodeName(raw) {
    if (raw == null) return raw;
    const s = String(raw).trim();
    if (!s) return s;

    const normalized = s.replace(/\+/g, "%20");
    try {
        if (normalized.includes("%")) return decodeURIComponent(normalized);
        return s;
    } catch {
        return s;
    }
}

function updateSymbolBadge() {
    playerSymbolEl.textContent = mySymbol || "?";
    playerSymbolEl.className = "player-badge";
    if (mySymbol === "X") playerSymbolEl.classList.add("x");
    if (mySymbol === "O") playerSymbolEl.classList.add("o");

    playerSymbolDisplay.textContent = mySymbol || "?";
    playerSymbolDisplay.className = "player-card-symbol";
    if (mySymbol === "X") playerSymbolDisplay.classList.add("x");
    if (mySymbol === "O") playerSymbolDisplay.classList.add("o");

    const op = mySymbol ? (mySymbol === "X" ? "O" : "X") : "?";
    opponentSymbolEl.textContent = op;
    opponentSymbolEl.className = "player-badge";
    if (op === "X") opponentSymbolEl.classList.add("x");
    if (op === "O") opponentSymbolEl.classList.add("o");

    opponentSymbolDisplay.textContent = op;
    opponentSymbolDisplay.className = "player-card-symbol";
    if (op === "X") opponentSymbolDisplay.classList.add("x");
    if (op === "O") opponentSymbolDisplay.classList.add("o");
}

function setOpponent(name) {
    opponentName = decodeName(name || "Đang chờ...") || "Đang chờ...";
    opponentNameEl.textContent = opponentName;
    opponentNameDisplay.textContent = opponentName;
}

function setRoomId(roomId) {
    currentRoomId = roomId || null;
    roomIdText.textContent = currentRoomId || "-";
    copyRoomBtn.disabled = !currentRoomId;
}

function updateStats() {
    totalGamesEl.textContent = totalGames;
    winsEl.textContent = wins;
    lossesEl.textContent = losses;
    drawsEl.textContent = draws;
}

function updateStatsFromResult(result) {
    totalGames++;
    if (result === "win") wins++;
    else if (result === "loss") losses++;
    else if (result === "draw") draws++;
    updateStats();
}

// ===== Tabs =====
function selectTab(which) {
    if (!tabQuick || !tabJoin || !panelQuick || !panelJoin) return;

    const isQuick = which === "quick";
    tabQuick.classList.toggle("active", isQuick);
    tabJoin.classList.toggle("active", !isQuick);

    panelQuick.classList.toggle("hidden", !isQuick);
    panelJoin.classList.toggle("hidden", isQuick);
}

if (tabQuick && tabJoin) {
    tabQuick.onclick = () => selectTab("quick");
    tabJoin.onclick = () => selectTab("join");
    selectTab("quick");
}

// ===== Board Functions =====
function renderBoard() {
    const cells = board.querySelectorAll(".cell");
    for (let i = 0; i < 9; i++) {
        const val = boardState[i];
        const cell = cells[i];

        cell.textContent = val === "." ? "" : val;

        cell.className = "cell";
        if (val === "X") cell.classList.add("x");
        if (val === "O") cell.classList.add("o");

        if (val === ".") cell.classList.add("empty");
        if (i === lastMoveIndex) cell.classList.add("last");

        const canPlay = ws && ws.readyState === WebSocket.OPEN
            && currentRoomId
            && !gameEnded
            && mySymbol
            && currentTurn === mySymbol
            && val === ".";

        cell.classList.toggle("disabled", !canPlay);
    }

    board.classList.remove("preview-x", "preview-o");
    const myTurn = mySymbol && currentTurn === mySymbol && !gameEnded;
    if (myTurn) {
        board.classList.add(mySymbol === "X" ? "preview-x" : "preview-o");
    }
}

// ===== Timer Functions =====
function updateTimerDisplay() {
    if (!turnStartTime || !currentTurn || !timerEl) return;

    const now = Date.now();
    const elapsed = Math.floor((now - turnStartTime) / 1000);
    const remaining = Math.max(0, TURN_DURATION - elapsed);

    // Format as MM:SS
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const myTurn = mySymbol && currentTurn === mySymbol;
    timerEl.classList.toggle("active", myTurn);
    timerEl.classList.toggle("inactive", !myTurn);
    timerEl.classList.toggle("urgent", remaining <= 10);

    if (timerFillEl) {
        const pct = Math.max(0, Math.min(100, (remaining / TURN_DURATION) * 100));
        timerFillEl.style.width = pct + "%";
    }

    if (remaining <= 0) stopTurnTimer();
}

function startTurnTimer(turn, startTimestamp) {
    stopTurnTimer();
    currentTurn = turn;
    turnStartTime = startTimestamp || Date.now();

    updateTimerDisplay();
    turnTimerInterval = setInterval(updateTimerDisplay, 250);
    renderBoard();
}

function stopTurnTimer() {
    if (turnTimerInterval) {
        clearInterval(turnTimerInterval);
        turnTimerInterval = null;
    }
}

function resetTimers() {
    stopTurnTimer();
    currentTurn = null;
    turnStartTime = 0;

    if (timerEl) {
        timerEl.textContent = "60";
        timerEl.className = "timer inactive";
    }
    if (timerFillEl) timerFillEl.style.width = "100%";
}

// ===== Overlay Functions =====
function showOverlay(icon, text) {
    resultIcon.textContent = icon;
    resultText.textContent = text;
    overlayMessage.classList.add("hidden");
    overlayMessage.className = "overlay-message hidden";

    playAgainBtn.textContent = "🔄 Chơi tiếp";
    playAgainBtn.classList.remove("waiting");

    gameOverlay.classList.remove("hidden");

    iWantPlayAgain = false;
    opponentWantsPlayAgain = false;
    gameEnded = true;

    stopTurnTimer();
    renderBoard();
}

function hideOverlay() {
    gameOverlay.classList.add("hidden");
    iWantPlayAgain = false;
    opponentWantsPlayAgain = false;
    gameEnded = false;
    renderBoard();
}

function showMessage(text, type) {
    overlayMessage.textContent = text;
    overlayMessage.className = "overlay-message " + type;
    overlayMessage.classList.remove("hidden");
}

function resetForNewGame() {
    boardState = Array(9).fill(".");
    lastMoveIndex = -1;
    renderBoard();
    hideOverlay();
    resetTimers();
}

// ===== Chat Functions =====
function addChatMessage(sender, message, isMe = false) {
    const div = document.createElement("div");
    div.className = "chat-msg " + (isMe ? "me" : "other");

    const senderSpan = document.createElement("span");
    senderSpan.className = "sender";
    senderSpan.textContent = isMe ? "Bạn" : sender;
    div.appendChild(senderSpan);

    const timeSpan = document.createElement("span");
    timeSpan.className = "time";
    timeSpan.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.appendChild(timeSpan);

    const textNode = document.createTextNode(message);
    div.appendChild(textNode);

    chatMessages.appendChild(div);

    const chatBody = chatMessages.parentElement;
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
}

function clearChat() {
    chatMessages.innerHTML = "";
}

// ===== Create Board =====
board.innerHTML = "";
for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "cell empty";
    cell.onclick = () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (!currentRoomId || gameEnded) return;
        if (!mySymbol || currentTurn !== mySymbol) return;
        if (boardState[i] !== ".") return;

        ws.send("CLICK " + i);
    };
    board.appendChild(cell);
}
renderBoard();

// ===== Event Listeners =====
playAgainBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    iWantPlayAgain = true;
    playAgainBtn.textContent = "✓ Đang chờ...";
    playAgainBtn.classList.add("waiting");

    if (opponentWantsPlayAgain) {
        ws.send("RESTART_ACCEPT");
        showMessage("🎮 Bắt đầu...", "waiting");
    } else {
        ws.send("RESTART_REQUEST");
        showMessage("⏳ Chờ đối thủ...", "waiting");
    }
    addLog("📨 Yêu cầu chơi lại");
};

findNewBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send("RESTART_DECLINE");
    ws.send("LEAVE");

    hideOverlay();
    setRoomId(null);
    leaveBtn.classList.add("hidden");
    leaveBtnSmall.classList.add("hidden");

    setMatchInfo("");
    resetTimers();
    clearChat();

    toast("Đang tìm đối thủ mới...", "ok");
    addLog("🔄 Tìm đối thủ mới...");

    setTimeout(() => {
        ws.send("QUICKPLAY");
        setStatus("Đang tìm...");
    }, 300);
};

startBtn.onclick = () => {
    const name = nameInput.value.trim();
    if (!name) {
        loginError.textContent = "Vui lòng nhập tên!";
        loginError.classList.remove("hidden");
        return;
    }
    if (name.length < 2) {
        loginError.textContent = "Tên phải có ít nhất 2 ký tự!";
        loginError.classList.remove("hidden");
        return;
    }

    playerName = name;
    connectWebSocket();
};

nameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") startBtn.click();
});

copyRoomBtn.onclick = async () => {
    if (!currentRoomId) return;
    try {
        await navigator.clipboard.writeText(currentRoomId);
        toast("Đã copy Room ID!", "ok");
    } catch {
        toast("Không copy được (trình duyệt chặn).", "warn");
    }
};

quickBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    hideOverlay();
    resetTimers();
    selectTab("quick");

    if (currentRoomId) {
        ws.send("RESTART_DECLINE");
        ws.send("LEAVE");

        setRoomId(null);
        leaveBtn.classList.add("hidden");
        leaveBtnSmall.classList.add("hidden");
        setMatchInfo("");

        toast("Đang tìm trận...", "ok");

        setTimeout(() => {
            ws.send("QUICKPLAY");
            setStatus("Đang tìm...");
        }, 300);
        return;
    }

    ws.send("QUICKPLAY");
    setStatus("Đang tìm...");
    toast("Đang tìm trận...", "ok");
};

createBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    selectTab("quick");
    ws.send("CREATE_ROOM");
    resetTimers();
    toast("Đã gửi yêu cầu tạo phòng", "ok");
};

joinRoomBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    selectTab("join");

    const roomId = roomInput.value.trim().toUpperCase();
    if (!roomId) {
        toast("Nhập Room ID trước nhé", "warn");
        addLog(" Nhập Room ID");
        return;
    }
    ws.send("JOIN_ROOM " + roomId);
    resetTimers();
    toast("Đang vào phòng...", "ok");
};

leaveBtn.onclick = leaveBtnSmall.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    hideOverlay();
    ws.send("LEAVE");
    resetTimers();
    clearChat();
    toast("Đã rời phòng", "ok");
};

sendChatBtn.onclick = () => {
    const text = chatInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send("CHAT " + text);
    chatInput.value = "";
};

chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendChatBtn.click();
});

// ===== WebSocket Connection =====
function connectWebSocket() {
    const scheme = (location.protocol === "https:") ? "wss" : "ws";
    const url = `${scheme}://${location.host}/ws`;

    ws = new WebSocket(url);

    ws.onopen = () => {
        setConnState("on");
        ws.send("HELLO " + playerName);

        loginScreen.classList.add("hidden");
        gameScreen.classList.remove("hidden");

        playerNameEl.textContent = playerName;
        playerNameDisplay.textContent = playerName;

        setOpponent("Đang chờ...");
        mySymbol = null;
        updateSymbolBadge();

        setRoomId(null);
        setMatchInfo("");
        updateStats();

        setStatus("Sẵn sàng");
        addLog(" Kết nối thành công!");
        toast("Đã kết nối với server", "ok");

        quickBtn.disabled = false;
        createBtn.disabled = false;
        joinRoomBtn.disabled = false;

        renderBoard();
        selectTab("quick");
    };

    ws.onerror = () => {
        setConnState("err");
        loginError.textContent = "Không thể kết nối server!";
        loginError.classList.remove("hidden");
        toast("Lỗi kết nối WebSocket", "err");
    };

    ws.onclose = () => {
        setConnState("off");
        setStatus("Mất kết nối");
        addLog("🔌 Ngắt kết nối");
        toast("Đã ngắt kết nối", "warn");

        resetTimers();
        renderBoard();

        quickBtn.disabled = true;
        createBtn.disabled = true;
        joinRoomBtn.disabled = true;
    };

    ws.onmessage = (event) => {
        const msg = event.data;
        addLog("← " + msg);

        if (msg.startsWith("HELLO_OK")) return;

        if (msg.startsWith("ERROR")) {
            setStatus("Lỗi");
            toast(msg, "err");
            return;
        }

        if (msg.startsWith("CHAT_FROM ")) {
            const content = msg.replace("CHAT_FROM ", "");
            const colonIdx = content.indexOf(":");
            let senderName = "";
            let msgText = content;

            if (colonIdx > 0) {
                senderName = content.substring(0, colonIdx).trim();
                msgText = content.substring(colonIdx + 1).trim();
            }

            const isMe = senderName === playerName;
            addChatMessage(senderName, msgText, isMe);
            return;
        }

        // WAITING
        if (msg.startsWith("WAITING")) {
            const m = msg.match(/roomId=([A-Z0-9_]+)/);
            if (m) setRoomId(m[1]);

            setStatus("Đang chờ...");
            setMatchInfo("");
            leaveBtn.classList.remove("hidden");
            leaveBtnSmall.classList.remove("hidden");
            resetTimers();
            setOpponent("Đang chờ...");
            toast("Đang chờ người chơi...", "ok");
            selectTab("quick");
            return;
        }

        // MATCHED / JOINED
        if (msg.startsWith("MATCHED") || msg.startsWith("JOINED")) {
            const vsMatch = msg.match(/vs=(.*)$/);
            const roomMatch = msg.match(/roomId=([A-Z0-9_]+)/);

            const rawVs = vsMatch ? vsMatch[1].trim() : "";
            const vsName = decodeName(rawVs);

            if (roomMatch) setRoomId(roomMatch[1]);
            if (rawVs) setOpponent(vsName);

            setStatus("Đang chơi");
            setMatchInfo(rawVs ? `vs ${vsName}` : "Đang chơi");
            leaveBtn.classList.remove("hidden");
            leaveBtnSmall.classList.remove("hidden");

            resetForNewGame();
            clearChat();
            toast("Đã ghép trận!", "ok");
            selectTab("quick");
            return;
        }

        // ROOM_CREATED
        if (msg.startsWith("ROOM_CREATED")) {
            const m = msg.match(/roomId=([A-Z0-9]+)/);
            if (m) setRoomId(m[1]);

            setStatus("Chờ người chơi");
            setMatchInfo("");
            leaveBtn.classList.remove("hidden");
            leaveBtnSmall.classList.remove("hidden");
            resetTimers();
            setOpponent("Đang chờ...");
            toast("Tạo phòng thành công", "ok");
            selectTab("quick");
            return;
        }

        // BOARD
        if (msg.startsWith("BOARD ")) {
            const b = msg.substring(6).trim();
            if (b.length === 9) {
                const newState = b.split("");

                let last = -1;
                for (let i = 0; i < 9; i++) {
                    if (boardState[i] !== newState[i]) last = i;
                }
                lastMoveIndex = last;

                boardState = newState;
                renderBoard();
            }
            return;
        }

        // YOU_ARE
        if (msg.startsWith("YOU_ARE")) {
            mySymbol = msg.split(" ")[1];
            updateSymbolBadge();
            renderBoard();
            return;
        }

        // TURN_START
        if (msg.startsWith("TURN_START")) {
            const turnMatch = msg.match(/turn=([XO])/);
            const startMatch = msg.match(/start=(\d+)/);

            if (turnMatch && startMatch) {
                const turn = turnMatch[1];
                const startTime = parseInt(startMatch[1], 10);

                startTurnTimer(turn, startTime);
                setStatus(mySymbol && turn === mySymbol ? "Lượt của bạn!" : "Lượt đối thủ...");
            }
            return;
        }

        // STATUS
        if (msg.startsWith("STATUS ")) {
            const statusMsg = msg.substring(7);

            const lower = statusMsg.toLowerCase();
            if (lower.includes("opponent disconnected") || lower.includes("opponent left the room")) {
                stopTurnTimer();

                clearTimeout(pendingOpponentAutoWin);
                pendingOpponentAutoWin = setTimeout(() => {
                    if (!gameEnded) {
                        showOverlay("🔌", "Đối thủ rời/mất kết nối. Bạn thắng!");
                        updateStatsFromResult("win");
                    }
                }, 700);
            }

            if (/share id/i.test(statusMsg)) {
                const m = statusMsg.match(/Share ID:\s*([A-Z0-9_]+)/i);
                if (m) setRoomId(m[1]);
                setStatus("Chờ người chơi");
                return;
            }

            if (/room[:=]\s*([A-Z0-9_]+)/i.test(statusMsg)) {
                const m = statusMsg.match(/room[:=]\s*([A-Z0-9_]+)/i);
                if (m) setRoomId(m[1]);
                setStatus("Đang chờ...");
                return;
            }

            if (statusMsg.includes("restarted") || statusMsg.includes("started")) {
                resetForNewGame();
                setStatus("Đang chơi");
            } else {
                setStatus(statusMsg);
            }
            return;
        }

        // RESTART_OFFER
        if (msg.startsWith("RESTART_OFFER")) {
            opponentWantsPlayAgain = true;

            if (iWantPlayAgain) {
                ws.send("RESTART_ACCEPT");
                showMessage("🎮 Bắt đầu...", "waiting");
            } else {
                showMessage("🔔 Đối thủ muốn chơi tiếp!", "opponent");
                toast("Đối thủ muốn chơi lại", "warn");
            }
            return;
        }

        // GAME_OVER
        if (msg.startsWith("GAME_OVER")) {
            clearTimeout(pendingOpponentAutoWin);

            const winnerMatch = msg.match(/winner=([^ ]+)/);
            const reasonMatch = msg.match(/reason=([^ ]+)/);

            let icon, text, result;
            const winner = winnerMatch ? winnerMatch[1] : "";
            const reason = reasonMatch ? reasonMatch[1] : "";

            if (winner === "DRAW") {
                icon = "🤝"; text = "Hòa!"; result = "draw";
            } else if (reason === "DISCONNECT") {
                if (winner === mySymbol) { icon = "🔌"; text = "Đối thủ mất kết nối. Bạn thắng!"; result = "win"; }
                else { icon = "🔌"; text = "Mất kết nối."; result = "loss"; }
            } else if (winner === mySymbol) {
                icon = "🏆"; text = "Bạn thắng!"; result = "win";
            } else if (reason === "TIMEOUT") {
                icon = "⏰";
                if (winner === "X") text = "X hết giờ, O thắng!";
                else text = "O hết giờ, X thắng!";
                result = winner === mySymbol ? "win" : "loss";
            } else {
                icon = "😔"; text = "Bạn thua!"; result = "loss";
            }

            if (result) updateStatsFromResult(result);

            setTimeout(() => showOverlay(icon, text), 350);
            stopTurnTimer();
            return;
        }

        // RESTART_DECLINED
        if (msg.startsWith("RESTART_DECLINED")) {
            showMessage("👋 Đối thủ tìm người khác", "opponent");
            toast("Đối thủ từ chối chơi lại", "warn");
            return;
        }

        // OPPONENT_LEFT
        if (msg.startsWith("OPPONENT_LEFT")) {
            clearTimeout(pendingOpponentAutoWin);

            setStatus("Đối thủ rời");
            setMatchInfo("");
            hideOverlay();

            setRoomId(null);
            mySymbol = null;
            updateSymbolBadge();

            setOpponent("Đang chờ...");
            boardState = Array(9).fill(".");
            lastMoveIndex = -1;
            renderBoard();

            leaveBtn.classList.add("hidden");
            leaveBtnSmall.classList.add("hidden");
            resetTimers();
            clearChat();
            toast("Đối thủ đã rời", "warn");
            return;
        }

        // LEFT_ROOM
        if (msg.startsWith("LEFT_ROOM")) {
            clearTimeout(pendingOpponentAutoWin);

            setRoomId(null);
            mySymbol = null;
            updateSymbolBadge();

            setOpponent("Đang chờ...");
            boardState = Array(9).fill(".");
            lastMoveIndex = -1;
            renderBoard();

            setStatus("Sẵn sàng");
            setMatchInfo("");
            leaveBtn.classList.add("hidden");
            leaveBtnSmall.classList.add("hidden");
            resetTimers();
            clearChat();
            toast("Bạn đã rời phòng", "ok");
            selectTab("quick");
        }
    };
}