import { z } from "zod";

export const taskListSchema = z.object({
  status: z
    .array(z.enum(["backlog", "todo", "in_progress", "in_review", "done", "canceled", "duplicate"]))
    .optional()
    .describe("상태 필터"),
  priority: z.array(z.number().int().min(0).max(4)).optional().describe("우선순위 필터"),
  assigneeId: z.string().uuid().optional().nullable().describe("담당자 필터"),
  labelIds: z.array(z.string().uuid()).optional().describe("라벨 필터"),
  projectId: z.string().uuid().optional().nullable().describe("프로젝트 필터"),
  cycleId: z.string().uuid().optional().nullable().describe("사이클 필터"),
  parentId: z.string().uuid().optional().nullable().describe("상위 태스크 필터"),
  query: z.string().optional().describe("제목 검색어"),
  sortBy: z
    .enum(["createdAt", "updatedAt", "priority", "dueDate", "sortOrder"])
    .optional()
    .default("createdAt")
    .describe("정렬 기준"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc").describe("정렬 방향"),
  page: z.number().int().min(1).optional().default(1).describe("페이지 번호"),
  limit: z.number().int().min(1).max(200).optional().default(50).describe("페이지당 개수"),
});

export type TaskListDto = z.input<typeof taskListSchema>;
