// ===== DOM Elements =====
const loginScreen = document.getElementById("loginScreen");
const gameScreen = document.getElementById("gameScreen");
const nameInput = document.getElementById("nameInput");
const startBtn = document.getElementById("startBtn");
const loginError = document.getElementById("loginError");

const playerNameEl = document.getElementById("playerName");
const playerSymbolEl = document.getElementById("playerSymbol");

const opponentNameEl = document.getElementById("opponentName");
const opponentSymbolEl = document.getElementById("opponentSymbol");

const connDot = document.getElementById("connDot");
const connText = document.getElementById("connText");

const gameStatus = document.getElementById("gameStatus");
const matchInfo = document.getElementById("matchInfo");

const board = document.getElementById("board");
const log = document.getElementById("log");
const roomInput = document.getElementById("roomInput");
const leaveBtn = document.getElementById("leaveBtn");

const roomIdText = document.getElementById("roomIdText");
const copyRoomBtn = document.getElementById("copyRoomBtn");

const toastEl = document.getElementById("toast");

// Buttons
const quickBtn = document.getElementById("quickBtn");
const createBtn = document.getElementById("createBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");

// Overlay
const gameOverlay = document.getElementById("gameOverlay");
const resultIcon = document.getElementById("resultIcon");
const resultText = document.getElementById("resultText");
const overlayMessage = document.getElementById("overlayMessage");
const playAgainBtn = document.getElementById("playAgainBtn");
const findNewBtn = document.getElementById("findNewBtn");

// ===== State =====
let ws = null;
let playerName = "";
let mySymbol = null;
let opponentName = "-";
let currentRoomId = null;

let boardState = Array(9).fill(".");
let lastMoveIndex = -1;

let iWantPlayAgain = false;
let opponentWantsPlayAgain = false;
let gameEnded = false;

// ===== TIMER STATE =====
let turnTimerInterval = null;
let turnStartTime = 0;
let currentTurn = null; // 'X' or 'O'
const TURN_DURATION = 60;

// Timer DOM (created by JS)
let timerEl = null;
let timerFillEl = null;

// FIX fallback: nếu STATUS báo đối thủ rời/mất kết nối mà GAME_OVER bị rơi
let pendingOpponentAutoWin = null;

// ===== Utility =====
function addLog(msg) {
    log.textContent += msg + "\n";
    log.scrollTop = log.scrollHeight;
}

function toast(msg, type = "ok") {
    toastEl.textContent = msg;
    toastEl.className = `toast ${type}`;
    toastEl.classList.remove("hidden");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 2200);
}

function setStatus(s) { gameStatus.textContent = s; }
function setMatchInfo(s) { matchInfo.textContent = s; }

function setConnState(state) {
    connDot.classList.remove("on", "err");
    if (state === "on") connDot.classList.add("on");
    if (state === "err") connDot.classList.add("err");
    connText.textContent = state === "on" ? "Connected" : (state === "err" ? "Error" : "Disconnected");
}

function updateSymbolBadge() {
    playerSymbolEl.textContent = mySymbol || "?";
    playerSymbolEl.className = "player-badge";
    if (mySymbol === "X") playerSymbolEl.classList.add("x");
    if (mySymbol === "O") playerSymbolEl.classList.add("o");

    const op = mySymbol ? (mySymbol === "X" ? "O" : "X") : "?";
    opponentSymbolEl.textContent = op;
    opponentSymbolEl.className = "player-badge";
    if (op === "X") opponentSymbolEl.classList.add("x");
    if (op === "O") opponentSymbolEl.classList.add("o");
}

function setOpponent(name) {
    opponentName = name || "-";
    opponentNameEl.textContent = opponentName;
}

function setRoomId(roomId) {
    currentRoomId = roomId || null;
    roomIdText.textContent = currentRoomId || "-";
    copyRoomBtn.disabled = !currentRoomId;
}

// ===== Board =====
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

// ===== Timer =====
function createTimerElements() {
    const boardArea = document.querySelector(".board-area");
    if (!boardArea) return;

    const existing = boardArea.querySelector(".timer-container");
    if (existing) {
        timerEl = existing.querySelector(".timer");
        timerFillEl = existing.querySelector(".timer-fill");
        return;
    }

    const timerContainer = document.createElement("div");
    timerContainer.className = "timer-container";

    const wrap = document.createElement("div");
    wrap.className = "timer-wrap";

    const top = document.createElement("div");
    top.className = "timer-top";

    const label = document.createElement("div");
    label.className = "timer-label";
    label.textContent = "Time left";

    timerEl = document.createElement("div");
    timerEl.className = "timer inactive";
    timerEl.textContent = TURN_DURATION;

    top.appendChild(label);
    top.appendChild(timerEl);

    const bar = document.createElement("div");
    bar.className = "timer-bar";

    timerFillEl = document.createElement("div");
    timerFillEl.className = "timer-fill";
    bar.appendChild(timerFillEl);

    wrap.appendChild(top);
    wrap.appendChild(bar);

    timerContainer.appendChild(wrap);
    boardArea.insertBefore(timerContainer, boardArea.firstChild);
}

function updateTimerDisplay() {
    if (!turnStartTime || !currentTurn || !timerEl) return;

    const now = Date.now();
    const elapsed = Math.floor((now - turnStartTime) / 1000);
    const remaining = Math.max(0, TURN_DURATION - elapsed);

    timerEl.textContent = remaining;

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
        timerEl.textContent = TURN_DURATION;
        timerEl.className = "timer inactive";
    }
    if (timerFillEl) timerFillEl.style.width = "100%";
}

// ===== Overlay =====
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
}

function resetForNewGame() {
    boardState = Array(9).fill(".");
    lastMoveIndex = -1;
    renderBoard();
    hideOverlay();
    resetTimers();
}

// ===== Create Board once =====
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

// ===== Buttons =====
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

    setMatchInfo("");
    resetTimers();

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

// FIX #2: QuickBtn luôn LEAVE trước nếu đang trong room (tránh kẹt phòng / already in room)
quickBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    hideOverlay();
    resetTimers();

    // nếu đang trong room -> rời trước rồi mới tìm trận (giống overlay findNewBtn)
    if (currentRoomId) {
        ws.send("RESTART_DECLINE");
        ws.send("LEAVE");

        setRoomId(null);
        leaveBtn.classList.add("hidden");
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
    ws.send("CREATE_ROOM");
    resetTimers();
    toast("Đã gửi yêu cầu tạo phòng", "ok");
};

joinRoomBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
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

leaveBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    hideOverlay();
    ws.send("LEAVE");
    resetTimers();
    toast("Đã rời phòng", "ok");
};

// ===== WebSocket =====
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

        setOpponent("-");
        mySymbol = null;
        updateSymbolBadge();

        setRoomId(null);
        setMatchInfo("");

        setStatus("Sẵn sàng");
        addLog(" Kết nối thành công!");
        toast("Connected ", "ok");

        quickBtn.disabled = false;
        createBtn.disabled = false;
        joinRoomBtn.disabled = false;

        createTimerElements();
        renderBoard();
    };

    ws.onerror = () => {
        setConnState("err");
        loginError.textContent = "Không thể kết nối server!";
        loginError.classList.remove("hidden");
        toast("WebSocket error", "err");
    };

    ws.onclose = () => {
        setConnState("off");
        setStatus("Mất kết nối");
        addLog("🔌 Ngắt kết nối");
        toast("Disconnected", "warn");

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

        // WAITING
        if (msg.startsWith("WAITING")) {
            const m = msg.match(/roomId=([A-Z0-9_]+)/);
            if (m) setRoomId(m[1]);

            setStatus("Đang chờ...");
            setMatchInfo(""); //
            leaveBtn.classList.remove("hidden");
            resetTimers();
            setOpponent("-");
            toast("Đang chờ người chơi...", "ok");
            return;
        }

        // MATCHED / JOINED
        if (msg.startsWith("MATCHED") || msg.startsWith("JOINED")) {
            const vsMatch = msg.match(/vs=([^\s]+)/);
            const roomMatch = msg.match(/roomId=([A-Z0-9_]+)/);

            if (roomMatch) setRoomId(roomMatch[1]);
            if (vsMatch) setOpponent(vsMatch[1]);

            setStatus("Đang chơi");
            setMatchInfo(vsMatch ? `vs ${vsMatch[1]}` : "Đang chơi");
            leaveBtn.classList.remove("hidden");

            resetForNewGame();
            toast("Đã ghép trận ", "ok");
            return;
        }

        // ROOM_CREATED
        if (msg.startsWith("ROOM_CREATED")) {
            const m = msg.match(/roomId=([A-Z0-9]+)/);
            if (m) setRoomId(m[1]);

            setStatus("Chờ người chơi");
            setMatchInfo(""); //
            leaveBtn.classList.remove("hidden");
            resetTimers();
            setOpponent("-");
            toast("Tạo phòng thành công", "ok");
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

            // FIX #1 fallback: nếu đối thủ rời/mất kết nối mà GAME_OVER bị rơi -> stop timer + auto-win
            const lower = statusMsg.toLowerCase();
            if (lower.includes("opponent disconnected") || lower.includes("opponent left the room")) {
                stopTurnTimer();

                clearTimeout(pendingOpponentAutoWin);
                pendingOpponentAutoWin = setTimeout(() => {
                    if (!gameEnded) {
                        showOverlay("🔌", "Đối thủ rời/mất kết nối. Bạn thắng!");
                    }
                }, 700);
            }

            // Nếu server gửi dạng: "Room created! Share ID: ABC123"
            if (/share id/i.test(statusMsg)) {
                const m = statusMsg.match(/Share ID:\s*([A-Z0-9_]+)/i);
                if (m) setRoomId(m[1]);
                setStatus("Chờ người chơi");
                return;
            }

            if (/room[:=]\s*([A-Z0-9_]+)/i.test(statusMsg)) {
                const m = statusMsg.match(/room[:=]\s*([A-Z0-9_]+)/i);
                if (m) setRoomId(m[1]);
                // giữ status ngắn gọn
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
                toast("Đối thủ muốn restart", "warn");
            }
            return;
        }

        // GAME_OVER
        if (msg.startsWith("GAME_OVER")) {
            clearTimeout(pendingOpponentAutoWin);

            const winnerMatch = msg.match(/winner=([^ ]+)/);
            const reasonMatch = msg.match(/reason=([^ ]+)/);

            let icon, text;
            const winner = winnerMatch ? winnerMatch[1] : "";
            const reason = reasonMatch ? reasonMatch[1] : "";

            if (winner === "DRAW") {
                icon = "🤝"; text = "Hòa!";
            } else if (reason === "DISCONNECT") {
                if (winner === mySymbol) { icon = "🔌"; text = "Đối thủ mất kết nối. Bạn thắng!"; }
                else { icon = "🔌"; text = "Mất kết nối."; }
            } else if (winner === mySymbol) {
                icon = "🏆"; text = "Bạn thắng!";
            } else if (reason === "TIMEOUT") {
                icon = "⏰";
                text = winner === "X" ? "X hết giờ, O thắng!" : "O hết giờ, X thắng!";
            } else {
                icon = "😔"; text = "Bạn thua!";
            }

            setTimeout(() => showOverlay(icon, text), 350);
            stopTurnTimer();
            return;
        }

        // RESTART_DECLINED
        if (msg.startsWith("RESTART_DECLINED")) {
            showMessage("👋 Đối thủ tìm người khác", "opponent");
            toast("Đối thủ từ chối restart", "warn");
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

            setOpponent("-");
            boardState = Array(9).fill(".");
            lastMoveIndex = -1;
            renderBoard();

            leaveBtn.classList.add("hidden");
            resetTimers();
            toast("Đối thủ đã rời", "warn");
            return;
        }

        // LEFT_ROOM
        if (msg.startsWith("LEFT_ROOM")) {
            clearTimeout(pendingOpponentAutoWin);

            setRoomId(null);

            mySymbol = null;
            updateSymbolBadge();

            setOpponent("-");
            boardState = Array(9).fill(".");
            lastMoveIndex = -1;
            renderBoard();

            setStatus("Sẵn sàng");
            setMatchInfo("");
            leaveBtn.classList.add("hidden");
            resetTimers();
            toast("Bạn đã rời phòng", "ok");
        }
    };
}
