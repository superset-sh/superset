/**
 * Agent Desk Feature - Server
 *
 * Deprecated: keep this export surface available during the Feature Studio rollout.
 * New feature authoring work should be built on `feature-studio`.
 */

// Module
export { AgentDeskModule } from "./agent-desk.module";

// tRPC Router
export { agentDeskRouter, type AgentDeskRouter } from "./trpc";

// Services
export {
  SessionService,
  FileParserService,
  ChatService,
  AnalyzerService,
  ExecutorService,
  DiagramGeneratorService,
  CanvasExporterService,
  RequirementSourceService,
  RequirementNormalizerService,
  OutputComposerService,
  LinearPublisherService,
} from "./service";

// Types
export * from "./types";
