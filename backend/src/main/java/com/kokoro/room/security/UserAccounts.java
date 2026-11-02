package com.kokoro.room.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/** Accounts people create through the demo sign-up, stored with bcrypt hashes. */
@Component
@Profile("demo")
public class UserAccounts {
    private static final Pattern USERNAME = Pattern.compile("^[a-z0-9_-]{3,32}$");
    private static final int MIN_PASSWORD_CHARS = 8;
    // bcrypt reads only the first 72 bytes, so a longer password would silently match its own prefix.
    private static final int MAX_PASSWORD_BYTES = 72;

    private final JdbcTemplate jdbc;
    private final DemoAccounts demoAccounts;
    private final int maxUsers;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    // Compared against for unknown names so a missing account takes about as long as a wrong password.
    private final String unknownHash = encoder.encode(UUID.randomUUID().toString());

    public UserAccounts(JdbcTemplate jdbc, DemoAccounts demoAccounts,
                        @Value("${app.security.demo.max-users:200}") int maxUsers) {
        this.jdbc = jdbc;
        this.demoAccounts = demoAccounts;
        this.maxUsers = maxUsers;
    }

    public static String normalize(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    /** Creates the account and returns its normalized username. */
    public String register(String rawUsername, String password) {
        String username = normalize(rawUsername);
        if (!USERNAME.matcher(username).matches())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "아이디는 영문과 숫자, 밑줄, 하이픈으로 3~32자여야 해요.");
        if (password == null || password.length() < MIN_PASSWORD_CHARS
                || password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비밀번호는 8자 이상이어야 하고 너무 길 수 없어요.");
        if (demoAccounts.has(username))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 아이디예요.");
        Integer count = jdbc.queryForObject("SELECT count(*) FROM app_users", Integer.class);
        if (count != null && count >= maxUsers)
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "가입 가능한 계정이 가득 찼어요. 시연 계정으로 로그인해 주세요.");
        try {
            jdbc.update("INSERT INTO app_users (username, password_hash) VALUES (?, ?)", username, encoder.encode(password));
        } catch (DuplicateKeyException taken) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 아이디예요.");
        }
        return username;
    }

    public boolean matches(String rawUsername, String password) {
        if (password == null) return false;
        List<String> hashes = jdbc.queryForList("SELECT password_hash FROM app_users WHERE username = ?",
                String.class, normalize(rawUsername));
        boolean matched = encoder.matches(password, hashes.isEmpty() ? unknownHash : hashes.get(0));
        return !hashes.isEmpty() && matched;
    }
}
