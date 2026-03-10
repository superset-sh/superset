import { eq, and, desc } from "drizzle-orm";
import { agentThreads } from "@superbuilder/drizzle/schema";
import type { NewAgentThread } from "@superbuilder/drizzle/schema";
import { db } from "../lib/db";

export const threadService = {
  /** 사용자의 스레드 목록 */
  async listByUser(userId: string, opts?: { limit?: number; offset?: number }) {
    return db.query.agentThreads.findMany({
      where: and(
        eq(agentThreads.userId, userId),
        eq(agentThreads.isArchived, false),
      ),
      orderBy: [desc(agentThreads.lastMessageAt)],
      limit: opts?.limit ?? 20,
      offset: opts?.offset ?? 0,
    });
  },

  /** 스레드 상세 */
  async getById(id: string) {
    return db.query.agentThreads.findFirst({
      where: eq(agentThreads.id, id),
      with: { agent: true },
    });
  },

  /** 스레드 생성 */
  async create(data: NewAgentThread) {
    const [thread] = await db.insert(agentThreads).values(data).returning();
    return thread;
  },

  /** 스레드 업데이트 (제목, 핀, 아카이브) */
  async update(id: string, data: Partial<NewAgentThread>) {
    const [thread] = await db
      .update(agentThreads)
      .set(data)
      .where(eq(agentThreads.id, id))
      .returning();
    return thread;
  },

  /** 스레드 삭제 */
  async delete(id: string) {
    await db.delete(agentThreads).where(eq(agentThreads.id, id));
  },

  /** lastMessageAt 업데이트 */
  async touchLastMessage(id: string) {
    await db
      .update(agentThreads)
      .set({ lastMessageAt: new Date() })
      .where(eq(agentThreads.id, id));
  },
};
