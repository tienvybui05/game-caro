package ut.edu.gamecaro.model;

public class GameResult {

    public enum ResultType {
        WIN, DRAW, NONE
    }

    private ResultType type;
    private char winner; // 'X', 'O' hoặc '.'

    public GameResult(ResultType type, char winner) {
        this.type = type;
        this.winner = winner;
    }

    public ResultType getType() {
        return type;
    }

    public char getWinner() {
        return winner;
    }
}