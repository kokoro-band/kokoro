package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FloorPlan;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.RenovationProject;
import com.kokoro.room.project.ProjectModels.RoomModel;
import tools.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
@DependsOn("flyway")
public class JdbcProjectRepository implements ProjectRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public JdbcProjectRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Override
    public List<RenovationProject> findAll() {
        Map<String, RenovationProject> projects = new LinkedHashMap<>();
        jdbc.query("""
                SELECT id, owner_id, name, room_type, width, depth, height, room,
                       floor_plan_file_name, floor_plan_size, floor_plan_status,
                       floor_plan_progress, floor_plan_uploaded_at, floor_plan_job_id,
                       floor_plan_object_key, floor_plan_error_code, floor_plan_error_message,
                       floor_plan_retryable, updated_at
                  FROM projects ORDER BY updated_at DESC
                """, (rs, rowNum) -> mapProject(rs))
                .forEach(project -> projects.put(project.id(), project));
        projects.values().forEach(project -> replaceFurniture(project));
        return new ArrayList<>(projects.values());
    }

    @Override
    public Optional<RenovationProject> findById(String id) {
        List<RenovationProject> projects = jdbc.query("""
                SELECT id, owner_id, name, room_type, width, depth, height, room,
                       floor_plan_file_name, floor_plan_size, floor_plan_status,
                       floor_plan_progress, floor_plan_uploaded_at, floor_plan_job_id,
                       floor_plan_object_key, floor_plan_error_code, floor_plan_error_message,
                       floor_plan_retryable, updated_at
                  FROM projects WHERE id = ?
                """, (rs, rowNum) -> mapProject(rs), id);
        if (projects.isEmpty()) return Optional.empty();
        RenovationProject project = projects.get(0);
        return Optional.of(replaceFurniture(project));
    }

    @Override
    public void insert(RenovationProject project) {
        jdbc.update("""
                INSERT INTO projects (
                    id, owner_id, name, room_type, width, depth, height, room,
                    floor_plan_file_name, floor_plan_size, floor_plan_status,
                    floor_plan_progress, floor_plan_uploaded_at, floor_plan_job_id,
                    floor_plan_object_key, floor_plan_error_code, floor_plan_error_message,
                    floor_plan_retryable, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, project.id(), project.ownerId(), project.name(), project.roomType(),
                project.dimensions().width(), project.dimensions().depth(), project.dimensions().height(),
                writeRoom(project.room()),
                project.floorPlan().fileName(), project.floorPlan().size(), project.floorPlan().status().name(),
                project.floorPlan().progress(), timestamp(project.floorPlan().uploadedAt()), project.floorPlan().jobId(),
                project.floorPlan().objectKey(), project.floorPlan().errorCode(), project.floorPlan().errorMessage(),
                project.floorPlan().retryable(), timestamp(project.updatedAt()));
        insertFurniture(project);
    }

    @Override
    public void replace(RenovationProject project) {
        jdbc.update("DELETE FROM furniture_items WHERE project_id = ?", project.id());
                jdbc.update("""
                UPDATE projects
                   SET owner_id = ?, name = ?, room_type = ?, width = ?, depth = ?, height = ?, room = ?::jsonb,
                       floor_plan_file_name = ?, floor_plan_size = ?, floor_plan_status = ?,
                       floor_plan_progress = ?, floor_plan_uploaded_at = ?, floor_plan_job_id = ?,
                       floor_plan_object_key = ?, floor_plan_error_code = ?, floor_plan_error_message = ?,
                       floor_plan_retryable = ?, updated_at = ?
                 WHERE id = ?
                """, project.ownerId(), project.name(), project.roomType(),
                project.dimensions().width(), project.dimensions().depth(), project.dimensions().height(),
                writeRoom(project.room()), project.floorPlan().fileName(), project.floorPlan().size(), project.floorPlan().status().name(),
                project.floorPlan().progress(), timestamp(project.floorPlan().uploadedAt()), project.floorPlan().jobId(),
                project.floorPlan().objectKey(), project.floorPlan().errorCode(), project.floorPlan().errorMessage(),
                project.floorPlan().retryable(), timestamp(project.updatedAt()),
                project.id());
        insertFurniture(project);
    }

    @Override
    public void delete(String id) {
        jdbc.update("DELETE FROM projects WHERE id = ?", id);
    }

    private RenovationProject replaceFurniture(RenovationProject project) {
        List<FurnitureItem> furniture = jdbc.query("""
                SELECT id, catalog_id, name, category, x, z, rotation, color
                  FROM furniture_items WHERE project_id = ? ORDER BY item_order, id
                """, (rs, rowNum) -> new FurnitureItem(
                rs.getString("id"), rs.getString("catalog_id"), rs.getString("name"),
                rs.getString("category"), rs.getDouble("x"), rs.getDouble("z"),
                rs.getInt("rotation"), rs.getString("color")), project.id());
        project.furniture().clear();
        project.furniture().addAll(furniture);
        return project;
    }

    private void insertFurniture(RenovationProject project) {
        for (int index = 0; index < project.furniture().size(); index++) {
            FurnitureItem item = project.furniture().get(index);
            jdbc.update("""
                    INSERT INTO furniture_items (
                        project_id, id, catalog_id, name, category, x, z, rotation, color, item_order
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, project.id(), item.id(), item.catalogId(), item.name(), item.category(),
                    item.x(), item.z(), item.rotation(), item.color(), index);
        }
    }

    private RenovationProject mapProject(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new RenovationProject(
                rs.getString("id"), rs.getString("owner_id"), rs.getString("name"), rs.getString("room_type"),
                new Dimensions(rs.getDouble("width"), rs.getDouble("depth"), rs.getDouble("height")),
                readRoom(rs.getString("room")),
                new FloorPlan(rs.getString("floor_plan_file_name"), rs.getLong("floor_plan_size"),
                        ConversionStatus.valueOf(rs.getString("floor_plan_status")), rs.getInt("floor_plan_progress"),
                        instant(rs.getTimestamp("floor_plan_uploaded_at")), rs.getString("floor_plan_job_id"),
                        rs.getString("floor_plan_object_key"), rs.getString("floor_plan_error_code"),
                        rs.getString("floor_plan_error_message"), rs.getBoolean("floor_plan_retryable")),
                new ArrayList<>(), instant(rs.getTimestamp("updated_at")));
    }

    private String writeRoom(RoomModel room) {
        if (room == null) return null;
        return objectMapper.writeValueAsString(room);
    }

    private RoomModel readRoom(String json) {
        if (json == null || json.isBlank()) return null;
        return StoredRoomJson.read(objectMapper, json);
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }
}
