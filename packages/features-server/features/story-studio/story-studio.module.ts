import { Module, OnModuleInit } from "@nestjs/common";
import {
  ProjectService,
  ChapterService,
  GraphService,
  FlagService,
  DialogueService,
  CharacterService,
  ExportService,
  ValidationService,
  BeatService,
  EndingService,
  EventService,
} from "./service";
import { StoryStudioController } from "./controller";
import { injectStoryStudioServices } from "./trpc";

@Module({
  controllers: [StoryStudioController],
  providers: [
    ProjectService,
    ChapterService,
    GraphService,
    FlagService,
    DialogueService,
    CharacterService,
    ExportService,
    ValidationService,
    BeatService,
    EndingService,
    EventService,
  ],
  exports: [
    ProjectService,
    ChapterService,
    GraphService,
    FlagService,
    DialogueService,
    CharacterService,
    ExportService,
    ValidationService,
    BeatService,
    EndingService,
    EventService,
  ],
})
export class StoryStudioModule implements OnModuleInit {
  constructor(
    private readonly projectService: ProjectService,
    private readonly chapterService: ChapterService,
    private readonly graphService: GraphService,
    private readonly flagService: FlagService,
    private readonly dialogueService: DialogueService,
    private readonly characterService: CharacterService,
    private readonly exportService: ExportService,
    private readonly validationService: ValidationService,
    private readonly beatService: BeatService,
    private readonly endingService: EndingService,
    private readonly eventService: EventService,
  ) {}

  onModuleInit() {
    injectStoryStudioServices({
      projectService: this.projectService,
      chapterService: this.chapterService,
      graphService: this.graphService,
      flagService: this.flagService,
      dialogueService: this.dialogueService,
      characterService: this.characterService,
      exportService: this.exportService,
      validationService: this.validationService,
      beatService: this.beatService,
      endingService: this.endingService,
      eventService: this.eventService,
    });
  }
}
