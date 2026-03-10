import { tool } from "ai";
import { z } from "zod";
import { desc, ilike } from "drizzle-orm";
import { files } from "@superbuilder/drizzle/schema";
import { db } from "../lib/db";

export const fileTools = {
  "file.search": tool({
    description: "파일 검색. 파일명으로 업로드된 파일을 찾습니다.",
    parameters: z.object({
      query: z.string().describe("파일명 검색어"),
      limit: z.number().max(20).default(10),
    }),
    execute: async ({ query, limit }) => {
      const results = await db.query.files.findMany({
        where: ilike(files.originalName, `%${query}%`),
        limit,
        orderBy: [desc(files.createdAt)],
        columns: {
          id: true,
          name: true,
          originalName: true,
          mimeType: true,
          size: true,
          url: true,
          createdAt: true,
        },
      });
      return results;
    },
  }),
};
