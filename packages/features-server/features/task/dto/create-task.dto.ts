import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500).describe("태스크 제목"),
  description: z.string().optional().describe("태스크 설명"),
  status: z
    .enum(["backlog", "todo", "in_progress", "in_review", "done", "canceled", "duplicate"])
    .optional()
    .describe("태스크 상태"),
  priority: z.number().int().min(0).max(4).optional().describe("우선순위 (0=없음, 1=긴급, 2=높음, 3=보통, 4=낮음)"),
  assigneeId: z.string().uuid().optional().nullable().describe("담당자 UUID"),
  projectId: z.string().uuid().optional().nullable().describe("프로젝트 UUID"),
  cycleId: z.string().uuid().optional().nullable().describe("사이클 UUID"),
  parentId: z.string().uuid().optional().nullable().describe("상위 태스크 UUID"),
  labelIds: z.array(z.string().uuid()).optional().describe("라벨 UUID 목록"),
  dueDate: z.string().optional().nullable().describe("마감일 (YYYY-MM-DD)"),
  estimate: z.number().int().min(0).optional().nullable().describe("추정치 (포인트)"),
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;
