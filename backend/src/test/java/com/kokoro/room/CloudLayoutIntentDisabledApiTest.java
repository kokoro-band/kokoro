package com.kokoro.room;

import com.kokoro.room.project.FurnitureRegistry;
import com.kokoro.room.project.ProjectService;
import com.kokoro.room.security.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(properties = "app.ai.api-key=")
@ComponentScan(basePackages = "com.kokoro.room.ai")
@Import(SecurityConfig.class)
@EnableWebSecurity
@AutoConfigureMockMvc
class CloudLayoutIntentDisabledApiTest {
    @MockitoBean ProjectService projects;
    @MockitoBean FurnitureRegistry furnitureRegistry;
    @Autowired MockMvc mvc;

    @Test void absentKeyReturnsConfigurationErrorWithoutChangingProjects() throws Exception {
        mvc.perform(post("/api/ai/layout-intent").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"화분 놔줘\",\"furniture\":[]}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value("외부 AI가 설정되지 않았어요. 서버의 API 키 설정을 확인해 주세요."));
        verifyNoInteractions(projects);
    }
}
