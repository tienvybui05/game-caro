package ut.edu.gamecaro.controller;

import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import ut.edu.gamecaro.model.GameResult;
import ut.edu.gamecaro.model.GameRoom;
import ut.edu.gamecaro.model.Player;
import ut.edu.gamecaro.service.GameService;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.Map;
import java.util.concurrent.*;

@Component
public class GameSocketHandler extends TextWebSocketHandler {

    private final GameService gameService;

    // waiting / active / manual rooms
    private final Map<String, GameRoom> waitingRooms = new ConcurrentHashMap<>();
    private final Map<String, GameRoom> activeRooms  = new ConcurrentHashMap<>();
    private final Map<String, GameRoom> manualRooms  = new ConcurrentHashMap<>();

    // sessionId -> roomId
    private final Map<String, String> playerRoomMap = new ConcurrentHashMap<>();

    // sessionId -> session / player
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, Player> players = new ConcurrentHashMap<>();

    // timer per room
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(8);
    private final Map<String, ScheduledFuture<?>> turnTimers = new ConcurrentHashMap<>();
    private static final long TURN_DURATION_SECONDS = 60;

    private final SecureRandom random = new SecureRandom();
    private static final String ROOM_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    public GameSocketHandler(GameService gameService) {
        this.gameService = gameService;
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.put(session.getId(), session);
        safeSend(session, "WELCOME Caro 3x3 - Quick Play & Create Room available");
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = session.getId();

        // xử lý disconnect (không remove room ngay, nhưng game sẽ kết thúc + cancel timer)
        handleDisconnect(sessionId);

        sessions.remove(sessionId);
        players.remove(sessionId);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String payload = message.getPayload().trim();
        String sessionId = session.getId();
        String msg = message.getPayload();

        try {
            if (payload.isEmpty()) return;

            // ===== HELLO <name> =====
            if (payload.startsWith("HELLO")) {
                handleHello(session, sessionId, payload);
                return;
            }

            // yêu cầu HELLO trước
            if (!players.containsKey(sessionId)) {
                safeSend(session, "ERROR Please send HELLO first");
                return;
            }

            if (msg.startsWith("CHAT ")) {
                handleChat(session, msg.substring(5));
                return;
            }


            switch (payload) {
                case "QUICKPLAY" -> handleQuickPlay(session, sessionId);
                case "CREATE_ROOM" -> handleCreateRoom(session, sessionId);
                case "LEAVE" -> handleLeave(sessionId);
                case "RESTART_REQUEST" -> handleRestartRequest(sessionId);
                case "RESTART_ACCEPT" -> handleRestartAccept(sessionId);
                case "RESTART_DECLINE" -> handleRestartDecline(sessionId);
                default -> {
                    if (payload.startsWith("JOIN_ROOM")) {
                        handleJoinRoom(session, sessionId, payload);
                        return;
                    }
                    if (payload.startsWith("CLICK")) {
                        handleClick(session, sessionId, payload);
                        return;
                    }
                    safeSend(session, "ERROR Unknown command");
                }
            }
        } catch (Exception e) {
            logError("Unhandled error in handleTextMessage", e, sessionId);
            safeSend(session, "ERROR Server error");
        }
    }

    private void handleChat(WebSocketSession sender, String content) throws IOException {

        // 1. Lấy roomId của người gửi
        String roomId = playerRoomMap.get(sender.getId());
        if (roomId == null) return;

        // 2. Lấy phòng
        GameRoom room = activeRooms.get(roomId);
        if (room == null) return;

        // 3. Xác định người gửi là X hay O
        Player from;
        if (room.getPlayerX() != null
                && room.getPlayerX().getSession().getId().equals(sender.getId())) {
            from = room.getPlayerX();
        } else {
            from = room.getPlayerO();
        }

        String payload = "CHAT_FROM " + from.getName() + ": " + content;

        // 4. Gửi cho cả 2 người trong phòng
        if (room.getPlayerX() != null && room.getPlayerX().getSession().isOpen()) {
            room.getPlayerX().getSession().sendMessage(new TextMessage(payload));
        }
        if (room.getPlayerO() != null && room.getPlayerO().getSession().isOpen()) {
            room.getPlayerO().getSession().sendMessage(new TextMessage(payload));
        }
    }


    // ===== HELLO =====
    private void handleHello(WebSocketSession session, String sessionId, String payload) {
        String name = payload.substring(5).trim();
        if (name.isEmpty()) {
            safeSend(session, "ERROR Name cannot be empty");
            return;
        }

        // clamp + sanitize nhẹ
        name = name.replaceAll("\\s+", " ").trim();
        if (name.length() > 18) name = name.substring(0, 18);

        Player player = new Player(sessionId, name, '?', session);
        players.put(sessionId, player);

        safeSend(session, "HELLO_OK Hello " + name);
    }

    // ===== QUICKPLAY =====
    private void handleQuickPlay(WebSocketSession session, String sessionId) {
        // nếu đang ở room khác thì bắt buộc LEAVE trước (tránh dính nhiều room)
        if (playerRoomMap.containsKey(sessionId)) {
            safeSend(session, "ERROR You are already in a room. Please LEAVE first.");
            safeSend(session, "STATUS You are already in a room. Please LEAVE first.");
            return;
        }

        Player p = players.get(sessionId);
        if (p == null) return;

        // Ghép an toàn: duyệt các waiting room và "claim" room bằng remove(roomId, room)
        for (Map.Entry<String, GameRoom> entry : waitingRooms.entrySet()) {
            String roomId = entry.getKey();
            GameRoom room = entry.getValue();

            synchronized (room) {
                if (room.getPlayerO() != null) continue;

                // claim room: chỉ 1 thread remove được
                if (!waitingRooms.remove(roomId, room)) continue;

                // join room thành O
                joinExistingRoomAsO(session, sessionId, p, roomId, room, false);
                return;
            }
        }

        // Không có phòng chờ -> tạo mới
        createNewWaitingRoom(session, sessionId, p);
    }

    private void createNewWaitingRoom(WebSocketSession session, String sessionId, Player player) {
        String roomId = generateRoomId(6);
        GameRoom room = new GameRoom(roomId);

        Player xPlayer = new Player(sessionId, player.getName(), 'X', session);
        players.put(sessionId, xPlayer);
        room.setPlayerX(xPlayer);

        waitingRooms.put(roomId, room);
        playerRoomMap.put(sessionId, roomId);

        safeSend(session, "YOU_ARE X");
        safeSend(session, "WAITING roomId=" + roomId);
        safeSend(session, "STATUS Waiting for opponent...");
    }

    // ===== CREATE ROOM (manual) =====
    private void handleCreateRoom(WebSocketSession session, String sessionId) {
        if (playerRoomMap.containsKey(sessionId)) {
            safeSend(session, "ERROR You are already in a room. Please LEAVE first.");
            safeSend(session, "STATUS You are already in a room. Please LEAVE first.");
            return;
        }

        Player p = players.get(sessionId);
        if (p == null) return;

        String roomId = generateRoomId(6);
        GameRoom room = new GameRoom(roomId);

        // ✅ CHỈ UPDATE SYMBOL – KHÔNG TẠO PLAYER MỚI
        p.setSymbol('X');
        room.setPlayerX(p);

        manualRooms.put(roomId, room);
        playerRoomMap.put(sessionId, roomId);

        safeSend(session, "YOU_ARE X");
        safeSend(session, "ROOM_CREATED roomId=" + roomId);
        safeSend(session, "STATUS Room created! Share ID: " + roomId);
    }


    // ===== JOIN ROOM =====
    private void handleJoinRoom(WebSocketSession session, String sessionId, String payload) {
        if (playerRoomMap.containsKey(sessionId)) {
            safeSend(session, "ERROR You are already in a room. Please LEAVE first.");
            safeSend(session, "STATUS You are already in a room. Please LEAVE first.");
            return;
        }

        String[] parts = payload.split("\\s+");
        if (parts.length < 2) {
            safeSend(session, "ERROR Room ID required");
            return;
        }

        String roomId = parts[1].trim().toUpperCase();
        GameRoom room = manualRooms.get(roomId);
        if (room == null) {
            safeSend(session, "ERROR Room not found");
            return;
        }

        synchronized (room) {
            if (room.getPlayerO() != null) {
                safeSend(session, "ERROR Room is full");
                return;
            }

            // claim manual room
            if (!manualRooms.remove(roomId, room)) {
                safeSend(session, "ERROR Room is not available");
                return;
            }

            Player p = players.get(sessionId);
            if (p == null) return;

            joinExistingRoomAsO(session, sessionId, p, roomId, room, true);
        }
    }

    private void joinExistingRoomAsO(WebSocketSession session, String sessionId,
                                     Player player, String roomId, GameRoom room, boolean isManualRoom) {
        Player oPlayer = new Player(sessionId, player.getName(), 'O', session);
        players.put(sessionId, oPlayer);
        room.setPlayerO(oPlayer);

        // move to active
        activeRooms.put(roomId, room);
        playerRoomMap.put(sessionId, roomId);
        // NOTE: player X đã có playerRoomMap từ lúc tạo room (waiting/manual)

        // Start first turn timer: X
        startTurnTimer(roomId, 'X');

        // notify O
        safeSend(session, "YOU_ARE O");
        safeSend(session, (isManualRoom ? "JOINED" : "MATCHED") + " roomId=" + roomId + " vs=" + room.getPlayerX().getName());
        safeSend(session, "TURN_START turn=X start=" + System.currentTimeMillis());

        // notify X
        WebSocketSession xSession = sessions.get(room.getPlayerX().getSessionId());
        if (xSession != null && xSession.isOpen()) {
            safeSend(xSession, "YOU_ARE X"); // đảm bảo X có symbol đúng
            safeSend(xSession, (isManualRoom ? "JOINED" : "MATCHED") + " roomId=" + roomId + " vs=" + oPlayer.getName());
            safeSend(xSession, "STATUS Game started! Your turn (X)");
            safeSend(xSession, "TURN_START turn=X start=" + System.currentTimeMillis());
        }

        // send empty board to both
        sendBoardToRoom(roomId);
    }

    // ===== CLICK =====
    private void handleClick(WebSocketSession session, String sessionId, String payload) {
        Player player = players.get(sessionId);
        if (player == null) {
            safeSend(session, "ERROR Player not found");
            return;
        }

        String roomId = playerRoomMap.get(sessionId);
        if (roomId == null) {
            safeSend(session, "ERROR You are not in a room");
            return;
        }

        GameRoom room = activeRooms.get(roomId);
        if (room == null) {
            safeSend(session, "ERROR Waiting for opponent to join");
            return;
        }

        String[] parts = payload.split("\\s+");
        if (parts.length < 2) {
            safeSend(session, "ERROR Missing index");
            return;
        }

        int index;
        try {
            index = Integer.parseInt(parts[1]);
        } catch (NumberFormatException e) {
            safeSend(session, "ERROR Invalid index");
            return;
        }

        GameResult result = gameService.makeMove(room, index, player.getSymbol());

        if (result.getType() == GameResult.ResultType.INVALID) {
            String msg = (result.getMessage() != null) ? result.getMessage() : "Invalid move";
            safeSend(session, "ERROR " + msg);
            safeSend(session, "STATUS " + msg);
            return; // QUAN TRỌNG: không sendBoard, không reset timer
        }

        // valid move -> update board to both
        sendBoardToRoom(roomId);

        if (result.getType() == GameResult.ResultType.WIN) {
            cancelTurnTimer(roomId);
            broadcastToRoom(roomId, "GAME_OVER winner=" + result.getWinner());
            return;
        }

        if (result.getType() == GameResult.ResultType.DRAW) {
            cancelTurnTimer(roomId);
            broadcastToRoom(roomId, "GAME_OVER winner=DRAW");
            return;
        }

        // continue -> start next turn timer + broadcast turn start
        startTurnTimer(roomId, room.getCurrentTurn());
        broadcastToRoom(roomId, "TURN_START turn=" + room.getCurrentTurn() + " start=" + System.currentTimeMillis());
    }

    // ===== TIMER =====
    private void startTurnTimer(String roomId, char currentTurn) {
        cancelTurnTimer(roomId);

        ScheduledFuture<?> future = scheduler.schedule(() -> handleTimeout(roomId, currentTurn),
                TURN_DURATION_SECONDS, TimeUnit.SECONDS);

        turnTimers.put(roomId, future);
    }

    private void cancelTurnTimer(String roomId) {
        ScheduledFuture<?> future = turnTimers.remove(roomId);
        if (future != null) future.cancel(false);
    }

    private void handleTimeout(String roomId, char timedOutPlayer) {
        // đảm bảo cleanup map trước
        turnTimers.remove(roomId);

        GameRoom room = activeRooms.get(roomId);
        if (room == null) return;
        if (room.isFinished()) return;

        room.setFinished(true);

        char winner = (timedOutPlayer == 'X') ? 'O' : 'X';
        broadcastToRoom(roomId, "GAME_OVER winner=" + winner + " reason=TIMEOUT");
    }

    // ===== RESTART =====
    private void handleRestartRequest(String sessionId) {
        String roomId = playerRoomMap.get(sessionId);
        if (roomId == null) return;

        GameRoom room = activeRooms.get(roomId);
        if (room == null) return;

        Player requester = players.get(sessionId);
        if (requester == null) return;

        Player opponent = (requester.getSymbol() == 'X') ? room.getPlayerO() : room.getPlayerX();
        if (opponent == null) return;

        WebSocketSession opponentSession = sessions.get(opponent.getSessionId());
        if (opponentSession != null && opponentSession.isOpen()) {
            safeSend(opponentSession, "RESTART_OFFER from=" + requester.getName());
        } else {
            WebSocketSession requesterSession = sessions.get(sessionId);
            if (requesterSession != null && requesterSession.isOpen()) {
                safeSend(requesterSession, "STATUS Opponent is not connected");
            }
        }
    }

    private void handleRestartAccept(String sessionId) {
        String roomId = playerRoomMap.get(sessionId);
        if (roomId == null) return;

        GameRoom room = activeRooms.get(roomId);
        if (room == null) return;

        if (room.getPlayerX() == null || room.getPlayerO() == null) {
            WebSocketSession s = sessions.get(sessionId);
            if (s != null && s.isOpen()) {
                safeSend(s, "STATUS Cannot restart: opponent not connected");
            }
            return;
        }

        // ===== REMATCH: swap sides + reset board =====
        synchronized (room) {
            room.swapSides();
            // reset
            gameService.reset(room);
        }

        // start timer for X
        startTurnTimer(roomId, 'X');

        // gửi lại YOU_ARE để client cập nhật phe mới
        WebSocketSession xSession = sessions.get(room.getPlayerX().getSessionId());
        WebSocketSession oSession = sessions.get(room.getPlayerO().getSessionId());
        safeSend(xSession, "YOU_ARE X");
        safeSend(oSession, "YOU_ARE O");

        broadcastToRoom(roomId, "STATUS Game restarted! (swapped sides) " + room.getPlayerX().getName() + "'s turn (X)");
        broadcastToRoom(roomId, "TURN_START turn=X start=" + System.currentTimeMillis());
        sendBoardToRoom(roomId);
    }

    private void handleRestartDecline(String sessionId) {
        String roomId = playerRoomMap.get(sessionId);
        if (roomId == null) return;

        Player decliner = players.get(sessionId);
        GameRoom room = activeRooms.get(roomId);
        if (room == null) return;

        Player opponent = null;
        if (decliner != null) {
            opponent = (decliner.getSymbol() == 'X') ? room.getPlayerO() : room.getPlayerX();
        }

        if (opponent != null) {
            WebSocketSession opponentSession = sessions.get(opponent.getSessionId());
            if (opponentSession != null && opponentSession.isOpen()) {
                safeSend(opponentSession, "RESTART_DECLINED from=" + (decliner != null ? decliner.getName() : "Unknown"));
            }
        }
    }

    // ===== LEAVE / DISCONNECT =====
    private void handleLeave(String sessionId) {
        String roomId = playerRoomMap.get(sessionId);
        if (roomId == null) return;

        cancelTurnTimer(roomId);

        GameRoom room = findRoom(roomId);
        Player leaver = players.get(sessionId);

        // remove mapping first
        playerRoomMap.remove(sessionId);

        if (room != null) {
            // waiting/manual: xóa phòng luôn
            if (waitingRooms.remove(roomId) != null || manualRooms.remove(roomId) != null) {
                // ok
            } else {
                // active room: báo đối thủ + remove room
                Player opponent = null;
                if (leaver != null) {
                    opponent = (leaver.getSymbol() == 'X') ? room.getPlayerO() : room.getPlayerX();
                } else {
                    // fallback
                    if (room.getPlayerX() != null && sessionId.equals(room.getPlayerX().getSessionId())) opponent = room.getPlayerO();
                    if (room.getPlayerO() != null && sessionId.equals(room.getPlayerO().getSessionId())) opponent = room.getPlayerX();
                }

                // FIX #1: Nếu 1 người LEAVE trong active room -> kết thúc game cho người còn lại
                if (opponent != null) {
                    WebSocketSession opponentSession = sessions.get(opponent.getSessionId());
                    if (opponentSession != null && opponentSession.isOpen()) {
                        safeSend(opponentSession, "STATUS Opponent left the room");
                        safeSend(opponentSession, "GAME_OVER winner=" + opponent.getSymbol() + " reason=LEAVE");
                    }
                }

                room.setFinished(true);
                activeRooms.remove(roomId);
            }
        }

        WebSocketSession s = sessions.get(sessionId);
        if (s != null && s.isOpen()) {
            safeSend(s, "LEFT_ROOM");
            safeSend(s, "STATUS You left the room");
        }
    }

    private void handleDisconnect(String sessionId) {
        String roomId = playerRoomMap.remove(sessionId);
        if (roomId == null) return;

        // nếu đang waiting/manual (chưa ghép) -> xóa luôn
        if (waitingRooms.remove(roomId) != null) return;
        if (manualRooms.remove(roomId) != null) return;

        GameRoom room = activeRooms.get(roomId);
        if (room == null) return;

        // cancel timer để khỏi leak
        cancelTurnTimer(roomId);

        Player disconnected = players.get(sessionId);
        Player opponent = null;

        if (disconnected != null) {
            opponent = (disconnected.getSymbol() == 'X') ? room.getPlayerO() : room.getPlayerX();
        } else {
            // fallback
            if (room.getPlayerX() != null && sessionId.equals(room.getPlayerX().getSessionId())) opponent = room.getPlayerO();
            if (room.getPlayerO() != null && sessionId.equals(room.getPlayerO().getSessionId())) opponent = room.getPlayerX();
        }

        if (opponent != null) {
            room.setFinished(true);
            broadcastToRoom(roomId, "STATUS Opponent disconnected");
            broadcastToRoom(roomId, "GAME_OVER winner=" + opponent.getSymbol() + " reason=DISCONNECT");
        }

        // giữ room lại (UI đối thủ đang hiện overlay), sẽ clean khi họ LEAVE
        // NOTE: cleanup active room để tránh stuck state/timer ở client khi đối thủ đi tìm trận mới
        activeRooms.remove(roomId);
    }

    // ===== SEND HELPERS =====
    private void safeSend(WebSocketSession session, String msg) {
        if (session == null || !session.isOpen()) return;
        try {
            session.sendMessage(new TextMessage(msg));
        } catch (IOException e) {
            logError("Error sending message", e, session.getId());
        }
    }

    private void broadcastToRoom(String roomId, String msg) {
        GameRoom room = activeRooms.get(roomId);
        if (room == null) return;

        if (room.getPlayerX() != null) {
            WebSocketSession x = sessions.get(room.getPlayerX().getSessionId());
            safeSend(x, msg);
        }
        if (room.getPlayerO() != null) {
            WebSocketSession o = sessions.get(room.getPlayerO().getSessionId());
            safeSend(o, msg);
        }
    }

    private void sendBoardToRoom(String roomId) {
        GameRoom room = activeRooms.get(roomId);
        if (room == null) return;

        String boardMsg = "BOARD " + new String(room.getBoard());
        broadcastToRoom(roomId, boardMsg);
    }

    private GameRoom findRoom(String roomId) {
        GameRoom room = activeRooms.get(roomId);
        if (room != null) return room;

        room = waitingRooms.get(roomId);
        if (room != null) return room;

        return manualRooms.get(roomId);
    }

    private String generateRoomId(int len) {
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) {
            int idx = random.nextInt(ROOM_CHARS.length());
            sb.append(ROOM_CHARS.charAt(idx));
        }
        return sb.toString();
    }

    private void logError(String message, Exception e, String sessionId) {
        System.err.println("Error [Session: " + sessionId + "]: " + message);
        e.printStackTrace();
    }
}
