package com.kokoro.room;

import com.kokoro.room.floorplan.FloorPlanStorage;
import com.kokoro.room.project.FloorPlanFileCleanup;
import com.kokoro.room.project.FloorPlanJobCoordinator;
import com.kokoro.room.project.FloorPlanJobDispatcher;
import com.kokoro.room.project.FloorPlanJobRepository;
import com.kokoro.room.project.FurniturePlacementValidator;
import com.kokoro.room.project.FurnitureRegistry;
import com.kokoro.room.project.LayoutCommandInterpreter;
import com.kokoro.room.project.LayoutProposalRepository;
import com.kokoro.room.project.ProjectModels.ChatCommandResponse;
import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FloorPlan;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.LayoutActionType;
import com.kokoro.room.project.ProjectModels.LayoutCommand;
import com.kokoro.room.project.ProjectModels.LayoutProposal;
import com.kokoro.room.project.ProjectModels.RenovationProject;
import com.kokoro.room.project.ProjectRepository;
import com.kokoro.room.project.ProjectService;
import com.kokoro.room.project.RoomModelValidator;
import com.kokoro.room.security.CurrentUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Service-level checks with mocked storage; they do not exercise PostgreSQL. */
class ProjectServiceIntentSequenceTest {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final LayoutProposalRepository proposals = mock(LayoutProposalRepository.class);
    private final FurnitureRegistry registry = mock(FurnitureRegistry.class);
    private ProjectService service;
    private RenovationProject project;

    @BeforeEach
    void setUp() {
        CurrentUser user = mock(CurrentUser.class);
        when(user.id()).thenReturn("owner");
        project = new RenovationProject("p1", "owner", "테스트", "거실", new Dimensions(8, 6, 2.4), null,
                new FloorPlan("", 0, ConversionStatus.EMPTY, 0, null, null, null, null, null, false),
                new ArrayList<>(), Instant.now(), 3);
        when(projects.findById("living-room-01")).thenReturn(Optional.of(project));
        when(projects.lockById("p1")).thenReturn(Optional.of(project));
        when(registry.require("sofa-cloud")).thenReturn(MAPPER.readTree(
                "{\"id\":\"sofa-cloud\",\"name\":\"클라우드 소파\",\"category\":\"소파\",\"color\":\"#D8C8B8\",\"width\":2.0,\"depth\":0.9}"));
        service = new ProjectService(projects, mock(FloorPlanStorage.class), mock(FloorPlanJobRepository.class),
                mock(FloorPlanJobDispatcher.class), mock(FloorPlanJobCoordinator.class), new FurniturePlacementValidator(),
                user, mock(LayoutCommandInterpreter.class), mock(RoomModelValidator.class), proposals,
                mock(FloorPlanFileCleanup.class), registry);
    }

    @Test
    void anAddedFurnitureCanBeTargetedByTheNextIntentAndKeepsItsIdThroughConfirm() {
        ChatCommandResponse response = service.proposeIntents("p1", MAPPER.readTree("""
                {"version":1,"intents":[{"type":"ADD","catalogId":"sofa-cloud"},
                                        {"type":"ROTATE","targetQuery":"소파","rotation":90}]}"""), null, null);

        assertThat(response.requiresConfirmation()).isTrue();
        List<LayoutCommand> commands = response.proposedCommands();
        assertThat(commands).extracting(LayoutCommand::type).containsExactly(LayoutActionType.ADD, LayoutActionType.ROTATE);
        String addedId = commands.get(0).furnitureId();
        assertThat(addedId).isNotBlank();
        assertThat(commands.get(1).furnitureId()).isEqualTo(addedId);

        ArgumentCaptor<LayoutProposal> stored = ArgumentCaptor.forClass(LayoutProposal.class);
        verify(proposals).insert(stored.capture());
        when(proposals.findById(stored.getValue().proposalId())).thenReturn(Optional.of(stored.getValue()));
        when(proposals.tryConsume(anyString(), any())).thenReturn(true);

        service.confirmCommand("p1", stored.getValue().proposalId());

        ArgumentCaptor<RenovationProject> saved = ArgumentCaptor.forClass(RenovationProject.class);
        verify(projects).replace(saved.capture());
        assertThat(saved.getValue().furniture()).hasSize(1);
        FurnitureItem sofa = saved.getValue().furniture().get(0);
        assertThat(sofa.id()).isEqualTo(addedId);
        assertThat(sofa.rotation()).isEqualTo(90.0);
    }
}
