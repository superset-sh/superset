import { eq, and, desc, asc, lt } from "drizzle-orm";
import { agentMessages } from "@superbuilder/drizzle/schema";
import type { NewAgentMessage } from "@superbuilder/drizzle/schema";
import { db } from "../lib/db";

export const messageService = {
  /** 스레드 내 메시지 목록 (커서 기반) */
  async listByThread(
    threadId: string,
    opts?: { limit?: number; cursor?: string },
  ) {
    const limit = opts?.limit ?? 50;

    if (opts?.cursor) {
      return db.query.agentMessages.findMany({
        where: and(
          eq(agentMessages.threadId, threadId),
          lt(agentMessages.createdAt, new Date(opts.cursor)),
        ),
        orderBy: [desc(agentMessages.createdAt)],
        limit,
      });
    }

    return db.query.agentMessages.findMany({
      where: eq(agentMessages.threadId, threadId),
      orderBy: [asc(agentMessages.createdAt)],
      limit,
    });
  },

  /** 메시지 저장 */
  async create(data: NewAgentMessage) {
    const [message] = await db.insert(agentMessages).values(data).returning();
    return message;
  },

  /** 여러 메시지 한번에 저장 */
  async createMany(data: NewAgentMessage[]) {
    return db.insert(agentMessages).values(data).returning();
  },
};
