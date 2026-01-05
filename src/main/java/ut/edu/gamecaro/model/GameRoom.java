package ut.edu.gamecaro.model;

import java.util.Arrays;

public class GameRoom {
    private String roomId;
    private Player playerX;
    private Player playerO;
    private char[] board; // 9 ô
    private char currentTurn; // 'X' hoặc 'O'
    private boolean finished;

    public GameRoom(String roomId) {
        this.roomId = roomId;
        this.board = new char[9];
        resetBoard();
    }

    public void resetBoard() {
        Arrays.fill(board, '.');
        currentTurn = 'X';
        finished = false;
    }

    public String getRoomId() {
        return roomId;
    }

    public Player getPlayerX() {
        return playerX;
    }

    public Player getPlayerO() {
        return playerO;
    }

    public void setPlayerX(Player playerX) {
        this.playerX = playerX;
    }

    public void setPlayerO(Player playerO) {
        this.playerO = playerO;
    }

    public char[] getBoard() {
        return board;
    }

    public char getCurrentTurn() {
        return currentTurn;
    }

    public void switchTurn() {
        currentTurn = (currentTurn == 'X') ? 'O' : 'X';
    }

    public boolean isFinished() {
        return finished;
    }

    public void setFinished(boolean finished) {
        this.finished = finished;
    }
}