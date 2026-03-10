import { z } from "zod";

// ============================================================================
// Preview Linear Issues (Draft)
// ============================================================================

export const previewLinearIssuesSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  handoffVersion: z.number().int().positive().describe("핸드오프 버전"),
  teamKey: z.string().min(1).max(50).describe("Linear 팀 키 (예: FEA)"),
  projectId: z.string().optional().describe("Linear 프로젝트 ID (선택)"),
  storyIds: z.array(z.string()).min(1).describe("생성할 Story ID 목록"),
  groupingMode: z.enum(["story-to-issue"]).default("story-to-issue").describe("그룹핑 방식"),
  includeSubIssues: z.boolean().default(true).describe("Sub-issue (Task) 포함 여부"),
  templatePath: z.string().optional().describe("이슈 템플릿 경로 (선택)"),
});

export type PreviewLinearIssuesInput = z.infer<typeof previewLinearIssuesSchema>;

// ============================================================================
// Create Linear Issues (Publish)
// ============================================================================

export const createLinearIssuesSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  publishJobId: z.string().uuid().describe("Publish Job ID"),
  draftKey: z.string().min(1).describe("Draft 키 (중복 방지)"),
  assigneeId: z.string().optional().describe("Linear 담당자 ID (선택)"),
  createSubIssues: z.boolean().default(true).describe("Sub-issue 생성 여부"),
});

export type CreateLinearIssuesInput = z.infer<typeof createLinearIssuesSchema>;

// ============================================================================
// Get Linear Publish Status
// ============================================================================

export const getLinearPublishStatusSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  publishJobId: z.string().uuid().describe("Publish Job ID"),
});

export type GetLinearPublishStatusInput = z.infer<typeof getLinearPublishStatusSchema>;
