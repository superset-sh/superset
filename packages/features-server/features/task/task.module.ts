import { Module, OnModuleInit } from "@nestjs/common";
import {
  TaskService,
  TaskActivityService,
  TaskProjectService,
  TaskCycleService,
  TaskLabelService,
  TaskCommentService,
} from "./service";
import { TaskController } from "./controller";
import { injectTaskServices } from "./trpc";

@Module({
  controllers: [TaskController],
  providers: [
    TaskService,
    TaskActivityService,
    TaskProjectService,
    TaskCycleService,
    TaskLabelService,
    TaskCommentService,
  ],
  exports: [TaskService],
})
export class TaskModule implements OnModuleInit {
  constructor(
    private readonly taskService: TaskService,
    private readonly activityService: TaskActivityService,
    private readonly projectService: TaskProjectService,
    private readonly cycleService: TaskCycleService,
    private readonly labelService: TaskLabelService,
    private readonly commentService: TaskCommentService,
  ) {}

  onModuleInit() {
    injectTaskServices({
      taskService: this.taskService,
      projectService: this.projectService,
      cycleService: this.cycleService,
      labelService: this.labelService,
      commentService: this.commentService,
      activityService: this.activityService,
    });
  }
}
