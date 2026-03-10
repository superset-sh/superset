import { eq, gte, desc, count, sum, avg } from "drizzle-orm";
import { agentUsageLogs, agentAgents } from "@superbuilder/drizzle/schema";
import type { NewAgentUsageLog } from "@superbuilder/drizzle/schema";
import { db } from "../lib/db";

export const usageService = {
  /** 사용 로그 기록 */
  async log(data: NewAgentUsageLog) {
    const [log] = await db.insert(agentUsageLogs).values(data).returning();
    return log;
  },

  /** 기간별 요약 통계 */
  async summary(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const result = await db
      .select({
        totalRequests: count(),
        totalPromptTokens: sum(agentUsageLogs.promptTokens),
        totalCompletionTokens: sum(agentUsageLogs.completionTokens),
        totalToolCalls: sum(agentUsageLogs.toolCallCount),
        avgDurationMs: avg(agentUsageLogs.durationMs),
      })
      .from(agentUsageLogs)
      .where(gte(agentUsageLogs.createdAt, since));

    const row = result[0];
    return {
      days,
      totalRequests: row?.totalRequests ?? 0,
      totalPromptTokens: Number(row?.totalPromptTokens ?? 0),
      totalCompletionTokens: Number(row?.totalCompletionTokens ?? 0),
      totalToolCalls: Number(row?.totalToolCalls ?? 0),
      avgDurationMs: Math.round(Number(row?.avgDurationMs ?? 0)),
    };
  },

  /** 모델별 사용량 */
  async byModel(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await db
      .select({
        modelId: agentUsageLogs.modelId,
        requests: count(),
        promptTokens: sum(agentUsageLogs.promptTokens),
        completionTokens: sum(agentUsageLogs.completionTokens),
      })
      .from(agentUsageLogs)
      .where(gte(agentUsageLogs.createdAt, since))
      .groupBy(agentUsageLogs.modelId)
      .orderBy(desc(count()));

    return rows.map((r) => ({
      modelId: r.modelId,
      requests: r.requests,
      promptTokens: Number(r.promptTokens ?? 0),
      completionTokens: Number(r.completionTokens ?? 0),
    }));
  },

  /** 에이전트별 사용량 */
  async byAgent(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await db
      .select({
        agentId: agentUsageLogs.agentId,
        agentName: agentAgents.name,
        requests: count(),
        promptTokens: sum(agentUsageLogs.promptTokens),
        completionTokens: sum(agentUsageLogs.completionTokens),
      })
      .from(agentUsageLogs)
      .innerJoin(agentAgents, eq(agentUsageLogs.agentId, agentAgents.id))
      .where(gte(agentUsageLogs.createdAt, since))
      .groupBy(agentUsageLogs.agentId, agentAgents.name)
      .orderBy(desc(count()));

    return rows.map((r) => ({
      agentId: r.agentId,
      agentName: r.agentName,
      requests: r.requests,
      promptTokens: Number(r.promptTokens ?? 0),
      completionTokens: Number(r.completionTokens ?? 0),
    }));
  },
};
