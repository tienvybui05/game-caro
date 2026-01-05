const statusDiv = document.getElementById("status");
const metaDiv = document.getElementById("meta");
const log = document.getElementById("log");
const board = document.getElementById("board");

const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");

let ws = null;
let mySymbol = null;
let currentRoomId = null;
let boardState = Array(9).fill(".");

function addLog(msg) {
    log.textContent += msg + "\n";
    log.scrollTop = log.scrollHeight;
}

function setStatus(s) {
    statusDiv.textContent = s;
}

function setMeta(s) {
    metaDiv.textContent = s;
}

function renderBoard() {
    const cells = board.querySelectorAll(".cell");
    for (let i = 0; i < 9; i++) {
        cells[i].textContent = boardState[i] === "." ? "" : boardState[i];
    }
}

function ensureConnected() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addLog("❌ Not connected yet.");
        return false;
    }
    return true;
}

// ===== Create board UI =====
board.innerHTML = "";
for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.onclick = () => {
        if (!ensureConnected()) return;
        if (!currentRoomId) {
            addLog("❌ You need to join a room first");
            return;
        }
        ws.send("CLICK " + i);
    };
    board.appendChild(cell);
}
renderBoard();

// ===== Connect =====
document.getElementById("connectBtn").onclick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        addLog("ℹ️ Already connected.");
        return;
    }

    const url = `ws://${location.host}/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => {
        setStatus("Status: Connected");
        addLog("✅ WebSocket connected: " + url);

        const name = (nameInput.value || "").trim();
        if (name) ws.send("HELLO " + name);
        else addLog("⚠️ Tip: nhập tên rồi bấm Connect để gửi HELLO.");
    };

    // Thêm vào phần ws.onmessage:
    ws.onmessage = (event) => {
        try {
            const msg = event.data;
            addLog("Server: " + msg);

            // Parse key messages
            if (msg.startsWith("WELCOME")) {
                setMeta(msg);
            }

            if (msg.startsWith("HELLO_OK")) {
                const name = msg.substring(9);
                addLog("✅ Registered as: " + name);
            }

            if (msg.startsWith("ERROR")) {
                addLog("❌ " + msg);
            }

            if (msg.startsWith("WAITING")) {
                const m = msg.match(/roomId=([A-Z0-9_]+)/);
                if (m) currentRoomId = m[1];
                setMeta(`⏳ Đang chờ đối thủ... (Room: ${currentRoomId})`);
                addLog("⏳ Đã tạo phòng chờ, đợi người chơi thứ 2...");
            }

            if (msg.startsWith("MATCHED") || msg.startsWith("JOINED")) {
                const roomMatch = msg.match(/roomId=([A-Z0-9_]+)/);
                const vsMatch = msg.match(/vs=([^\s]+)/);
                if (roomMatch) currentRoomId = roomMatch[1];
                if (vsMatch) {
                    setMeta(`🎮 Đã ghép cặp với: ${vsMatch[1]} (Room: ${currentRoomId})`);
                    addLog(`✅ Đã tìm thấy đối thủ: ${vsMatch[1]}`);
                }
            }

            if (msg.startsWith("ROOM_CREATED")) {
                const m = msg.match(/roomId=([A-Z0-9]+)/);
                if (m) currentRoomId = m[1];
                setMeta(`✅ Created room: ${currentRoomId} (share this ID)`);
                addLog(`📋 Room ID để chia sẻ: ${currentRoomId}`);
            }

            if (msg.startsWith("BOARD ")) {
                const b = msg.substring(6).trim();
                if (b.length === 9) {
                    boardState = b.split("");
                    renderBoard();
                    addLog("📊 Board updated");
                }
            }

            if (msg.startsWith("YOU_ARE")) {
                mySymbol = msg.split(" ")[1];
                addLog("🎯 Your symbol: " + mySymbol);
            }

            if (msg.startsWith("STATUS ")) {
                setMeta(msg);
                addLog("ℹ️ " + msg.substring(7));
            }

            // Xử lý restart offer
            if (msg.startsWith("RESTART_OFFER")) {
                const from = msg.match(/from=([^\s]+)/)?.[1] || "opponent";
                const ok = confirm(`${from} muốn chơi lại. Đồng ý?`);
                if (ok) {
                    ws.send("RESTART_ACCEPT");
                    addLog("✅ Đã đồng ý chơi lại");
                } else {
                    ws.send("RESTART_DECLINE");
                    addLog("❌ Đã từ chối chơi lại");
                }
            }

            if (msg.startsWith("GAME_OVER")) {
                const winner = msg.split("winner=")[1];

                setTimeout(() => {
                    if (winner === "DRAW") {
                        alert("🤝 Hòa nhau!");
                    } else if (winner === mySymbol) {
                        alert("🎉 Bạn đã THẮNG!");
                    } else {
                        alert("😢 Bạn đã THUA!");
                    }
                }, 100);
            }

            // Xử lý đối thủ rời phòng
            if (msg.startsWith("OPPONENT_LEFT")) {
                alert("⚠️ Đối thủ đã rời khỏi phòng!");
                setMeta("Đối thủ đã rời, bạn có thể chơi lại");
                addLog("⚠️ Đối thủ đã rời phòng");
                resetGameState();
            }

            if (msg.startsWith("LEFT_ROOM")) {
                addLog("✅ Đã rời phòng thành công");
                resetGameState();
            }
        } catch (error) {
            console.error("Error processing message:", error);
            addLog("❌ Error processing server message");
        }
    };

    ws.onclose = () => {
        setStatus("Status: Disconnected");
        setMeta("-");
        addLog("🔌 WebSocket closed");
        resetGameState();
    };
};

// ===== Helper Functions =====
function resetGameState() {
    currentRoomId = null;
    mySymbol = null;
    boardState = Array(9).fill(".");
    renderBoard();
}

// ===== Quick Play =====
document.getElementById("quickBtn").onclick = () => {
    if (!ensureConnected()) return;

    const name = (nameInput.value || "").trim();
    if (!name) {
        addLog("❌ Bạn chưa nhập tên.");
        return;
    }
    ws.send("HELLO " + name);
    ws.send("QUICKPLAY");
};

// ===== Create Room =====
document.getElementById("createBtn").onclick = () => {
    if (!ensureConnected()) return;

    const name = (nameInput.value || "").trim();
    if (!name) {
        addLog("❌ Bạn chưa nhập tên.");
        return;
    }
    ws.send("HELLO " + name);
    ws.send("CREATE_ROOM");
};

// ===== Join Room =====
document.getElementById("joinRoomBtn").onclick = () => {
    if (!ensureConnected()) return;

    const name = (nameInput.value || "").trim();
    if (!name) {
        addLog("❌ Bạn chưa nhập tên.");
        return;
    }

    const roomId = (roomInput.value || "").trim().toUpperCase();
    if (!roomId) {
        addLog("❌ Bạn chưa nhập Room ID.");
        return;
    }

    ws.send("HELLO " + name);
    ws.send("JOIN_ROOM " + roomId);
};

// ===== Restart =====
document.getElementById("restartBtn").onclick = () => {
    if (!ensureConnected()) return;
    if (!currentRoomId) {
        addLog("❌ You need to be in a game to restart");
        return;
    }
    ws.send("RESTART_REQUEST");
    addLog("📨 Đã gửi yêu cầu chơi lại");
};

// ===== Leave =====
document.getElementById("leaveBtn").onclick = () => {
    if (!ensureConnected()) return;
    if (!currentRoomId) {
        addLog("ℹ️ You are not in any room");
        return;
    }
    ws.send("LEAVE");
};