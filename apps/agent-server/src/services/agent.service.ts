import { eq, and, desc } from "drizzle-orm";
import { agentAgents } from "@superbuilder/drizzle/schema";
import type { NewAgentAgent } from "@superbuilder/drizzle/schema";
import { db } from "../lib/db";

export const agentService = {
  /** 활성 에이전트 목록 */
  async listActive() {
    return db.query.agentAgents.findMany({
      where: eq(agentAgents.isActive, true),
      orderBy: [desc(agentAgents.createdAt)],
    });
  },

  /** ID로 조회 */
  async getById(id: string) {
    return db.query.agentAgents.findFirst({
      where: eq(agentAgents.id, id),
    });
  },

  /** slug로 조회 */
  async getBySlug(slug: string) {
    return db.query.agentAgents.findFirst({
      where: and(eq(agentAgents.slug, slug), eq(agentAgents.isActive, true)),
    });
  },

  /** 기본 에이전트 조회 */
  async getDefault() {
    return db.query.agentAgents.findFirst({
      where: and(eq(agentAgents.isDefault, true), eq(agentAgents.isActive, true)),
    });
  },

  /** 에이전트 생성 */
  async create(data: NewAgentAgent) {
    const [agent] = await db.insert(agentAgents).values(data).returning();
    return agent;
  },

  /** 에이전트 수정 */
  async update(id: string, data: Partial<NewAgentAgent>) {
    const [agent] = await db
      .update(agentAgents)
      .set(data)
      .where(eq(agentAgents.id, id))
      .returning();
    return agent;
  },

  /** 에이전트 비활성화 (soft delete) */
  async deactivate(id: string) {
    const [agent] = await db
      .update(agentAgents)
      .set({ isActive: false })
      .where(eq(agentAgents.id, id))
      .returning();
    return agent;
  },
};
