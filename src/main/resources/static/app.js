// ===== DOM Elements =====
const loginScreen = document.getElementById("loginScreen");
const gameScreen = document.getElementById("gameScreen");
const nameInput = document.getElementById("nameInput");
const startBtn = document.getElementById("startBtn");
const loginError = document.getElementById("loginError");

const playerNameEl = document.getElementById("playerName");
const playerSymbolEl = document.getElementById("playerSymbol");
const gameStatus = document.getElementById("gameStatus");
const matchInfo = document.getElementById("matchInfo");
const board = document.getElementById("board");
const log = document.getElementById("log");
const roomInput = document.getElementById("roomInput");
const leaveBtn = document.getElementById("leaveBtn");

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
let currentRoomId = null;
let boardState = Array(9).fill(".");
let iWantPlayAgain = false;
let opponentWantsPlayAgain = false;
let gameEnded = false;

// ===== TIMER STATE =====
let turnTimerInterval = null;
let turnStartTime = 0;
let currentTurn = null; // 'X' or 'O'
const TURN_DURATION = 60; // 1 phút = 60 giây

// ===== Timer Elements =====
let myTimerEl = null;
let opponentTimerEl = null;

// ===== Utility Functions =====
function addLog(msg) {
    log.textContent += msg + "\n";
    log.scrollTop = log.scrollHeight;
}

function setStatus(s) {
    gameStatus.textContent = s;
}

function setMatchInfo(s) {
    matchInfo.textContent = s;
}

function renderBoard() {
    const cells = board.querySelectorAll(".cell");
    for (let i = 0; i < 9; i++) {
        const val = boardState[i];
        cells[i].textContent = val === "." ? "" : val;
        cells[i].className = "cell";
        if (val === "X") cells[i].classList.add("x");
        if (val === "O") cells[i].classList.add("o");
    }
}

function updateSymbolBadge() {
    playerSymbolEl.textContent = mySymbol || "?";
    playerSymbolEl.className = "player-badge";
    if (mySymbol === "X") playerSymbolEl.classList.add("x");
    if (mySymbol === "O") playerSymbolEl.classList.add("o");
}

// ===== Timer Functions =====
let singleTimerEl = null;

function createTimerElements() {
    // ✅ Tránh tạo timer nhiều lần (khi reconnect / gọi lại connectWebSocket)
    const boardArea = document.querySelector(".board-area");
    if (!boardArea) return;

    const existing = boardArea.querySelector(".timer-container");
    if (existing) {
        // Nếu đã có timer container thì chỉ lấy lại reference
        singleTimerEl = existing.querySelector(".timer");
        return;
    }

    const timerContainer = document.createElement("div");
    timerContainer.className = "timer-container";

    singleTimerEl = document.createElement("div");
    singleTimerEl.className = "timer inactive";
    singleTimerEl.textContent = TURN_DURATION;

    timerContainer.appendChild(singleTimerEl);

    boardArea.insertBefore(timerContainer, boardArea.firstChild);
}

function updateTimerDisplay() {
    if (!turnStartTime || !currentTurn) return;
    if (!singleTimerEl) return;

    const now = Date.now();
    const elapsed = Math.floor((now - turnStartTime) / 1000);
    const remaining = Math.max(0, TURN_DURATION - elapsed);

    singleTimerEl.textContent = remaining;

    // Xác định active / inactive
    if (currentTurn === mySymbol) {
        singleTimerEl.classList.add("active");
        singleTimerEl.classList.remove("inactive");
    } else {
        singleTimerEl.classList.add("inactive");
        singleTimerEl.classList.remove("active");
    }

    // Urgent khi <=10s
    singleTimerEl.classList.toggle("urgent", remaining <= 10);

    if (remaining <= 0) stopTurnTimer();
}

function startTurnTimer(turn, startTimestamp) {
    stopTurnTimer(); // Dừng timer cũ nếu có

    currentTurn = turn;
    turnStartTime = startTimestamp || Date.now();

    // Cập nhật ngay lần đầu
    updateTimerDisplay();

    // Cập nhật mỗi giây
    turnTimerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTurnTimer() {
    if (turnTimerInterval) {
        clearInterval(turnTimerInterval);
        turnTimerInterval = null;
    }
}

function resetTimers() {
    stopTurnTimer();
    if (singleTimerEl) {
        singleTimerEl.textContent = TURN_DURATION;
        singleTimerEl.className = "timer inactive";
    }
    currentTurn = null;
    turnStartTime = 0;
}

// ===== Create Board =====
board.innerHTML = "";
for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.onclick = () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (!currentRoomId || gameEnded) return;
        ws.send("CLICK " + i);
    };
    board.appendChild(cell);
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
}

function hideOverlay() {
    gameOverlay.classList.add("hidden");
    iWantPlayAgain = false;
    opponentWantsPlayAgain = false;
    gameEnded = false;
}

function showMessage(text, type) {
    overlayMessage.textContent = text;
    overlayMessage.className = "overlay-message " + type;
}

function resetForNewGame() {
    boardState = Array(9).fill(".");
    renderBoard();
    hideOverlay();
    resetTimers();
}

// ===== Overlay Button Handlers =====
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
    currentRoomId = null;
    leaveBtn.classList.add("hidden");
    setMatchInfo("");
    resetTimers();
    addLog("🔄 Tìm đối thủ mới...");

    setTimeout(() => {
        ws.send("QUICKPLAY");
        setStatus("Đang tìm...");
    }, 300);
};

// ===== Start Button (Login) =====
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

// ===== WebSocket Connection =====
function connectWebSocket() {
    const url = `ws://${location.host}/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => {
        ws.send("HELLO " + playerName);

        // Chuyển sang game screen
        loginScreen.classList.add("hidden");
        gameScreen.classList.remove("hidden");
        playerNameEl.textContent = playerName;
        setStatus("Sẵn sàng");
        addLog("✅ Kết nối thành công!");

        // Tạo timer elements
        createTimerElements();
    };

    ws.onerror = () => {
        loginError.textContent = "Không thể kết nối server!";
        loginError.classList.remove("hidden");
    };

    ws.onclose = () => {
        setStatus("Mất kết nối");
        addLog("🔌 Ngắt kết nối");
        resetTimers();

        // Không tự động LEAVE ở đây vì đã disconnect
        // Overlay vẫn giữ nguyên (nếu đang hiện), để user thấy trạng thái rõ ràng
    };

    ws.onmessage = (event) => {
        const msg = event.data;
        addLog("← " + msg);

        // HELLO_OK
        if (msg.startsWith("HELLO_OK")) {
            addLog("✅ Đăng ký: " + playerName);
        }

        // ERROR
        if (msg.startsWith("ERROR")) {
            setStatus("Lỗi");
        }

        // WAITING
        if (msg.startsWith("WAITING")) {
            const m = msg.match(/roomId=([A-Z0-9_]+)/);
            if (m) currentRoomId = m[1];
            setStatus("Đang chờ...");
            setMatchInfo("Room: " + currentRoomId);
            leaveBtn.classList.remove("hidden");
            resetTimers();
        }

        // MATCHED / JOINED
        if (msg.startsWith("MATCHED") || msg.startsWith("JOINED")) {
            const vsMatch = msg.match(/vs=([^\s]+)/);
            const roomMatch = msg.match(/roomId=([A-Z0-9_]+)/);
            if (roomMatch) currentRoomId = roomMatch[1];
            if (vsMatch) {
                setStatus("Đang chơi");
                setMatchInfo("vs " + vsMatch[1]);
            }
            leaveBtn.classList.remove("hidden");
            resetForNewGame();
        }

        // ROOM_CREATED
        if (msg.startsWith("ROOM_CREATED")) {
            const m = msg.match(/roomId=([A-Z0-9]+)/);
            if (m) currentRoomId = m[1];
            setStatus("Chờ người chơi");
            setMatchInfo("Room: " + currentRoomId);
            leaveBtn.classList.remove("hidden");
            resetTimers();
        }

        // BOARD
        if (msg.startsWith("BOARD ")) {
            const b = msg.substring(6).trim();
            if (b.length === 9) {
                boardState = b.split("");
                renderBoard();
            }
        }

        // YOU_ARE
        if (msg.startsWith("YOU_ARE")) {
            mySymbol = msg.split(" ")[1];
            updateSymbolBadge();
        }

        // TURN_START - Bắt đầu lượt mới (THÊM MỚI)
        if (msg.startsWith("TURN_START")) {
            const turnMatch = msg.match(/turn=([XO])/);
            const startMatch = msg.match(/start=(\d+)/);

            if (turnMatch && startMatch) {
                const turn = turnMatch[1];
                const startTime = parseInt(startMatch[1]);
                startTurnTimer(turn, startTime);

                if (turn === mySymbol) {
                    setStatus("Lượt của bạn!");
                } else {
                    setStatus("Lượt đối thủ...");
                }
            }
        }

        // STATUS
        if (msg.startsWith("STATUS ")) {
            const statusMsg = msg.substring(7);

            // Nếu game restarted/started thì reset UI
            if (statusMsg.includes("restarted") || statusMsg.includes("started")) {
                resetForNewGame();
                setStatus("Đang chơi");
            } else {
                // Giữ lại những STATUS khác để hiển thị rõ (vd: Opponent disconnected / Opponent is not connected)
                setStatus(statusMsg);
            }
        }

        // RESTART_OFFER - đối thủ muốn chơi lại
        if (msg.startsWith("RESTART_OFFER")) {
            opponentWantsPlayAgain = true;

            if (iWantPlayAgain) {
                // Cả hai đồng ý
                ws.send("RESTART_ACCEPT");
                showMessage("🎮 Bắt đầu...", "waiting");
            } else {
                // Chỉ đối thủ muốn, mình chưa chọn
                showMessage("🔔 Đối thủ muốn chơi tiếp!", "opponent");
            }
        }

        // GAME_OVER
        if (msg.startsWith("GAME_OVER")) {
            const winnerMatch = msg.match(/winner=([^ ]+)/);
            const reasonMatch = msg.match(/reason=([^ ]+)/);

            let icon, text;
            let winner = winnerMatch ? winnerMatch[1] : "";
            let reason = reasonMatch ? reasonMatch[1] : "";

            if (winner === "DRAW") {
                icon = "🤝";
                text = "Hòa!";
            } else if (reason === "DISCONNECT") {
                // ✅ THÊM MỚI: xử lý đối thủ mất kết nối
                if (winner === mySymbol) {
                    icon = "🔌";
                    text = "Đối thủ mất kết nối. Bạn thắng!";
                } else {
                    icon = "🔌";
                    text = "Mất kết nối.";
                }
            } else if (winner === mySymbol) {
                icon = "🏆";
                text = "Bạn thắng!";
            } else if (reason === "TIMEOUT") {
                icon = "⏰";
                text = winner === "X" ? "X hết giờ, O thắng!" : "O hết giờ, X thắng!";
            } else {
                icon = "😔";
                text = "Bạn thua!";
            }

            setTimeout(() => showOverlay(icon, text), 400);
            stopTurnTimer();
        }

        // RESTART_DECLINED
        if (msg.startsWith("RESTART_DECLINED")) {
            showMessage("👋 Đối thủ tìm người khác", "opponent");
        }

        // OPPONENT_LEFT
        if (msg.startsWith("OPPONENT_LEFT")) {
            setStatus("Đối thủ rời");
            setMatchInfo("");
            hideOverlay();
            currentRoomId = null;
            mySymbol = null;
            updateSymbolBadge();
            boardState = Array(9).fill(".");
            renderBoard();
            leaveBtn.classList.add("hidden");
            resetTimers();
        }

        // LEFT_ROOM
        if (msg.startsWith("LEFT_ROOM")) {
            currentRoomId = null;
            mySymbol = null;
            updateSymbolBadge();
            boardState = Array(9).fill(".");
            renderBoard();
            setStatus("Sẵn sàng");
            setMatchInfo("");
            leaveBtn.classList.add("hidden");
            resetTimers();
        }
    };
}

// ===== Game Controls =====
document.getElementById("quickBtn").onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    hideOverlay();
    ws.send("QUICKPLAY");
    setStatus("Đang tìm...");
    resetTimers();
};

document.getElementById("createBtn").onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send("CREATE_ROOM");
    resetTimers();
};

document.getElementById("joinRoomBtn").onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const roomId = roomInput.value.trim().toUpperCase();
    if (!roomId) {
        addLog("❌ Nhập Room ID");
        return;
    }
    ws.send("JOIN_ROOM " + roomId);
    resetTimers();
};

leaveBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    hideOverlay();
    ws.send("LEAVE");
    resetTimers();
};
