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

    // Use current host (so other devices in LAN can connect)
    const url = `ws://${location.host}/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => {
        setStatus("Status: Connected");
        addLog("✅ WebSocket connected: " + url);

        const name = (nameInput.value || "").trim();
        if (name) ws.send("HELLO " + name);
        else addLog("⚠️ Tip: nhập tên rồi bấm Connect để gửi HELLO.");
    };

    ws.onmessage = (event) => {
        const msg = event.data;
        addLog("Server: " + msg);

        // Parse key messages
        if (msg.startsWith("WELCOME")) {
            setMeta(msg);
        }
        // THÊM: Xử lý HELLO_OK
        if (msg.startsWith("HELLO_OK")) {
            const name = msg.substring(9);
            addLog("✅ Registered as: " + name);
        }

        if (msg.startsWith("ERROR")) {
            addLog("❌ " + msg);
        }

        if (msg.startsWith("YOU_ARE")) {
            mySymbol = msg.split(" ")[1];
            addLog("🎯 Your symbol: " + mySymbol);
        }


        if (msg.startsWith("ROOM_CREATED")) {
            const m = msg.match(/roomId=([A-Z0-9]+)/);
            if (m) currentRoomId = m[1];
            setMeta(`✅ Created room: ${currentRoomId} (share this ID)`);
        }

        if (msg.startsWith("MATCHED") || msg.startsWith("JOINED")) {
            const m = msg.match(/roomId=([A-Z0-9]+)/);
            if (m) currentRoomId = m[1];
        }

        if (msg.startsWith("BOARD ")) {
            const b = msg.substring(6).trim();
            if (b.length === 9) {
                boardState = b.split("");
                renderBoard();
            }
        }

        if (msg.startsWith("STATUS ")) {
            setMeta(msg);
        }

        if (msg.startsWith("RESTART_OFFER")) {
            const from = msg.match(/from=([^\s]+)/)?.[1] || "opponent";
            const ok = confirm(`${from} muốn chơi lại. Đồng ý?`);
            if (ok) ws.send("RESTART_ACCEPT");
            else ws.send("RESTART_DECLINE");
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
    };

    ws.onclose = () => {
        setStatus("Status: Disconnected");
        setMeta("-");
        addLog("🔌 WebSocket closed");
        currentRoomId = null;
        mySymbol = null;
    };
};

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
    ws.send("RESTART_REQUEST");
};

// ===== Leave =====
document.getElementById("leaveBtn").onclick = () => {
    if (!ensureConnected()) return;
    ws.send("LEAVE");
};