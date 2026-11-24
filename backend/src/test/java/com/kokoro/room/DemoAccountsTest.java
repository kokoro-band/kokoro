package com.kokoro.room;

import com.kokoro.room.security.DemoAccounts;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DemoAccountsTest {
    static final String HASH = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("alice-pass");

    @Test
    void refusesToStartWithoutAccounts() {
        assertThatThrownBy(() -> new DemoAccounts("", "a".repeat(32))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void refusesShortSigningKey() {
        assertThatThrownBy(() -> new DemoAccounts("alice:" + HASH, "short")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void refusesPlainTextPasswords() {
        assertThatThrownBy(() -> new DemoAccounts("alice:plain-password", "a".repeat(32)))
                .isInstanceOf(IllegalStateException.class);
    }
}
