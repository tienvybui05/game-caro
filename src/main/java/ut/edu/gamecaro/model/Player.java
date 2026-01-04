package ut.edu.gamecaro.model;

public class Player {

    private String sessionId; // định danh client (WebSocket session)
    private String name;
    private char symbol; // 'X' hoặc 'O'

    public Player(String sessionId, String name, char symbol) {
        this.sessionId = sessionId;
        this.name = name;
        this.symbol = symbol;
    }

    public String getSessionId() {
        return sessionId;
    }

    public String getName() {
        return name;
    }

    public char getSymbol() {
        return symbol;
    }

    public void setName(String name) {
        this.name = name;
    }
}