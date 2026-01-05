package ut.edu.gamecaro.service;

import org.springframework.stereotype.Service;
import ut.edu.gamecaro.model.GameResult;
import ut.edu.gamecaro.model.GameRoom;

@Service
public class GameService {
    public GameResult makeMove(GameRoom room, int index, char symbol) {
        // Game đã kết thúc
        if (room.isFinished()) {
            return new GameResult(GameResult.ResultType.NONE, '.');
        }

        // Không đúng lượt
        if (room.getCurrentTurn() != symbol) {
            return new GameResult(GameResult.ResultType.NONE, '.');
        }

        // Index không hợp lệ
        if (index < 0 || index > 8) {
            return new GameResult(GameResult.ResultType.NONE, '.');
        }

        char[] board = room.getBoard();

        // Ô đã đánh
        if (board[index] != '.') {
            return new GameResult(GameResult.ResultType.NONE, '.');
        }

        // Đánh cờ
        board[index] = symbol;

        // Kiểm tra thắng
        if (checkWin(board, symbol)) {
            room.setFinished(true);
            return new GameResult(GameResult.ResultType.WIN, symbol);
        }

        // Kiểm tra hòa
        if (isDraw(board)) {
            room.setFinished(true);
            return new GameResult(GameResult.ResultType.DRAW, '.');
        }

        // Chưa kết thúc → đổi lượt
        room.switchTurn();
        return new GameResult(GameResult.ResultType.NONE, '.');
    }

    /**
     * Kiểm tra thắng
     */
    public boolean checkWin(char[] board, char symbol) {
        int[][] winPatterns = {
                {0, 1, 2}, {3, 4, 5}, {6, 7, 8}, // hàng
                {0, 3, 6}, {1, 4, 7}, {2, 5, 8}, // cột
                {0, 4, 8}, {2, 4, 6}             // chéo
        };

        for (int[] pattern : winPatterns) {
            if (board[pattern[0]] == symbol &&
                    board[pattern[1]] == symbol &&
                    board[pattern[2]] == symbol) {
                return true;
            }
        }
        return false;
    }

    /**
     * Kiểm tra hòa
     */
    public boolean isDraw(char[] board) {
        for (char c : board) {
            if (c == '.') {
                return false;
            }
        }
        return true;
    }

    /**
     * Reset game
     */
    public void reset(GameRoom room) {
        room.resetBoard();
        room.setFinished(false);
    }
}