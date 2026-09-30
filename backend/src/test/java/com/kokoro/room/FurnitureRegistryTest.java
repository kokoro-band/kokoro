package com.kokoro.room;

import com.kokoro.room.project.FurnitureRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FurnitureRegistryTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("kokoro").withUsername("kokoro").withPassword("kokoro");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired FurnitureRegistry registry;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @Autowired TransactionTemplate transactions;

    @Test
    void exposesEightCompleteEntriesAndTheirSourceInventory() throws Exception {
        mvc.perform(get("/api/furniture-catalog"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(8)))
                .andExpect(jsonPath("$.sourceAssetCount").value(140))
                .andExpect(jsonPath("$.priceKind").value("example"))
                .andExpect(jsonPath("$.dimensionKind").value("example"))
                .andExpect(jsonPath("$.source.license").value("CC0-1.0"));
        for (var item : registry.items()) {
            assertThat(item.path("name").asString()).isNotBlank();
            assertThat(item.path("width").doubleValue()).isPositive();
            assertThat(item.path("depth").doubleValue()).isPositive();
            assertThat(item.path("provenance").path("modelSha256").asString()).hasSize(64);
            assertThat(item.path("provenance").path("priceKind").asString()).isEqualTo("example");
            assertThat(item.path("provenance").path("dimensionKind").asString()).isEqualTo("example");
        }
        assertThatThrownBy(() -> registry.require("invented-sofa")).hasMessageContaining("지원하지 않는 가구");
    }

    @Test
    void reloadUsesPersistedRowsWithoutDuplicatingOrChangingImportTimestamps() {
        var before = jdbc.queryForList("SELECT id, payload::text, imported_at FROM furniture_catalog ORDER BY id");
        var reloaded = new FurnitureRegistry(jdbc, mapper, transactions);
        assertThat(reloaded.items()).isEqualTo(registry.items());
        assertThat(jdbc.queryForList("SELECT id, payload::text, imported_at FROM furniture_catalog ORDER BY id"))
                .isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM furniture_source_assets", Integer.class)).isEqualTo(140);
    }
}
