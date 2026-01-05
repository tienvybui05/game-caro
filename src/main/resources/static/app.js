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
    };

    ws.onerror = () => {
        loginError.textContent = "Không thể kết nối server!";
        loginError.classList.remove("hidden");
    };

    ws.onclose = () => {
        setStatus("Mất kết nối");
        addLog("🔌 Ngắt kết nối");
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

        // STATUS
        if (msg.startsWith("STATUS ")) {
            const statusMsg = msg.substring(7);
            if (statusMsg.includes("restarted") || statusMsg.includes("started")) {
                resetForNewGame();
                setStatus("Đang chơi");
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
            const winner = msg.split("winner=")[1];
            let icon, text;

            if (winner === "DRAW") {
                icon = "🤝";
                text = "Hòa!";
            } else if (winner === mySymbol) {
                icon = "🏆";
                text = "Bạn thắng!";
            } else {
                icon = "😔";
                text = "Bạn thua!";
            }

            setTimeout(() => showOverlay(icon, text), 400);
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
        }
    };
}

// ===== Game Controls =====
document.getElementById("quickBtn").onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    hideOverlay();
    ws.send("QUICKPLAY");
    setStatus("Đang tìm...");
};

document.getElementById("createBtn").onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send("CREATE_ROOM");
};

document.getElementById("joinRoomBtn").onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const roomId = roomInput.value.trim().toUpperCase();
    if (!roomId) {
        addLog("❌ Nhập Room ID");
        return;
    }
    ws.send("JOIN_ROOM " + roomId);
};

leaveBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    hideOverlay();
    ws.send("LEAVE");
};