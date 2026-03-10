import { Injectable, BadRequestException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskSessions, agentDeskExecutions } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionEvent } from "../types";

const logger = createLogger("agent-desk");

const MAX_CONCURRENT = parseInt(process.env.AGENT_DESK_MAX_CONCURRENT ?? "3", 10);
const WORKTREE_BASE = process.env.AGENT_DESK_WORKTREE_BASE ?? join(process.cwd(), ".agent-worktrees");

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "Read":
    case "Write":
    case "Edit":
      return typeof input.file_path === "string" ? input.file_path : JSON.stringify(input);
    case "Bash":
      return typeof input.command === "string" ? input.command : JSON.stringify(input);
    case "Glob":
      return typeof input.pattern === "string" ? input.pattern : JSON.stringify(input);
    case "Grep":
      return typeof input.pattern === "string" ? `/${input.pattern}/` : JSON.stringify(input);
    default:
      return Object.keys(input).join(", ");
  }
}

function truncateOutput(output: string, maxLen: number): string {
  if (!output || output.length === 0) return "";
  if (output.length <= maxLen) return output;
  const half = Math.floor(maxLen / 2);
  return `${output.slice(0, half)}\n... (${output.length - maxLen} chars truncated) ...\n${output.slice(-half)}`;
}

interface RunningExecution {
  worktreePath: string;
  abortController: AbortController;
  status: "running" | "completed" | "failed" | "cancelled";
}

@Injectable()
export class ExecutorService {
  private readonly running = new Map<string, RunningExecution>();

  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  getRunningCount(): number {
    return this.running.size;
  }

  isRunning(sessionId: string): boolean {
    return this.running.has(sessionId);
  }

  async execute(
    sessionId: string,
    onEvent: (event: ExecutionEvent) => void,
  ): Promise<void> {
    // Guard: max concurrent
    if (this.running.size >= MAX_CONCURRENT) {
      throw new BadRequestException(
        `현재 실행 중인 작업이 ${MAX_CONCURRENT}개입니다. 잠시 후 다시 시도해주세요.`,
      );
    }

    // Guard: already running
    if (this.running.has(sessionId)) {
      throw new BadRequestException("이 세션은 이미 실행 중입니다.");
    }

    // Guard: session exists and has spec
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, sessionId),
    });
    if (!session) throw new BadRequestException(`Session not found: ${sessionId}`);
    if (!session.spec) throw new BadRequestException("스펙이 없습니다. 먼저 스펙을 생성하세요.");

    const abortController = new AbortController();
    const branchName = `feat/agent-desk-${sessionId.slice(0, 8)}`;
    const worktreePath = join(WORKTREE_BASE, branchName);

    // Create execution record
    const rows = await this.db
      .insert(agentDeskExecutions)
      .values({
        sessionId,
        worktreePath,
        branchName,
        status: "running",
        startedAt: new Date(),
      })
      .returning();
    const execution = rows[0]!;

    this.running.set(sessionId, { worktreePath, abortController, status: "running" });

    // Update session status
    await this.db
      .update(agentDeskSessions)
      .set({ status: "executing" })
      .where(eq(agentDeskSessions.id, sessionId));

    onEvent({ type: "status", status: "executing" });

    // 중첩 세션 보호 회피: 서버가 Claude Code 세션 내에서 실행될 수 있으므로 CLAUDECODE 환경변수 제거
    const savedClaudeCode = process.env.CLAUDECODE;
    delete process.env.CLAUDECODE;

    try {
      // 1. Create Worktree
      onEvent({ type: "log", content: "Git worktree 생성 중..." });
      this.createWorktree(worktreePath, branchName);
      onEvent({ type: "log", content: `Worktree 생성 완료: ${branchName}` });

      const query = await this.loadQueryFn();

      let logBuffer = "";
      for await (const message of query({
        prompt: session.spec,
        options: {
          cwd: worktreePath,
          abortController,
          permissionMode: "acceptEdits",
          allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
          maxTurns: 100,
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: `\n\n이 프로젝트는 Atlas 플랫폼입니다. .claude/rules/ 디렉토리의 규칙을 반드시 따르세요.\n기존 Feature를 절대 수정하지 마세요.`,
          },
        },
      })) {
        if (abortController.signal.aborted) break;

        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if ("text" in block && block.type === "text") {
              logBuffer += block.text + "\n";
              onEvent({ type: "log", content: block.text });
            } else if (block.type === "tool_use") {
              const toolBlock = block as { type: "tool_use"; name: string; input: Record<string, unknown> };
              const detail = formatToolInput(toolBlock.name, toolBlock.input);
              logBuffer += `[${toolBlock.name}] ${detail}\n`;
              onEvent({ type: "tool_call", tool: toolBlock.name, detail });
            }
          }
        } else if (message.type === "user") {
          // Tool 결과를 터미널에 표시
          const msg = message as { message?: { content?: unknown }; tool_use_result?: unknown };
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === "tool_result" && typeof block.content === "string") {
                const truncated = truncateOutput(block.content, 800);
                if (truncated) {
                  logBuffer += truncated + "\n";
                  onEvent({ type: "tool_output", content: truncated });
                }
              }
            }
          }
        } else if (message.type === "tool_use_summary") {
          const summary = (message as { summary?: string }).summary;
          if (summary) {
            logBuffer += summary + "\n";
            onEvent({ type: "log", content: summary });
          }
        } else if (message.type === "result") {
          if ((message as { subtype?: string }).subtype === "success") {
            onEvent({ type: "log", content: "Claude Code 실행 완료" });
          } else {
            throw new Error(`Claude Code 실행 실패: ${(message as { subtype?: string }).subtype}`);
          }
        }
      }

      // 3. Build verification
      onEvent({ type: "log", content: "TypeScript 빌드 검증 중..." });
      try {
        execFileSync("pnpm", ["tsc", "--noEmit"], { cwd: worktreePath, timeout: 120_000 });
        onEvent({ type: "log", content: "빌드 검증 통과" });
      } catch (buildError) {
        onEvent({ type: "log", content: "빌드 실패 — 자동 수정 시도 중..." });

        const errorOutput = buildError instanceof Error ? buildError.message : String(buildError);
        for await (const message of query({
          prompt: `TypeScript 빌드 에러가 발생했습니다. 수정해주세요:\n\n${errorOutput}`,
          options: {
            cwd: worktreePath,
            permissionMode: "acceptEdits",
            allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            maxTurns: 20,
          },
        })) {
          if (message.type === "assistant" && message.message?.content) {
            for (const block of message.message.content) {
              if ("text" in block && block.type === "text") {
                onEvent({ type: "log", content: block.text });
              } else if (block.type === "tool_use") {
                const toolBlock = block as { type: "tool_use"; name: string; input: Record<string, unknown> };
                onEvent({ type: "tool_call", tool: toolBlock.name, detail: formatToolInput(toolBlock.name, toolBlock.input) });
              }
            }
          }
        }

        execFileSync("pnpm", ["tsc", "--noEmit"], { cwd: worktreePath, timeout: 120_000 });
        onEvent({ type: "log", content: "자동 수정 후 빌드 검증 통과" });
      }

      // 4. Git commit + push + PR
      onEvent({ type: "log", content: "변경사항 커밋 및 PR 생성 중..." });
      execFileSync("git", ["add", "-A"], { cwd: worktreePath, timeout: 30_000 });
      execFileSync("git", ["commit", "-m", "feat: agent-desk auto-generated feature", "--allow-empty"], {
        cwd: worktreePath,
        timeout: 30_000,
      });
      execFileSync("git", ["push", "-u", "origin", branchName], {
        cwd: worktreePath,
        timeout: 60_000,
      });

      const prOutput = execFileSync(
        "gh",
        ["pr", "create", "--title", "feat: Agent Desk auto-generated feature", "--body", "Agent Desk 파이프라인이 자동 생성한 PR입니다.", "--base", "develop"],
        { cwd: worktreePath, timeout: 30_000 },
      ).toString().trim();

      const prUrl = prOutput;
      const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
      const prNumber = prNumberMatch?.[1] ? parseInt(prNumberMatch[1], 10) : null;

      // 5. DB update — success
      await this.db
        .update(agentDeskExecutions)
        .set({ status: "completed", completedAt: new Date(), prUrl, prNumber, log: logBuffer })
        .where(eq(agentDeskExecutions.id, execution.id));

      await this.db
        .update(agentDeskSessions)
        .set({ status: "executed" })
        .where(eq(agentDeskSessions.id, sessionId));

      onEvent({ type: "result", prUrl, prNumber: prNumber ?? undefined });
      onEvent({ type: "status", status: "executed" });

      logger.info("Execution completed", {
        "agent_desk.session_id": sessionId,
        "agent_desk.pr_url": prUrl,
        "agent_desk.branch": branchName,
      });

      // 6. Cleanup worktree
      this.cleanupWorktree(worktreePath, branchName);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      await this.db
        .update(agentDeskExecutions)
        .set({ status: "failed", completedAt: new Date(), log: errMsg })
        .where(eq(agentDeskExecutions.id, execution.id));

      await this.db
        .update(agentDeskSessions)
        .set({ status: "failed", errorMessage: errMsg })
        .where(eq(agentDeskSessions.id, sessionId));

      onEvent({ type: "error", message: errMsg });
      onEvent({ type: "status", status: "failed" });

      logger.error("Execution failed", {
        "agent_desk.session_id": sessionId,
        "error.message": errMsg,
      });
    } finally {
      // CLAUDECODE 환경변수 복원
      if (savedClaudeCode) process.env.CLAUDECODE = savedClaudeCode;
      this.running.delete(sessionId);
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const running = this.running.get(sessionId);
    if (!running) throw new BadRequestException("실행 중인 세션이 아닙니다.");

    running.abortController.abort();
    running.status = "cancelled";

    logger.info("Execution cancelled", {
      "agent_desk.session_id": sessionId,
    });
  }

  /** Extracted for testability — dynamic import can't be mocked in Jest VM. */
  protected async loadQueryFn() {
    const { query } = await import(/* webpackIgnore: true */ "@anthropic-ai/claude-agent-sdk");
    return query;
  }

  private createWorktree(worktreePath: string, branchName: string): void {
    if (!existsSync(WORKTREE_BASE)) {
      mkdirSync(WORKTREE_BASE, { recursive: true });
    }

    const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { timeout: 10_000 })
      .toString()
      .trim();

    execFileSync("git", ["worktree", "add", "-b", branchName, worktreePath, "develop"], {
      cwd: repoRoot,
      timeout: 30_000,
    });
  }

  private cleanupWorktree(worktreePath: string, branchName: string): void {
    try {
      const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { timeout: 10_000 })
        .toString()
        .trim();

      execFileSync("git", ["worktree", "remove", worktreePath, "--force"], {
        cwd: repoRoot,
        timeout: 30_000,
      });
      execFileSync("git", ["branch", "-D", branchName], {
        cwd: repoRoot,
        timeout: 10_000,
      });
    } catch (err) {
      logger.warn("Worktree cleanup failed", {
        "agent_desk.worktree_path": worktreePath,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
