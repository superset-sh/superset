import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AIModule, LLMService } from "../../features/ai";
import {
  SessionService,
  FileParserService,
  ChatService,
  AnalyzerService,
  ExecutorService,
  DiagramGeneratorService,
  CanvasExporterService,
  FlowDesignerService,
  RequirementSourceService,
  RequirementNormalizerService,
  ScreenCandidateService,
  FlowAgentService,
  HandoffComposerService,
  UiComponentResolverService,
  OutputComposerService,
  LinearPublisherService,
} from "./service";
import { AgentDeskController } from "./controller";
import { injectAgentDeskServices } from "./trpc";

@Module({
  imports: [ConfigModule, AIModule],
  controllers: [AgentDeskController],
  providers: [
    SessionService,
    FileParserService,
    ChatService,
    AnalyzerService,
    ExecutorService,
    DiagramGeneratorService,
    CanvasExporterService,
    FlowDesignerService,
    RequirementSourceService,
    RequirementNormalizerService,
    ScreenCandidateService,
    FlowAgentService,
    HandoffComposerService,
    UiComponentResolverService,
    OutputComposerService,
    LinearPublisherService,
  ],
  exports: [
    SessionService,
    FileParserService,
    ChatService,
    AnalyzerService,
    ExecutorService,
    DiagramGeneratorService,
    CanvasExporterService,
    FlowDesignerService,
    RequirementSourceService,
    RequirementNormalizerService,
    ScreenCandidateService,
    FlowAgentService,
    HandoffComposerService,
    UiComponentResolverService,
    OutputComposerService,
    LinearPublisherService,
  ],
})
export class AgentDeskModule implements OnModuleInit {
  constructor(
    private readonly sessionService: SessionService,
    private readonly fileParserService: FileParserService,
    private readonly chatService: ChatService,
    private readonly analyzerService: AnalyzerService,
    private readonly executorService: ExecutorService,
    private readonly diagramGeneratorService: DiagramGeneratorService,
    private readonly canvasExporterService: CanvasExporterService,
    private readonly flowDesignerService: FlowDesignerService,
    private readonly requirementSourceService: RequirementSourceService,
    private readonly requirementNormalizerService: RequirementNormalizerService,
    private readonly screenCandidateService: ScreenCandidateService,
    private readonly flowAgentService: FlowAgentService,
    private readonly handoffComposerService: HandoffComposerService,
    private readonly uiComponentResolverService: UiComponentResolverService,
    private readonly outputComposerService: OutputComposerService,
    private readonly linearPublisherService: LinearPublisherService,
    private readonly llmService: LLMService,
  ) {}

  onModuleInit() {
    injectAgentDeskServices({
      sessionService: this.sessionService,
      fileParserService: this.fileParserService,
      chatService: this.chatService,
      analyzerService: this.analyzerService,
      executorService: this.executorService,
      diagramGeneratorService: this.diagramGeneratorService,
      canvasExporterService: this.canvasExporterService,
      flowDesignerService: this.flowDesignerService,
      requirementSourceService: this.requirementSourceService,
      requirementNormalizerService: this.requirementNormalizerService,
      screenCandidateService: this.screenCandidateService,
      flowAgentService: this.flowAgentService,
      handoffComposerService: this.handoffComposerService,
      uiComponentResolverService: this.uiComponentResolverService,
      outputComposerService: this.outputComposerService,
      linearPublisherService: this.linearPublisherService,
      llmService: this.llmService,
    });
  }
}
