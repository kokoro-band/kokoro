package com.kokoro.room.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;

@Component
public class CurrentUser {
    private final String localUser;

    public CurrentUser(@Value("${app.security.local-user:local-user}") String localUser) {
        this.localUser = localUser;
    }

    public String id() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || "anonymousUser".equals(authentication.getName())) return localUser;
        return authentication.getName();
    }
}
