package com.kokoro.room.security;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/** Demo accounts from configuration: "name:bcryptHash,name2:bcryptHash". */
public class DemoAccounts {
    private static final int MIN_KEY_BYTES = 32;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    // Compared against for unknown names so both failures take similar time.
    private final String unknownHash = encoder.encode(java.util.UUID.randomUUID().toString());
    private final Map<String, String> hashes = new LinkedHashMap<>();
    private final SecretKey signingKey;

    public DemoAccounts(String accounts, String signingKey) {
        if (accounts == null || accounts.isBlank())
            throw new IllegalStateException("app.security.demo.accounts가 비어 있습니다.");
        for (String entry : accounts.split(",")) {
            int split = entry.indexOf(':');
            String name = split < 0 ? "" : entry.substring(0, split).trim();
            String hash = split < 0 ? "" : entry.substring(split + 1).trim();
            if (name.isEmpty() || !hash.matches("\\$2[aby]\\$\\d{2}\\$.{53}"))
                throw new IllegalStateException("데모 계정은 이름:bcrypt해시 형식이어야 합니다.");
            hashes.put(name, hash);
        }
        byte[] key = signingKey == null ? new byte[0] : signingKey.getBytes(StandardCharsets.UTF_8);
        if (key.length < MIN_KEY_BYTES)
            throw new IllegalStateException("app.security.demo.jwt-secret은 32바이트 이상이어야 합니다.");
        this.signingKey = new SecretKeySpec(key, "HmacSHA256");
    }

    public boolean matches(String username, String password) {
        if (username == null || password == null) return false;
        String hash = hashes.get(username);
        boolean matched = encoder.matches(password, hash == null ? unknownHash : hash);
        return hash != null && matched;
    }

    public SecretKey signingKey() {
        return signingKey;
    }
}
