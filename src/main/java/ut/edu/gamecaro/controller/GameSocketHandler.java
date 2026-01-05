package ut.edu.gamecaro.controller;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import ut.edu.gamecaro.model.*;
import ut.edu.gamecaro.service.GameService;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class GameSocketHandler extends TextWebSocketHandler {

    private final GameService gameService;

    // Map để lưu các phòng chờ quick play
    private final Map<String, GameRoom> waitingRooms = new ConcurrentHashMap<>();

    // Map để lưu phòng đang chơi
    private final Map<String, GameRoom> activeRooms = new ConcurrentHashMap<>();

    // Map để lưu phòng tạo thủ công
    private final Map<String, GameRoom> manualRooms = new ConcurrentHashMap<>();

    // Map sessionId -> roomId
    private final Map<String, String> playerRoomMap = new HashMap<>();

    private final Map<String, WebSocketSession> sessions = new HashMap<>();
    private final Map<String, Player> players = new HashMap<>();

    public GameSocketHandler(GameService gameService) {
        this.gameService = gameService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        try {
            sessions.put(session.getId(), session);
            session.sendMessage(new TextMessage("WELCOME Caro 3x3 - Quick Play & Create Room available"));
        } catch (IOException e) {
            logError("Error sending welcome message", e, session.getId());
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            String payload = message.getPayload().trim();
            String sessionId = session.getId();

            // ===== HELLO <name> =====
            if (payload.startsWith("HELLO")) {
                handleHello(session, sessionId, payload);
                return;
            }

            // ===== QUICKPLAY =====
            if (payload.equals("QUICKPLAY")) {
                handleQuickPlay(session, sessionId);
                return;
            }

            // ===== CREATE_ROOM =====
            if (payload.equals("CREATE_ROOM")) {
                handleCreateRoom(session, sessionId);
                return;
            }

            // ===== JOIN_ROOM <roomId> =====
            if (payload.startsWith("JOIN_ROOM")) {
                handleJoinRoom(session, sessionId, payload);
                return;
            }

            // ===== CLICK <index> =====
            if (payload.startsWith("CLICK")) {
                handleClick(session, sessionId, payload);
                return;
            }

            // ===== RESTART_REQUEST =====
            if (payload.equals("RESTART_REQUEST")) {
                handleRestartRequest(sessionId);
                return;
            }

            // ===== RESTART_ACCEPT =====
            if (payload.equals("RESTART_ACCEPT")) {
                handleRestartAccept(sessionId);
                return;
            }

            // ===== RESTART_DECLINE =====
            if (payload.equals("RESTART_DECLINE")) {
                handleRestartDecline(sessionId);
                return;
            }

            // ===== LEAVE =====
            if (payload.equals("LEAVE")) {
                handleLeave(sessionId);
                return;
            }
        } catch (Exception e) {
            logError("Error handling message", e, session.getId());
        }
    }

    // Xử lý HELLO
    private void handleHello(WebSocketSession session, String sessionId, String payload) throws IOException {
        String name = payload.substring(5).trim();
        if (name.isEmpty()) {
            session.sendMessage(new TextMessage("ERROR Name cannot be empty"));
            return;
        }

        Player player = new Player(sessionId, name, '?');
        players.put(sessionId, player);
        session.sendMessage(new TextMessage("HELLO_OK Hello " + name));
    }

    // Xử lý CLICK
    private void handleClick(WebSocketSession session, String sessionId, String payload) throws IOException {
        Player player = players.get(sessionId);
        if (player == null) {
            session.sendMessage(new TextMessage("ERROR Player not found"));
            return;
        }

        String roomId = playerRoomMap.get(sessionId);
        if (roomId == null) {
            session.sendMessage(new TextMessage("ERROR You are not in a room"));
            return;
        }

        GameRoom room = activeRooms.get(roomId);
        if (room == null) {
            session.sendMessage(new TextMessage("ERROR Waiting for opponent to join"));
            return;
        }

        int index;
        try {
            index = Integer.parseInt(payload.split(" ")[1]);
        } catch (Exception e) {
            session.sendMessage(new TextMessage("ERROR Invalid move format"));
            return;
        }

        if (index < 0 || index > 8) {
            session.sendMessage(new TextMessage("ERROR Index must be 0-8"));
            return;
        }

        GameResult result = gameService.makeMove(room, index, player.getSymbol());
        sendBoardToRoom(roomId);

        if (result.getType() == GameResult.ResultType.WIN) {
            broadcastToRoom(roomId, "GAME_OVER winner=" + result.getWinner());
        } else if (result.getType() == GameResult.ResultType.DRAW) {
            broadcastToRoom(roomId, "GAME_OVER winner=DRAW");
        }
    }

    // Xử lý Quick Play
    private void handleQuickPlay(WebSocketSession session, String sessionId) throws IOException {
        Player player = players.get(sessionId);
        if (player == null) {
            session.sendMessage(new TextMessage("ERROR Please send HELLO first"));
            return;
        }

        // Tìm phòng chờ có sẵn
        GameRoom availableRoom = null;
        String availableRoomId = null;

        for (Map.Entry<String, GameRoom> entry : waitingRooms.entrySet()) {
            GameRoom room = entry.getValue();
            if (room.getPlayerO() == null) {
                availableRoom = room;
                availableRoomId = entry.getKey();
                break;
            }
        }

        if (availableRoom != null) {
            joinExistingRoom(session, sessionId, player, availableRoomId, availableRoom, false);
        } else {
            createNewWaitingRoom(session, sessionId, player);
        }
    }

    // Tạo phòng chờ mới (quick play)
    private void createNewWaitingRoom(WebSocketSession session, String sessionId, Player player) throws IOException {
        String roomId = "QUICK_" + (System.currentTimeMillis() % 10000);
        GameRoom room = new GameRoom(roomId);

        Player xPlayer = new Player(sessionId, player.getName(), 'X');
        players.put(sessionId, xPlayer);
        room.setPlayerX(xPlayer);

        waitingRooms.put(roomId, room);
        playerRoomMap.put(sessionId, roomId);

        session.sendMessage(new TextMessage("YOU_ARE X"));
        session.sendMessage(new TextMessage("WAITING roomId=" + roomId));
        session.sendMessage(new TextMessage("STATUS Waiting for opponent..."));
    }

    // Tạo phòng thủ công
    private void handleCreateRoom(WebSocketSession session, String sessionId) throws IOException {
        Player player = players.get(sessionId);
        if (player == null) {
            session.sendMessage(new TextMessage("ERROR Please send HELLO first"));
            return;
        }

        String roomId = generateRoomId();
        GameRoom room = new GameRoom(roomId);

        Player xPlayer = new Player(sessionId, player.getName(), 'X');
        players.put(sessionId, xPlayer);
        room.setPlayerX(xPlayer);

        manualRooms.put(roomId, room);
        playerRoomMap.put(sessionId, roomId);

        session.sendMessage(new TextMessage("YOU_ARE X"));
        session.sendMessage(new TextMessage("ROOM_CREATED roomId=" + roomId));
        session.sendMessage(new TextMessage("STATUS Room created! Share ID: " + roomId));
    }

    // Join phòng thủ công
    private void handleJoinRoom(WebSocketSession session, String sessionId, String payload) throws IOException {
        Player player = players.get(sessionId);
        if (player == null) {
            session.sendMessage(new TextMessage("ERROR Please send HELLO first"));
            return;
        }

        String[] parts = payload.split(" ");
        if (parts.length < 2) {
            session.sendMessage(new TextMessage("ERROR Room ID required"));
            return;
        }

        String roomId = parts[1].trim().toUpperCase();
        GameRoom room = manualRooms.get(roomId);

        if (room == null) {
            session.sendMessage(new TextMessage("ERROR Room not found"));
            return;
        }

        if (room.getPlayerO() != null) {
            session.sendMessage(new TextMessage("ERROR Room is full"));
            return;
        }

        joinExistingRoom(session, sessionId, player, roomId, room, true);
    }

    // Join vào phòng có sẵn
    private void joinExistingRoom(WebSocketSession session, String sessionId,
                                  Player player, String roomId, GameRoom room, boolean isManualRoom) throws IOException {
        Player oPlayer = new Player(sessionId, player.getName(), 'O');
        players.put(sessionId, oPlayer);
        room.setPlayerO(oPlayer);

        // Chuyển từ waitingRooms/manualRooms sang activeRooms
        waitingRooms.remove(roomId);
        manualRooms.remove(roomId);
        activeRooms.put(roomId, room);

        playerRoomMap.put(sessionId, roomId);

        // Thông báo cho player O
        session.sendMessage(new TextMessage("YOU_ARE O"));
        session.sendMessage(new TextMessage("MATCHED roomId=" + roomId + " vs=" + room.getPlayerX().getName()));

        // Thông báo cho player X
        WebSocketSession xSession = sessions.get(room.getPlayerX().getSessionId());
        if (xSession != null && xSession.isOpen()) {
            try {
                if (isManualRoom) {
                    xSession.sendMessage(new TextMessage("JOINED roomId=" + roomId + " vs=" + player.getName()));
                } else {
                    xSession.sendMessage(new TextMessage("MATCHED roomId=" + roomId + " vs=" + player.getName()));
                }
                xSession.sendMessage(new TextMessage("STATUS Game started! Your turn (X)"));
            } catch (IOException e) {
                logError("Error notifying player X", e, room.getPlayerX().getSessionId());
            }
        }

        session.sendMessage(new TextMessage("STATUS Game started! Opponent's turn (X)"));

        // Gửi board trống cho cả 2
        sendBoardToRoom(roomId);
    }

    // Xử lý yêu cầu restart
    private void handleRestartRequest(String sessionId) {
        try {
            String roomId = playerRoomMap.get(sessionId);
            if (roomId == null) return;

            GameRoom room = activeRooms.get(roomId);
            if (room == null) return;

            Player requester = players.get(sessionId);
            Player opponent = (requester.getSymbol() == 'X') ? room.getPlayerO() : room.getPlayerX();

            if (opponent != null) {
                WebSocketSession opponentSession = sessions.get(opponent.getSessionId());
                if (opponentSession != null && opponentSession.isOpen()) {
                    opponentSession.sendMessage(new TextMessage("RESTART_OFFER from=" + requester.getName()));
                }
            }
        } catch (IOException e) {
            logError("Error sending restart offer", e, sessionId);
        }
    }

    // Xử lý đồng ý restart
    private void handleRestartAccept(String sessionId) {
        try {
            String roomId = playerRoomMap.get(sessionId);
            if (roomId == null) return;

            GameRoom room = activeRooms.get(roomId);
            if (room == null) return;

            // Reset game
            gameService.reset(room);

            // Thông báo cho cả 2
            broadcastToRoom(roomId, "STATUS Game restarted! " + room.getPlayerX().getName() + "'s turn (X)");
            sendBoardToRoom(roomId);
        } catch (IOException e) {
            logError("Error restarting game", e, sessionId);
        }
    }

    // Xử lý từ chối restart
    private void handleRestartDecline(String sessionId) {
        try {
            String roomId = playerRoomMap.get(sessionId);
            if (roomId == null) return;

            Player decliner = players.get(sessionId);
            GameRoom room = activeRooms.get(roomId);
            if (room == null) return;

            Player opponent = (decliner.getSymbol() == 'X') ? room.getPlayerO() : room.getPlayerX();

            if (opponent != null) {
                WebSocketSession opponentSession = sessions.get(opponent.getSessionId());
                if (opponentSession != null && opponentSession.isOpen()) {
                    opponentSession.sendMessage(new TextMessage("STATUS " + decliner.getName() + " declined restart request"));
                }
            }
        } catch (IOException e) {
            logError("Error sending restart decline", e, sessionId);
        }
    }

    // Xử lý rời phòng
    private void handleLeave(String sessionId) {
        try {
            String roomId = playerRoomMap.get(sessionId);
            if (roomId != null) {
                // Thông báo cho đối thủ nếu có
                GameRoom room = findRoom(roomId);
                if (room != null) {
                    Player leaver = players.get(sessionId);
                    Player opponent = null;

                    if (leaver != null) {
                        opponent = (leaver.getSymbol() == 'X') ? room.getPlayerO() : room.getPlayerX();
                    }

                    if (opponent != null) {
                        WebSocketSession opponentSession = sessions.get(opponent.getSessionId());
                        if (opponentSession != null && opponentSession.isOpen()) {
                            try {
                                opponentSession.sendMessage(new TextMessage("OPPONENT_LEFT"));
                                opponentSession.sendMessage(new TextMessage("STATUS Opponent left the game"));
                            } catch (IOException e) {
                                logError("Error notifying opponent", e, opponent.getSessionId());
                            }
                        }
                    }

                    // Xóa room khỏi tất cả maps
                    waitingRooms.remove(roomId);
                    manualRooms.remove(roomId);
                    activeRooms.remove(roomId);
                }

                playerRoomMap.remove(sessionId);

                WebSocketSession session = sessions.get(sessionId);
                if (session != null && session.isOpen()) {
                    session.sendMessage(new TextMessage("LEFT_ROOM"));
                    session.sendMessage(new TextMessage("STATUS You left the room"));
                }
            }
        } catch (IOException e) {
            logError("Error handling leave", e, sessionId);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = session.getId();
        handleLeave(sessionId);
        sessions.remove(sessionId);
        players.remove(sessionId);
    }

    // ===== Helper Methods =====

    // Tìm room trong tất cả maps
    private GameRoom findRoom(String roomId) {
        GameRoom room = activeRooms.get(roomId);
        if (room != null) return room;

        room = waitingRooms.get(roomId);
        if (room != null) return room;

        return manualRooms.get(roomId);
    }

    // Tạo room ID ngẫu nhiên
    private String generateRoomId() {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            int index = (int) (Math.random() * chars.length());
            sb.append(chars.charAt(index));
        }
        return sb.toString();
    }

    // Gửi board đến phòng
    private void sendBoardToRoom(String roomId) throws IOException {
        GameRoom room = activeRooms.get(roomId);
        if (room == null) return;

        StringBuilder sb = new StringBuilder();
        for (char c : room.getBoard()) sb.append(c);
        String boardMsg = "BOARD " + sb.toString();

        broadcastToRoom(roomId, boardMsg);
    }

    // Broadcast message đến phòng
    private void broadcastToRoom(String roomId, String msg) throws IOException {
        GameRoom room = activeRooms.get(roomId);
        if (room == null) return;

        // Gửi cho player X
        if (room.getPlayerX() != null) {
            WebSocketSession xSession = sessions.get(room.getPlayerX().getSessionId());
            if (xSession != null && xSession.isOpen()) {
                try {
                    xSession.sendMessage(new TextMessage(msg));
                } catch (IOException e) {
                    logError("Error sending to player X", e, room.getPlayerX().getSessionId());
                }
            }
        }

        // Gửi cho player O
        if (room.getPlayerO() != null) {
            WebSocketSession oSession = sessions.get(room.getPlayerO().getSessionId());
            if (oSession != null && oSession.isOpen()) {
                try {
                    oSession.sendMessage(new TextMessage(msg));
                } catch (IOException e) {
                    logError("Error sending to player O", e, room.getPlayerO().getSessionId());
                }
            }
        }
    }

    // Log lỗi
    private void logError(String message, Exception e, String sessionId) {
        System.err.println("Error [Session: " + sessionId + "]: " + message);
        e.printStackTrace();
    }
}