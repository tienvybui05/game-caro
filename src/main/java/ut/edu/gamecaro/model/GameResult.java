package ut.edu.gamecaro.model;

public class GameResult {

    public enum ResultType {
        WIN, DRAW, CONTINUE, INVALID
    }

    private final ResultType type;
    private final char winner;      // 'X','O' hoặc '.'
    private final String message;   // dùng cho INVALID

    public GameResult(ResultType type, char winner) {
        this(type, winner, null);
    }

    public GameResult(ResultType type, char winner, String message) {
        this.type = type;
        this.winner = winner;
        this.message = message;
    }

    public ResultType getType() {
        return type;
    }

    public char getWinner() {
        return winner;
    }

    public String getMessage() {
        return message;
    }
}
