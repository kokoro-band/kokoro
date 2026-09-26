package com.kokoro.room.project;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects/{projectId}/layout/proposals")
public class LayoutProposalController {
    private final LayoutProposalService proposals;
    private final LayoutIntentService intents;

    public LayoutProposalController(LayoutProposalService proposals, LayoutIntentService intents) {
        this.proposals = proposals;
        this.intents = intents;
    }

    @PostMapping("/intent")
    public LayoutProposalService.View interpret(@PathVariable String projectId,
                                                @Valid @RequestBody LayoutIntentService.Request request) {
        return intents.preview(projectId, request);
    }

    @PostMapping
    public LayoutProposalService.View preview(@PathVariable String projectId,
                                              @Valid @RequestBody LayoutProposalService.PreviewRequest request) {
        return proposals.preview(projectId, request);
    }

    @GetMapping("/{proposalId}")
    public LayoutProposalService.View status(@PathVariable String projectId, @PathVariable String proposalId) {
        return proposals.status(projectId, proposalId);
    }

    @PostMapping("/{proposalId}/confirm")
    public LayoutProposalService.View confirm(@PathVariable String projectId, @PathVariable String proposalId) {
        return proposals.confirm(projectId, proposalId);
    }

    @PostMapping("/{proposalId}/cancel")
    public LayoutProposalService.View cancel(@PathVariable String projectId, @PathVariable String proposalId) {
        return proposals.cancel(projectId, proposalId);
    }
}
