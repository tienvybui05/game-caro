package ut.edu.gamecaro.model;

import java.util.Arrays;

public class GameRoom {
    private final String roomId;
    private Player playerX;
    private Player playerO;

    private final char[] board;      // 9 ô
    private char currentTurn;        // 'X' hoặc 'O'
    private boolean finished;

    private long lastActivityAt;

    public GameRoom(String roomId) {
        this.roomId = roomId;
        this.board = new char[9];
        resetBoard();
        this.currentTurn = 'X';
        this.finished = false;
        touch();
    }

    public void touch() {
        this.lastActivityAt = System.currentTimeMillis();
    }

    public long getLastActivityAt() {
        return lastActivityAt;
    }

    public String getRoomId() {
        return roomId;
    }

    public Player getPlayerX() {
        return playerX;
    }

    public void setPlayerX(Player playerX) {
        this.playerX = playerX;
        touch();
    }

    public Player getPlayerO() {
        return playerO;
    }

    public void setPlayerO(Player playerO) {
        this.playerO = playerO;
        touch();
    }

    // ===== REMATCH: SWAP SIDES (X <-> O) =====
    public void swapSides() {
        if (playerX == null || playerO == null) return;

        Player oldX = playerX;
        Player oldO = playerO;

        // đổi symbol
        oldX.setSymbol('O');
        oldO.setSymbol('X');

        // đổi reference để invariant luôn đúng:
        // playerX luôn là người có symbol 'X', playerO luôn là người có symbol 'O'
        playerX = oldO;
        playerO = oldX;

        touch();
    }

    public char[] getBoard() {
        return board;
    }

    public void resetBoard() {
        Arrays.fill(board, '.');
        currentTurn = 'X';
        finished = false;
        touch();
    }

    public char getCurrentTurn() {
        return currentTurn;
    }

    public void setCurrentTurn(char currentTurn) {
        this.currentTurn = currentTurn;
        touch();
    }

    public void switchTurn() {
        currentTurn = (currentTurn == 'X') ? 'O' : 'X';
        touch();
    }

    public boolean isFinished() {
        return finished;
    }

    public void setFinished(boolean finished) {
        this.finished = finished;
        touch();
    }
}
