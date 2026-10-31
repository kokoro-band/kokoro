package com.kokoro.room.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
    @Bean
    @Profile("local")
    SecurityFilterChain localSecurity(HttpSecurity http) throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .httpBasic(basic -> basic.disable())
                .build();
    }

    @Bean
    @Profile("prod")
    SecurityFilterChain productionSecurity(HttpSecurity http) throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth.requestMatchers("/api/health", "/actuator/health").permitAll().anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> {}))
                .build();
    }

    @Bean
    @Profile("demo")
    DemoAccounts demoAccounts(@Value("${app.security.demo.accounts:}") String accounts,
                              @Value("${app.security.demo.jwt-secret:}") String signingKey) {
        return new DemoAccounts(accounts, signingKey);
    }

    @Bean
    @Profile("demo")
    JwtDecoder demoJwtDecoder(DemoAccounts accounts) {
        return NimbusJwtDecoder.withSecretKey(accounts.signingKey()).macAlgorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    @Profile("demo")
    JwtEncoder demoJwtEncoder(DemoAccounts accounts) {
        return NimbusJwtEncoder.withSecretKey(accounts.signingKey()).build();
    }

    @Bean
    @Profile("demo")
    SecurityFilterChain demoSecurity(HttpSecurity http) throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/health", "/actuator/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults()))
                .build();
    }
}
