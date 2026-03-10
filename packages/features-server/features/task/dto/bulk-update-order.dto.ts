import { z } from "zod";

export const bulkUpdateOrderSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().uuid().describe("태스크 UUID"),
        status: z
          .enum([
            "backlog",
            "todo",
            "in_progress",
            "in_review",
            "done",
            "canceled",
            "duplicate",
          ])
          .optional()
          .describe("변경할 상태 (컬럼 간 이동 시)"),
        sortOrder: z.number().describe("새 정렬 순서"),
      }),
    )
    .min(1)
    .max(50)
    .describe("업데이트할 태스크 목록"),
});

export type BulkUpdateOrderDto = z.infer<typeof bulkUpdateOrderSchema>;
