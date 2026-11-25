package com.kokoro.room;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.PostgreSQLContainer;

import java.sql.DriverManager;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

final class SharedPostgres {
    private static final PostgreSQLContainer<?> CONTAINER = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("postgres")
            .withUsername("kokoro")
            .withPassword("kokoro")
            .withCommand("postgres", "-c", "max_connections=200");
    private static final Set<String> CREATED = ConcurrentHashMap.newKeySet();

    private record Value(Object value) implements Supplier<Object> {
        @Override
        public Object get() {
            return value;
        }
    }

    static {
        CONTAINER.start();
    }

    private SharedPostgres() {}

    static void register(DynamicPropertyRegistry registry, String database) {
        registry.add("spring.datasource.url", new Value(jdbcUrl(database)));
        registry.add("spring.datasource.username", new Value(CONTAINER.getUsername()));
        registry.add("spring.datasource.password", new Value(CONTAINER.getPassword()));
        registry.add("spring.datasource.hikari.maximum-pool-size", new Value(5));
    }

    static String jdbcUrl(String database) {
        ensureDatabase(database);
        return "jdbc:postgresql://" + CONTAINER.getHost() + ":" + CONTAINER.getMappedPort(5432) + "/" + database;
    }

    static String username() {
        return CONTAINER.getUsername();
    }

    static String password() {
        return CONTAINER.getPassword();
    }

    private static void ensureDatabase(String database) {
        if (!database.matches("[a-z0-9_]+")) {
            throw new IllegalArgumentException("Invalid test database name: " + database);
        }
        if (!CREATED.add(database)) return;
        try (var connection = DriverManager.getConnection(
                CONTAINER.getJdbcUrl(), CONTAINER.getUsername(), CONTAINER.getPassword());
             var statement = connection.createStatement()) {
            statement.execute("CREATE DATABASE " + database);
        } catch (Exception error) {
            throw new IllegalStateException("Failed to create test database " + database, error);
        }
    }
}
