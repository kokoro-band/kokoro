package com.kokoro.room.project;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/furniture-catalog")
public class FurnitureCatalogController {
    private final FurnitureRegistry registry;

    public FurnitureCatalogController(FurnitureRegistry registry) {
        this.registry = registry;
    }

    @GetMapping
    public Map<String, Object> catalog() {
        return registry.catalog();
    }
}
