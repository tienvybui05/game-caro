package ut.edu.gamecaro.model;

import org.springframework.web.socket.WebSocketSession;

public class Player {

    private String sessionId; // WebSocket session
    private String name;
    private char symbol; // 'X' hoặc 'O'

    private WebSocketSession session;
    public Player(String sessionId, String name, char symbol, WebSocketSession session) {
        this.sessionId = sessionId;
        this.name = name;
        this.symbol = symbol;
        this.session = session;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getName() {
        return name;
    }

    public char getSymbol() {
        return symbol;
    }

    public void setSymbol(char symbol) {
        this.symbol = symbol;
    }

    public void setName(String name) {
        this.name = name;
    }

    public WebSocketSession getSession() {
        return session;
    }
}
