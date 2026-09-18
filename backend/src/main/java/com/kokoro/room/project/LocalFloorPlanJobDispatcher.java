package com.kokoro.room.project;

import org.springframework.stereotype.Component;

import java.util.concurrent.Executor;

@Component
public class LocalFloorPlanJobDispatcher implements FloorPlanJobDispatcher {
    private final Executor executor;
    private final FloorPlanJobProcessor processor;

    public LocalFloorPlanJobDispatcher(Executor floorPlanExecutor, FloorPlanJobProcessor processor) {
        this.executor = floorPlanExecutor;
        this.processor = processor;
    }

    @Override
    public void dispatch(String projectId, String jobId) {
        executor.execute(() -> processor.process(projectId, jobId));
    }
}
