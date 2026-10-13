package com.kokoro.room.ai;

import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/ai")
public class CloudLayoutIntentController {
    private final CloudLayoutIntentService service;
    public CloudLayoutIntentController(CloudLayoutIntentService service) { this.service = service; }
    @PostMapping("/layout-intent")
    public JsonNode interpret(@RequestBody JsonNode request) { return service.interpret(request); }
}
