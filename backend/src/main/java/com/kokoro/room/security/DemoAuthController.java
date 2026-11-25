package com.kokoro.room.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;

@RestController
@RequestMapping("/api/auth")
@Profile("demo")
public class DemoAuthController {
    record LoginRequest(String username, String password) {}
    record LoginResponse(String token, String username, Instant expiresAt) {}

    private final DemoAccounts accounts;
    private final UserAccounts users;
    private final JwtEncoder encoder;
    private final Duration ttl;

    public DemoAuthController(DemoAccounts accounts, UserAccounts users, JwtEncoder encoder,
                              @Value("${app.security.demo.token-ttl:PT12H}") Duration ttl) {
        this.accounts = accounts;
        this.users = users;
        this.encoder = encoder;
        this.ttl = ttl;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        String username = UserAccounts.normalize(request.username());
        if (!accounts.matches(username, request.password()) && !users.matches(username, request.password())) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED,
                    "아이디 또는 비밀번호가 맞지 않아요.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(problem);
        }
        return ResponseEntity.ok(issue(username));
    }

    /** Creates an account and signs it in, so the person lands in the studio right after signing up. */
    @PostMapping("/signup")
    public ResponseEntity<LoginResponse> signup(@RequestBody LoginRequest request) {
        String username = users.register(request.username(), request.password());
        return ResponseEntity.status(HttpStatus.CREATED).body(issue(username));
    }

    private LoginResponse issue(String username) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(ttl);
        JwtClaimsSet claims = JwtClaimsSet.builder().subject(username).issuedAt(now).expiresAt(expiresAt).build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new LoginResponse(token, username, expiresAt);
    }
}
