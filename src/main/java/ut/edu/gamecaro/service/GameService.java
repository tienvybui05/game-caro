package ut.edu.gamecaro.service;

import org.springframework.stereotype.Service;
import ut.edu.gamecaro.model.GameResult;
import ut.edu.gamecaro.model.GameRoom;

@Service
public class GameService {

    public GameResult makeMove(GameRoom room, int index, char symbol) {
        synchronized (room) {
            if (room.isFinished()) {
                return new GameResult(GameResult.ResultType.INVALID, '.', "Game already finished");
            }

            if (symbol != 'X' && symbol != 'O') {
                return new GameResult(GameResult.ResultType.INVALID, '.', "Invalid symbol");
            }

            if (index < 0 || index >= 9) {
                return new GameResult(GameResult.ResultType.INVALID, '.', "Index out of range");
            }

            if (room.getCurrentTurn() != symbol) {
                return new GameResult(GameResult.ResultType.INVALID, '.', "Not your turn");
            }

            if (room.getBoard()[index] != '.') {
                return new GameResult(GameResult.ResultType.INVALID, '.', "Cell already occupied");
            }

            room.getBoard()[index] = symbol;
            room.touch();

            if (checkWin(room.getBoard(), symbol)) {
                room.setFinished(true);
                return new GameResult(GameResult.ResultType.WIN, symbol);
            }

            if (isDraw(room.getBoard())) {
                room.setFinished(true);
                return new GameResult(GameResult.ResultType.DRAW, '.');
            }

            room.switchTurn();
            return new GameResult(GameResult.ResultType.CONTINUE, '.');
        }
    }

    private boolean checkWin(char[] b, char s) {
        // rows
        if (b[0] == s && b[1] == s && b[2] == s) return true;
        if (b[3] == s && b[4] == s && b[5] == s) return true;
        if (b[6] == s && b[7] == s && b[8] == s) return true;

        // cols
        if (b[0] == s && b[3] == s && b[6] == s) return true;
        if (b[1] == s && b[4] == s && b[7] == s) return true;
        if (b[2] == s && b[5] == s && b[8] == s) return true;

        // diagonals
        if (b[0] == s && b[4] == s && b[8] == s) return true;
        if (b[2] == s && b[4] == s && b[6] == s) return true;

        return false;
    }

    private boolean isDraw(char[] b) {
        for (char c : b) {
            if (c == '.') return false;
        }
        return true;
    }

    public void reset(GameRoom room) {
        synchronized (room) {
            room.resetBoard();       // set '.' + turn X + finished false
        }
    }
}
