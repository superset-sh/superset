export type SessionType = "customer" | "operator" | "designer";
export type SessionStatus =
  | "chatting"
  | "uploading"
  | "parsing"
  | "designing"
  | "analyzing"
  | "analyzed"
  | "reviewed"
  | "spec_generated"
  | "project_created"
  | "executing"
  | "executed"
  | "failed";
export type MessageRole = "agent" | "user";

export interface AnalysisFeature {
  name: string;
  description: string;
  priority: "high" | "medium" | "low";
  complexity: "simple" | "moderate" | "complex";
  existingFeatures: string[];
  gaps: string[];
}

export interface AnalysisResult {
  features: AnalysisFeature[];
  summary: string;
  recommendation: string;
}

export interface DiagramResult {
  type: string;
  title: string;
  description: string;
  mermaidCode: string;
}

export interface DiagramGenerationResult {
  sessionId: string;
  diagrams: DiagramResult[];
  summary: string;
}

export interface ExecutionEvent {
  type: "status" | "log" | "progress" | "result" | "error" | "tool_call" | "tool_output";
  status?: SessionStatus;
  content?: string;
  step?: string;
  total?: number;
  prUrl?: string;
  prNumber?: number;
  message?: string;
  tool?: string;
  detail?: string;
}

export interface ScreenDetail {
  screenGoal?: string;
  primaryUser?: string;
  routePath?: string;
  routeParent?: string;
  keyElements?: string[];
  inputs?: string[];
  actions?: string[];
  states?: string[];
  entryConditions?: string[];
  exitConditions?: string[];
  sourceRequirementIds?: string[];
  notes?: string;
}

export interface FlowEdge {
  id: string;
  fromScreenId: string;
  toScreenId: string;
  conditionLabel: string;
  transitionType: "navigate" | "redirect" | "modal" | "conditional";
  sourceRequirementIds: string[];
}

export type PanelMode = "closed" | "view" | "edit" | "preview";

export interface FlowScreen {
  id: string;
  name: string;
  order: number;
  description: string;
  wireframeType: string;
  wireframeMermaid: string;
  nextScreenIds: string[];
  metadata: Record<string, unknown>;
  detail?: ScreenDetail;
}

export interface FlowData {
  screens: FlowScreen[];
  currentScreenIndex: number;
  edges?: FlowEdge[];
}

// ============================================================================
// AI Suggestion & Structured Question Types (FRD-AD-218~220)
// ============================================================================

export type SuggestionAction = "apply" | "ignore" | "modify";

export interface StructuredQuestion {
  id: string;
  slot: "role" | "goal" | "input" | "exception" | "branch";
  question: string;
  context?: string;
  targetScreenId?: string;
}

export interface AiSuggestion {
  id: string;
  type: "add_screen" | "remove_screen" | "update_screen" | "add_edge" | "update_edge" | "update_detail";
  title: string;
  description: string;
  previewData: Record<string, unknown>;
  affectedNodeIds: string[];
  status: "pending" | "applied" | "ignored";
}

export interface FlowAgentResponse {
  reply: string;
  questions: StructuredQuestion[];
  suggestions: AiSuggestion[];
}

// ============================================================================
// UI Spec Types (FRD-AD-222~223)
// ============================================================================

export interface UiComponent {
  type: string;
  source: "shadcn" | "custom" | "layout" | "block";
  importPath: string;
  label?: string;
  props?: Record<string, unknown>;
  children?: UiComponent[];
  todoReason?: string;
}

export interface UiSpecSection {
  id: string;
  title: string;
  order: number;
  components: UiComponent[];
}

export interface UiSpec {
  screenId: string;
  layoutType: string;
  sections: UiSpecSection[];
  stateVariants: Record<string, Record<string, unknown>>;
  responsiveRules: Record<string, string>;
}

// ============================================================================
// Implementation Handoff Types (FRD-AD-225)
// ============================================================================

export interface RouterMapEntry {
  screenId: string;
  screenName: string;
  routePath: string;
  parentRoute: string;
  authRule: "public" | "protected" | "admin";
}

export interface ScreenSpec {
  screenId: string;
  screenName: string;
  wireframeType: string;
  description: string;
  requirements: string[];
  stateManagement: {
    serverState: string[];
    clientState: string[];
    formState: string[];
  };
}

export interface NavigationRule {
  fromScreenId: string;
  toScreenId: string;
  trigger: string;
  conditionLabel: string;
  transitionType: string;
  dataPassingStrategy: "url_param" | "query_string" | "state" | "context";
}

export interface ImplementationHandoff {
  sessionId: string;
  generatedAt: string;
  routerMap: RouterMapEntry[];
  screenSpecs: ScreenSpec[];
  navigationRules: NavigationRule[];
  implementationNotes: string[];
  artifacts: ArtifactBundle;
}

// ============================================================================
// Artifact Types (FRD-AD-226~228)
// ============================================================================

export interface ScreenSummary {
  screenId: string;
  screenName: string;
  wireframeType: string;
  routePath: string;
  description: string;
  requirements: string[];
  keyElements: string[];
}

export interface SpecDraftArtifact {
  markdown: string;
  screenSummaries: ScreenSummary[];
  generatedAt: string;
}

export interface MermaidArtifact {
  flowChart: string;
  title: string;
  generatedAt: string;
}

export interface QaRequirementMapping {
  requirementId: string;
  requirementSummary: string;
  category: string;
  linkedScreenIds: string[];
  linkedEdgeIds: string[];
  coverage: "full" | "partial" | "none";
}

export interface QaMappingArtifact {
  mappings: QaRequirementMapping[];
  coverageSummary: {
    total: number;
    full: number;
    partial: number;
    none: number;
  };
  generatedAt: string;
}

export interface ArtifactBundle {
  specDraft?: SpecDraftArtifact;
  mermaid?: MermaidArtifact;
  qaMapping?: QaMappingArtifact;
}

export interface FlowDesignResult {
  platform: "mobile" | "desktop";
  designTheme: string;
  screens: FlowScreen[];
  flowchartMermaid: string;
  screenDefinitionDraft: string;
}

// ============================================================================
// Pipeline Stream Event Types
// ============================================================================

export type PipelineStreamEventType =
  | "progress"
  | "text-delta"
  | "result"
  | "usage"
  | "error"
  | "done";

export interface PipelineStreamEvent {
  type: PipelineStreamEventType;
  stage?: string;
  content?: string;
  data?: unknown;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  message?: string;
}

// ============================================================================
// Linear Publish Types
// ============================================================================

export type LinearPublishStatus = "drafted" | "publishing" | "partially_published" | "published" | "failed";

export interface LinearIssueRef {
  linearIssueId: string;
  identifier: string;
  title: string;
  url: string;
  storyId: string;
  type: "issue" | "sub-issue";
  parentIssueId?: string;
}

export interface LinearIssueDraft {
  storyId: string;
  storyTitle: string;
  title: string;
  body: string;
  priority: number;
  subIssues?: LinearSubIssueDraft[];
}

export interface LinearSubIssueDraft {
  taskId: string;
  taskTitle: string;
  title: string;
  body: string;
  priority: number;
}

export interface PreviewLinearIssuesResult {
  publishJobId: string;
  draftKey: string;
  project: { id?: string; name: string } | null;
  issues: LinearIssueDraft[];
  bodyPreview: string;
  warnings: string[];
}

export interface CreateLinearIssuesResult {
  publishJobId: string;
  createdIssues: LinearIssueRef[];
  failedIssues: Array<{ storyId: string; error: string }>;
  deduplicated: boolean;
}

export interface LinearPublishStatusResult {
  status: LinearPublishStatus;
  draftKey: string;
  createdIssues: LinearIssueRef[];
  failedIssues: Array<{ storyId: string; error: string }>;
  lastSyncedAt: string | null;
}
