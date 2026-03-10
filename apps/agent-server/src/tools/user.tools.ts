import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { profiles } from "@superbuilder/drizzle/schema";
import { db } from "../lib/db";

export const userTools = {
  "user.profile": tool({
    description: "현재 사용자의 프로필 정보를 조회합니다.",
    parameters: z.object({
      userId: z.string().uuid().describe("사용자 ID"),
    }),
    execute: async ({ userId }) => {
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, userId),
        columns: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          createdAt: true,
        },
      });
      if (!profile) return { error: "프로필을 찾을 수 없습니다." };
      return profile;
    },
  }),
};
