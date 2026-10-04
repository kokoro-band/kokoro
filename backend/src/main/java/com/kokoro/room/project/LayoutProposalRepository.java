package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.LayoutCommand;
import com.kokoro.room.project.ProjectModels.LayoutProposal;
import tools.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@Repository
@DependsOn("flyway")
public class LayoutProposalRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public LayoutProposalRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public void insert(LayoutProposal proposal) {
        jdbc.update("""
                INSERT INTO layout_proposals (
                    proposal_id, project_id, owner_id, base_updated_at, base_revision, commands, created_at, expires_at, consumed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, proposal.proposalId(), proposal.projectId(), proposal.ownerId(),
                timestamp(proposal.baseUpdatedAt()), proposal.baseRevision(), objectMapper.writeValueAsString(proposal.commands()),
                timestamp(proposal.createdAt()), timestamp(proposal.expiresAt()), timestamp(proposal.consumedAt()));
    }

    public Optional<LayoutProposal> findById(String proposalId) {
        List<LayoutProposal> proposals = jdbc.query("""
                SELECT proposal_id, project_id, owner_id, base_updated_at, base_revision, commands, created_at, expires_at, consumed_at
                  FROM layout_proposals WHERE proposal_id = ?
                """, (rs, rowNum) -> new LayoutProposal(
                rs.getString("proposal_id"), rs.getString("project_id"), rs.getString("owner_id"),
                instant(rs.getTimestamp("base_updated_at")), rs.getObject("base_revision", Long.class), readCommands(rs.getString("commands")),
                instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("expires_at")),
                instant(rs.getTimestamp("consumed_at"))), proposalId);
        return proposals.stream().findFirst();
    }

    /** Atomic one-time consumption: only the caller that flips consumed_at may apply the commands. */
    public boolean tryConsume(String proposalId, Instant consumedAt) {
        return jdbc.update("""
                UPDATE layout_proposals SET consumed_at = ? WHERE proposal_id = ? AND consumed_at IS NULL
                """, timestamp(consumedAt), proposalId) == 1;
    }

    private List<LayoutCommand> readCommands(String json) {
        return Arrays.asList(objectMapper.readValue(json, LayoutCommand[].class));
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }
}
