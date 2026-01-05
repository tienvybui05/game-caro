package ut.edu.gamecaro;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class GameCaroApplication {
    public static void main(String[] args) {
        SpringApplication.run(GameCaroApplication.class, args);
        System.out.println("Game Caro WebSocket Server running...");
    }
}
