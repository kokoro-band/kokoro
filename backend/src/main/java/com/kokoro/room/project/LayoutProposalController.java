package com.kokoro.room.project;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects/{projectId}/layout/proposals")
public class LayoutProposalController {
    private final LayoutProposalService proposals;

    public LayoutProposalController(LayoutProposalService proposals) {
        this.proposals = proposals;
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
