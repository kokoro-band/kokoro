package com.kokoro.room.project;

import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

/** Reviewed seed data, not a live shop crawl. Model dimensions are example footprints. */
@Repository
@DependsOn("flyway")
public class FurnitureRegistry {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final JsonNode metadata;

    public FurnitureRegistry(JdbcTemplate jdbc, ObjectMapper mapper, TransactionTemplate transactions) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        JsonNode catalog = resource("furniture-catalog.json");
        FurnitureCatalog.parse(catalog.toString());
        metadata = catalog.path("source");
        JsonNode sources = resource("furniture-source-assets.json");
        for (JsonNode item : catalog.path("items")) {
            JsonNode provenance = item.path("provenance");
            boolean verified = false;
            for (JsonNode asset : sources.path("items")) {
                if (asset.path("assetName").equals(provenance.path("modelAsset"))
                        && asset.path("sha256").equals(provenance.path("modelSha256"))) verified = true;
            }
            if (!verified || !"example".equals(provenance.path("dimensionKind").asString())
                    || !"example".equals(provenance.path("priceKind").asString())
                    || !"CC0-1.0".equals(provenance.path("license").asString())) {
                throw new IllegalStateException("가구 출처를 검증하지 못했습니다: " + item.path("id").asString());
            }
        }
        transactions.executeWithoutResult(status -> {
            for (JsonNode asset : sources.path("items")) {
                jdbc.update("""
                        INSERT INTO furniture_source_assets(asset_name, payload) VALUES (?, ?::jsonb)
                        ON CONFLICT (asset_name) DO UPDATE SET payload = EXCLUDED.payload
                        WHERE furniture_source_assets.payload IS DISTINCT FROM EXCLUDED.payload
                        """, asset.path("assetName").asString(), asset.toString());
            }
            for (JsonNode item : catalog.path("items")) {
                jdbc.update("""
                        INSERT INTO furniture_catalog(id, payload) VALUES (?, ?::jsonb)
                        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
                        WHERE furniture_catalog.payload IS DISTINCT FROM EXCLUDED.payload
                        """, item.path("id").asString(), item.toString());
            }
        });
    }

    public Map<String, Object> catalog() {
        return Map.of("version", 1, "unit", "m", "dimensionKind", "example", "priceKind", "example",
                "currency", "KRW", "source", metadata, "items", items(), "sourceAssetCount",
                jdbc.queryForObject("SELECT COUNT(*) FROM furniture_source_assets", Integer.class));
    }

    public List<JsonNode> items() {
        return jdbc.query("SELECT payload::text FROM furniture_catalog ORDER BY id",
                (rs, index) -> mapper.readTree(rs.getString(1)));
    }

    public JsonNode require(String id) {
        return jdbc.query("SELECT payload::text FROM furniture_catalog WHERE id = ?",
                        (rs, index) -> mapper.readTree(rs.getString(1)), id).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "지원하지 않는 가구입니다: " + id));
    }

    private JsonNode resource(String name) {
        try (var input = FurnitureRegistry.class.getResourceAsStream("/contracts/" + name)) {
            if (input == null) throw new IllegalStateException("가구 계약 파일이 없습니다: " + name);
            return mapper.readTree(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException error) {
            throw new IllegalStateException("가구 계약 파일을 읽지 못했습니다.", error);
        }
    }
}
