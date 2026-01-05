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

    // Map để lưu các phòng chờ
    private final Map<String, GameRoom> waitingRooms = new ConcurrentHashMap<>();

    // Map để lưu phòng đang chơi
    private final Map<String, GameRoom> activeRooms = new ConcurrentHashMap<>();

    // Map sessionId -> roomId
    private final Map<String, String> playerRoomMap = new HashMap<>();

    private final Map<String, WebSocketSession> sessions = new HashMap<>();
    private final Map<String, Player> players = new HashMap<>();

    public GameSocketHandler(GameService gameService) {
        this.gameService = gameService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        sessions.put(session.getId(), session);
        session.sendMessage(new TextMessage("WELCOME Caro 3x3 - Quick Play available"));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        String payload = message.getPayload().trim();
        String sessionId = session.getId();

        // ===== HELLO <name> =====
        if (payload.startsWith("HELLO")) {
            String name = payload.substring(5).trim();
            if (name.isEmpty()) {
                session.sendMessage(new TextMessage("ERROR Name cannot be empty"));
                return;
            }

            Player player = new Player(sessionId, name, '?'); // Symbol sẽ set sau
            players.put(sessionId, player);
            session.sendMessage(new TextMessage("HELLO_OK Hello " + name));
            return;
        }

        // ===== QUICKPLAY =====
        if (payload.equals("QUICKPLAY")) {
            handleQuickPlay(session, sessionId);
            return;
        }

        // ===== CLICK <index> =====
        if (payload.startsWith("CLICK")) {
            handleClick(session, sessionId, payload);
            return;
        }

        // ===== LEAVE =====
        if (payload.equals("LEAVE")) {
            handleLeave(sessionId);
            return;
        }
    }

    // Xử lý CLICK mới
    private void handleClick(WebSocketSession session, String sessionId, String payload) throws IOException {
        Player player = players.get(sessionId);
        if (player == null) return;

        String roomId = playerRoomMap.get(sessionId);
        if (roomId == null) {
            session.sendMessage(new TextMessage("ERROR You are not in a room"));
            return;
        }

        // Kiểm tra room trong activeRooms (đã có đủ 2 người)
        GameRoom room = activeRooms.get(roomId);
        if (room == null) {
            session.sendMessage(new TextMessage("ERROR Waiting for opponent to join"));
            return;
        }

        int index;
        try {
            index = Integer.parseInt(payload.split(" ")[1]);
        } catch (Exception e) {
            session.sendMessage(new TextMessage("ERROR Invalid move"));
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
            if (room.getPlayerO() == null) { // Còn chỗ cho player O
                availableRoom = room;
                availableRoomId = entry.getKey();
                break;
            }
        }

        if (availableRoom != null) {
            // Join vào phòng có sẵn
            joinExistingRoom(session, sessionId, player, availableRoomId, availableRoom);
        } else {
            // Tạo phòng chờ mới
            createNewWaitingRoom(session, sessionId, player);
        }
    }

    // Tạo phòng chờ mới
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

    // Join vào phòng có sẵn
    private void joinExistingRoom(WebSocketSession session, String sessionId,
                                  Player player, String roomId, GameRoom room) throws IOException {
        Player oPlayer = new Player(sessionId, player.getName(), 'O');
        players.put(sessionId, oPlayer);
        room.setPlayerO(oPlayer);

        // Chuyển từ waitingRooms sang activeRooms
        waitingRooms.remove(roomId);
        activeRooms.put(roomId, room);

        playerRoomMap.put(sessionId, roomId);

        // Thông báo cho player O
        session.sendMessage(new TextMessage("YOU_ARE O"));
        session.sendMessage(new TextMessage("MATCHED roomId=" + roomId + " vs=" + room.getPlayerX().getName()));

        // Thông báo cho player X
        WebSocketSession xSession = sessions.get(room.getPlayerX().getSessionId());
        if (xSession != null && xSession.isOpen()) {
            xSession.sendMessage(new TextMessage("MATCHED roomId=" + roomId + " vs=" + player.getName()));
            xSession.sendMessage(new TextMessage("STATUS Game started! Your turn (X)"));
        }

        session.sendMessage(new TextMessage("STATUS Game started! Opponent's turn (X)"));

        // Gửi board trống cho cả 2
        sendBoardToRoom(roomId);
    }

    // Xử lý rời phòng
    private void handleLeave(String sessionId) throws IOException {
        String roomId = playerRoomMap.get(sessionId);
        if (roomId != null) {
            // Xóa khỏi waitingRooms
            waitingRooms.remove(roomId);

            // Thông báo cho đối thủ nếu đang trong activeRooms
            GameRoom room = activeRooms.get(roomId);
            if (room != null) {
                Player leaver = players.get(sessionId);
                Player opponent = (leaver.getSymbol() == 'X') ? room.getPlayerO() : room.getPlayerX();

                if (opponent != null) {
                    WebSocketSession opponentSession = sessions.get(opponent.getSessionId());
                    if (opponentSession != null && opponentSession.isOpen()) {
                        opponentSession.sendMessage(new TextMessage("OPPONENT_LEFT"));
                    }
                }

                activeRooms.remove(roomId);
            }

            playerRoomMap.remove(sessionId);

            WebSocketSession session = sessions.get(sessionId);
            if (session != null && session.isOpen()) {
                session.sendMessage(new TextMessage("LEFT_ROOM"));
                session.sendMessage(new TextMessage("STATUS You left the room"));
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = session.getId();

        // Xử lý rời phòng khi disconnect
        String roomId = playerRoomMap.get(sessionId);
        if (roomId != null) {
            waitingRooms.remove(roomId);
            activeRooms.remove(roomId);
        }

        playerRoomMap.remove(sessionId);
        sessions.remove(sessionId);
        players.remove(sessionId);
    }

    // ===== Helper Methods =====

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
                xSession.sendMessage(new TextMessage(msg));
            }
        }

        // Gửi cho player O
        if (room.getPlayerO() != null) {
            WebSocketSession oSession = sessions.get(room.getPlayerO().getSessionId());
            if (oSession != null && oSession.isOpen()) {
                oSession.sendMessage(new TextMessage(msg));
            }
        }
    }
}