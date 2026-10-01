package com.kokoro.room;

import com.kokoro.room.project.LocalLayoutIntent;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Runs the shared contract fixtures; requires the full repository checkout, like the furniture catalog. */
class LocalLayoutIntentTest {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    @Test
    void acceptsEveryValidFixtureAndRejectsEveryInvalidOne() throws IOException {
        JsonNode fixtures = MAPPER.readTree(Files.readString(
                Path.of("..", "docs", "contracts", "fixtures", "local-layout-intent.json"), StandardCharsets.UTF_8));
        assertThat(fixtures.path("valid")).hasSize(8);
        assertThat(fixtures.path("invalid")).hasSize(13);
        for (JsonNode valid : fixtures.path("valid")) {
            assertThat(LocalLayoutIntent.parse(valid.path("intent"))).as(valid.path("id").asString()).isNotEmpty();
        }
        for (JsonNode invalid : fixtures.path("invalid")) {
            assertThatThrownBy(() -> LocalLayoutIntent.parse(invalid.path("intent")))
                    .as(invalid.path("id").asString()).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        }
    }

    @Test
    void parsesFieldsIntoIntents() {
        var intents = LocalLayoutIntent.parse(MAPPER.readTree("""
                {"version":1,"intents":[{"type":"ADD","catalogId":"chair-shell","count":2},
                {"type":"ROTATE","targetQuery":"의자","rotation":45.5}]}
                """));
        assertThat(intents.get(0).count()).isEqualTo(2);
        assertThat(intents.get(0).catalogId()).isEqualTo("chair-shell");
        assertThat(intents.get(1).rotation()).isEqualTo(45.5);
        assertThat(intents.get(1).targetQuery()).isEqualTo("의자");
    }

    @Test
    void relationDefaultsToNearWhenAnAnchorIsGiven() {
        var intents = LocalLayoutIntent.parse(MAPPER.readTree("""
                {"version":1,"intents":[{"type":"ADD","catalogId":"plant-olive","anchorQuery":"문","relation":"FAR_FROM"},
                {"type":"MOVE","targetQuery":"소파","anchorQuery":"창문"},
                {"type":"REMOVE","targetQuery":"의자"}]}
                """));
        assertThat(intents.get(0).relation()).isEqualTo(LocalLayoutIntent.Relation.FAR_FROM);
        assertThat(intents.get(1).relation()).isEqualTo(LocalLayoutIntent.Relation.NEAR);
        assertThat(intents.get(2).relation()).isNull();
    }
}
