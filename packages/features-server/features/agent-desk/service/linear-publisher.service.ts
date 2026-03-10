import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { eq, and } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskLinearPublishJobs, agentDeskSessions } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import type {
  LinearIssueDraft,
  LinearSubIssueDraft,
  LinearIssueRef,
  PreviewLinearIssuesResult,
  CreateLinearIssuesResult,
  LinearPublishStatusResult,
} from "../types";

const logger = createLogger("agent-desk");

interface HandoffStory {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  tasks?: HandoffTask[];
}

interface HandoffTask {
  id: string;
  title: string;
  description?: string;
}

interface ImplementationHandoff {
  version: number;
  stories?: HandoffStory[];
  artifacts?: Record<string, unknown>;
  [key: string]: unknown;
}

@Injectable()
export class LinearPublisherService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * Preview — handoff에서 Linear Issue 초안을 생성하고 DB에 저장
   */
  async previewLinearIssues(input: {
    sessionId: string;
    handoffVersion: number;
    teamKey: string;
    projectId?: string;
    storyIds: string[];
    groupingMode: string;
    includeSubIssues: boolean;
    templatePath?: string;
  }): Promise<PreviewLinearIssuesResult> {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, input.sessionId),
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${input.sessionId}`);
    }

    const handoff = (session.analysisResult as unknown as ImplementationHandoff) ?? null;
    if (!handoff?.stories) {
      throw new BadRequestException("세션에 implementation handoff(stories)가 없습니다");
    }

    // draftKey 생성 (중복 방지)
    const draftKey = this.buildDraftKey(input.handoffVersion, input.storyIds, input.groupingMode);

    // 기존 동일 draftKey job 확인
    const existingJob = await this.db.query.agentDeskLinearPublishJobs.findFirst({
      where: and(
        eq(agentDeskLinearPublishJobs.sessionId, input.sessionId),
        eq(agentDeskLinearPublishJobs.draftKey, draftKey),
      ),
    });

    if (existingJob && existingJob.status !== "failed") {
      // 기존 draft 재사용
      return {
        publishJobId: existingJob.id,
        draftKey,
        project: existingJob.projectName ? { id: existingJob.projectId ?? undefined, name: existingJob.projectName } : null,
        issues: (existingJob.draftPayload as LinearIssueDraft[]) ?? [],
        bodyPreview: this.buildBodyPreview((existingJob.draftPayload as LinearIssueDraft[]) ?? []),
        warnings: ["기존 draft를 재사용합니다"],
      };
    }

    // 선택된 story를 기반으로 Issue draft 생성
    const selectedStories = handoff.stories.filter((s) => input.storyIds.includes(s.id));
    if (selectedStories.length === 0) {
      throw new BadRequestException("선택된 storyIds에 해당하는 story가 없습니다");
    }

    const issueDrafts = this.buildIssueDrafts(selectedStories, input.includeSubIssues, session);
    const warnings: string[] = [];

    if (selectedStories.length < input.storyIds.length) {
      warnings.push(`${input.storyIds.length - selectedStories.length}개의 storyId가 handoff에서 찾을 수 없습니다`);
    }

    // DB에 publish job 저장
    const [job] = await this.db
      .insert(agentDeskLinearPublishJobs)
      .values({
        sessionId: input.sessionId,
        handoffVersion: input.handoffVersion,
        draftKey,
        status: "drafted",
        teamKey: input.teamKey,
        projectId: input.projectId,
        projectName: input.projectId ? `Project-${input.projectId}` : null,
        groupingMode: input.groupingMode,
        draftPayload: issueDrafts,
      })
      .returning();

    if (!job) {
      throw new BadRequestException("Publish job 생성에 실패했습니다");
    }

    logger.info("Linear publish job drafted", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.publish_job_id": job.id,
      "agent_desk.draft_key": draftKey,
      "agent_desk.issue_count": issueDrafts.length,
    });

    return {
      publishJobId: job.id,
      draftKey,
      project: input.projectId ? { id: input.projectId, name: `Project-${input.projectId}` } : null,
      issues: issueDrafts,
      bodyPreview: this.buildBodyPreview(issueDrafts),
      warnings,
    };
  }

  /**
   * Create — 실제 Linear API를 호출하여 Issue 생성
   * (현재는 mock — Linear SDK 연동 후 실제 API 호출로 교체)
   */
  async createLinearIssues(input: {
    sessionId: string;
    publishJobId: string;
    draftKey: string;
    assigneeId?: string;
    createSubIssues: boolean;
  }): Promise<CreateLinearIssuesResult> {
    const job = await this.db.query.agentDeskLinearPublishJobs.findFirst({
      where: eq(agentDeskLinearPublishJobs.id, input.publishJobId),
    });

    if (!job) {
      throw new NotFoundException(`Publish job not found: ${input.publishJobId}`);
    }

    if (job.draftKey !== input.draftKey) {
      throw new ConflictException("draftKey가 일치하지 않습니다");
    }

    // 이미 published 상태면 기존 결과 반환 (중복 방지)
    if (job.status === "published" || job.status === "partially_published") {
      return {
        publishJobId: job.id,
        createdIssues: (job.createdIssues as LinearIssueRef[]) ?? [],
        failedIssues: (job.failedIssues as Array<{ storyId: string; error: string }>) ?? [],
        deduplicated: true,
      };
    }

    // 상태를 publishing으로 변경
    await this.db
      .update(agentDeskLinearPublishJobs)
      .set({ status: "publishing" })
      .where(eq(agentDeskLinearPublishJobs.id, input.publishJobId));

    const drafts = (job.draftPayload as LinearIssueDraft[]) ?? [];
    const createdIssues: LinearIssueRef[] = [];
    const failedIssues: Array<{ storyId: string; error: string }> = [];

    for (const draft of drafts) {
      try {
        // TODO: Linear SDK 연동 후 실제 API 호출로 교체
        const mockIssueId = `LIN-${Date.now().toString(36)}-${draft.storyId.slice(0, 8)}`;
        const mockIdentifier = `${job.teamKey}-${createdIssues.length + 1}`;

        const issueRef: LinearIssueRef = {
          linearIssueId: mockIssueId,
          identifier: mockIdentifier,
          title: draft.title,
          url: `https://linear.app/team/${job.teamKey}/issue/${mockIdentifier}`,
          storyId: draft.storyId,
          type: "issue",
        };
        createdIssues.push(issueRef);

        // Sub-issues
        if (input.createSubIssues && draft.subIssues) {
          for (const sub of draft.subIssues) {
            const subId = `LIN-${Date.now().toString(36)}-${sub.taskId.slice(0, 8)}`;
            const subIdentifier = `${job.teamKey}-${createdIssues.length + 1}`;
            createdIssues.push({
              linearIssueId: subId,
              identifier: subIdentifier,
              title: sub.title,
              url: `https://linear.app/team/${job.teamKey}/issue/${subIdentifier}`,
              storyId: draft.storyId,
              type: "sub-issue",
              parentIssueId: mockIssueId,
            });
          }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        failedIssues.push({ storyId: draft.storyId, error: errMsg });
      }
    }

    // 결과에 따른 상태 결정
    const finalStatus = failedIssues.length === 0
      ? "published" as const
      : createdIssues.length > 0
        ? "partially_published" as const
        : "failed" as const;

    await this.db
      .update(agentDeskLinearPublishJobs)
      .set({
        status: finalStatus,
        createdIssues,
        failedIssues: failedIssues.length > 0 ? failedIssues : null,
        lastSyncedAt: new Date(),
        errorMessage: failedIssues.length > 0
          ? `${failedIssues.length}개 이슈 생성 실패`
          : null,
      })
      .where(eq(agentDeskLinearPublishJobs.id, input.publishJobId));

    logger.info("Linear issues created", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.publish_job_id": input.publishJobId,
      "agent_desk.created_count": createdIssues.length,
      "agent_desk.failed_count": failedIssues.length,
      "agent_desk.status": finalStatus,
    });

    return {
      publishJobId: job.id,
      createdIssues,
      failedIssues,
      deduplicated: false,
    };
  }

  /**
   * Status — Publish Job의 현재 상태 조회
   */
  async getPublishStatus(input: {
    sessionId: string;
    publishJobId: string;
  }): Promise<LinearPublishStatusResult> {
    const job = await this.db.query.agentDeskLinearPublishJobs.findFirst({
      where: and(
        eq(agentDeskLinearPublishJobs.id, input.publishJobId),
        eq(agentDeskLinearPublishJobs.sessionId, input.sessionId),
      ),
    });

    if (!job) {
      throw new NotFoundException(`Publish job not found: ${input.publishJobId}`);
    }

    return {
      status: job.status,
      draftKey: job.draftKey,
      createdIssues: (job.createdIssues as LinearIssueRef[]) ?? [],
      failedIssues: (job.failedIssues as Array<{ storyId: string; error: string }>) ?? [],
      lastSyncedAt: job.lastSyncedAt?.toISOString() ?? null,
    };
  }

  /**
   * 세션의 모든 publish job 조회
   */
  async listPublishJobs(sessionId: string) {
    return this.db.query.agentDeskLinearPublishJobs.findMany({
      where: eq(agentDeskLinearPublishJobs.sessionId, sessionId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private buildDraftKey(handoffVersion: number, storyIds: string[], groupingMode: string): string {
    const sortedIds = [...storyIds].sort().join(",");
    return `v${handoffVersion}:${groupingMode}:${sortedIds}`;
  }

  private buildIssueDrafts(
    stories: HandoffStory[],
    includeSubIssues: boolean,
    session: { id: string; title: string | null },
  ): LinearIssueDraft[] {
    return stories.map((story) => {
      const subIssues: LinearSubIssueDraft[] = includeSubIssues && story.tasks
        ? story.tasks.map((task) => ({
            taskId: task.id,
            taskTitle: task.title,
            title: task.title,
            body: this.buildSubIssueBody(task, story),
            priority: 2,
          }))
        : [];

      return {
        storyId: story.id,
        storyTitle: story.title,
        title: `[${session.title ?? "Atlas"}] ${story.title}`,
        body: this.buildIssueBody(story, session),
        priority: story.priority === "high" ? 1 : story.priority === "low" ? 4 : 2,
        subIssues: subIssues.length > 0 ? subIssues : undefined,
      };
    });
  }

  private buildIssueBody(
    story: HandoffStory,
    session: { id: string; title: string | null },
  ): string {
    const lines: string[] = [
      "## Context",
      `- Atlas Session: \`${session.id}\``,
      `- Story: ${story.title}`,
      "",
      "## Goal",
      story.description ?? "TBD",
      "",
      "## Scope",
      "### In Scope",
    ];

    if (story.tasks && story.tasks.length > 0) {
      for (const task of story.tasks) {
        lines.push(`- ${task.title}`);
      }
    } else {
      lines.push("- TBD");
    }

    lines.push(
      "",
      "### Out of Scope",
      "- scope 밖의 리팩터링은 하지 말 것",
      "",
      "## Acceptance Criteria",
      "- [ ] 구현 완료 후 tsc --noEmit 통과",
      "- [ ] 런타임 검증 통과",
      "",
      "## Claude Code Kickoff",
      "이 Issue를 구현하라.",
      "반드시 FRD, Architecture를 먼저 읽고,",
      "작업 후 코드, 테스트, 문서 갱신까지 완료할 것.",
    );

    return lines.join("\n");
  }

  private buildSubIssueBody(task: HandoffTask, story: HandoffStory): string {
    return [
      `## Context`,
      `- Parent Story: ${story.title}`,
      `- Task: ${task.title}`,
      "",
      "## Goal",
      task.description ?? task.title,
      "",
      "## Claude Code Kickoff",
      "이 Sub-issue를 구현하라.",
    ].join("\n");
  }

  private buildBodyPreview(drafts: LinearIssueDraft[]): string {
    if (drafts.length === 0) return "(비어 있음)";
    return drafts.map((d) => `- ${d.title} (sub-issues: ${d.subIssues?.length ?? 0})`).join("\n");
  }
}
