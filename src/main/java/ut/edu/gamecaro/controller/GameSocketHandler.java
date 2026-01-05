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

    public GameSocketHandler(GameService gameService) {
        this.gameService = gameService;
    }
// THÊM: Map để lưu các phòng chờ
    private final Map<String, GameRoom> waitingRooms = new ConcurrentHashMap<>();

    // THÊM: Map để lưu phòng đang chơi
    private final Map<String, GameRoom> activeRooms = new ConcurrentHashMap<>();

    // THÊM: Map sessionId -> roomId
    private final Map<String, String> playerRoomMap = new HashMap<>();
    // Chỉ 1 game duy nhất (caro cơ bản)
    private final GameRoom gameRoom = new GameRoom("ROOM_1");

    // sessionId -> WebSocketSession
    private final Map<String, WebSocketSession> sessions = new HashMap<>();

    // sessionId -> Player
    private final Map<String, Player> players = new HashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        sessions.put(session.getId(), session);
        session.sendMessage(new TextMessage("WELCOME Caro 3x3"));
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

        // ===== CLICK <index> =====
        if (payload.startsWith("CLICK")) {

            Player player = players.get(sessionId);
            if (player == null) return;

            int index;
            try {
                index = Integer.parseInt(payload.split(" ")[1]);
            } catch (Exception e) {
                return;
            }

            GameResult result =
                    gameService.makeMove(gameRoom, index, player.getSymbol());

            sendBoard();

            if (result.getType() == GameResult.ResultType.WIN) {
                broadcast("GAME_OVER winner=" + result.getWinner());
            }

            if (result.getType() == GameResult.ResultType.DRAW) {
                broadcast("GAME_OVER winner=DRAW");
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        players.remove(session.getId());
        gameRoom.resetBoard();
    }

    // ===== Helpers =====

    private void sendBoard() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (char c : gameRoom.getBoard()) sb.append(c);
        broadcast("BOARD " + sb);
    }

    private void broadcast(String msg) throws IOException {
        for (WebSocketSession s : sessions.values()) {
            if (s.isOpen()) {
                s.sendMessage(new TextMessage(msg));
            }
        }
    }
    // THÊM: Phương thức tạo phòng chờ
    private String createWaitingRoom(Player player, String sessionId) throws IOException {
        String roomId = "QUICK_" + System.currentTimeMillis() % 10000;
        GameRoom room = new GameRoom(roomId);

        // Set player là X (người chơi đầu tiên)
        Player xPlayer = new Player(sessionId, player.getName(), 'X');
        players.put(sessionId, xPlayer);
        room.setPlayerX(xPlayer);

        waitingRooms.put(roomId, room);
        playerRoomMap.put(sessionId, roomId);

        return roomId;
    }
}