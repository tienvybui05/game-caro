package ut.edu.gamecaro.model;

public class MoveMessage {

    private String roomId;
    private int index; // 0 → 8
    private char symbol;

    public MoveMessage(String roomId, int index, char symbol) {
        this.roomId = roomId;
        this.index = index;
        this.symbol = symbol;
    }

    public String getRoomId() {
        return roomId;
    }

    public int getIndex() {
        return index;
    }

    public char getSymbol() {
        return symbol;
    }
}