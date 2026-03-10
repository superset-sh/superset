import { BadRequestException } from "@nestjs/common";
import { ExecutorService } from "./executor.service";

// ============================================================================
// Mocks — node modules
// ============================================================================

const mockExecFileSync = jest.fn().mockReturnValue(Buffer.from(""));
const mockExistsSync = jest.fn().mockReturnValue(true);
const mockMkdirSync = jest.fn();

jest.mock("node:child_process", () => ({
  execFileSync: (...args: any[]) => mockExecFileSync(...args),
}));

jest.mock("node:fs", () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
}));

// ============================================================================
// Mocks — Drizzle & schema
// ============================================================================

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
}));

jest.mock("@superbuilder/drizzle", () => ({
  DRIZZLE: "DRIZZLE_TOKEN",
  InjectDrizzle: () => () => undefined,
  agentDeskSessions: { id: { name: "id" } },
  agentDeskExecutions: { id: { name: "id" } },
}));

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ============================================================================
// Helpers
// ============================================================================

async function* asyncIter<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

const mockSessionId = "223e4567-e89b-12d3-a456-426614174001";
const mockSession = {
  id: mockSessionId,
  spec: "## Feature Spec\n- 기능 A 구현\n- 기능 B 구현",
  status: "spec_generated",
};

function createMockDb() {
  return {
    query: {
      agentDeskSessions: { findFirst: jest.fn() },
    },
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: "exec-1" }]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(undefined),
  };
}

/** Set up mockExecFileSync with default PR URL and repo root. */
function setupExecDefaults() {
  mockExecFileSync.mockImplementation((cmd: string, args?: string[]) => {
    if (cmd === "gh" && args?.[0] === "pr") {
      return Buffer.from("https://github.com/org/repo/pull/42\n");
    }
    if (cmd === "git" && args?.[0] === "rev-parse") {
      return Buffer.from("/home/user/project\n");
    }
    return Buffer.from("");
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("ExecutorService", () => {
  let service: ExecutorService;
  let mockDb: ReturnType<typeof createMockDb>;
  const mockOnEvent = jest.fn();
  const mockQueryFn = jest.fn();

  beforeEach(() => {
    mockDb = createMockDb();
    service = new ExecutorService(mockDb as any);
    mockOnEvent.mockClear();
    mockExecFileSync.mockClear();
    mockExecFileSync.mockReturnValue(Buffer.from(""));
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockClear();
    mockQueryFn.mockClear();
    // Spy on loadQueryFn to bypass dynamic import
    jest.spyOn(service as any, "loadQueryFn").mockResolvedValue(mockQueryFn);
  });

  afterEach(() => {
    jest.clearAllMocks();
    (service as any).running.clear();
  });

  // =========================================================================
  // getRunningCount
  // =========================================================================
  describe("getRunningCount", () => {
    it("초기 상태에서 0을 반환한다", () => {
      expect(service.getRunningCount()).toBe(0);
    });

    it("실행 중인 세션이 있으면 정확한 개수를 반환한다", () => {
      (service as any).running.set("s1", { status: "running" });
      (service as any).running.set("s2", { status: "running" });
      expect(service.getRunningCount()).toBe(2);
    });
  });

  // =========================================================================
  // isRunning
  // =========================================================================
  describe("isRunning", () => {
    it("알 수 없는 세션에 대해 false를 반환한다", () => {
      expect(service.isRunning("unknown")).toBe(false);
    });

    it("실행 중인 세션에 대해 true를 반환한다", () => {
      (service as any).running.set("session-1", { status: "running" });
      expect(service.isRunning("session-1")).toBe(true);
    });
  });

  // =========================================================================
  // execute — guards
  // =========================================================================
  describe("execute guards", () => {
    it("세션이 존재하지 않으면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);
      await expect(
        service.execute("nonexistent", mockOnEvent),
      ).rejects.toThrow(BadRequestException);
    });

    it("스펙이 없으면 BadRequestException을 던진다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue({
        id: "session-1",
        spec: null,
      });
      await expect(
        service.execute("session-1", mockOnEvent),
      ).rejects.toThrow(BadRequestException);
    });

    it("이미 실행 중인 세션이면 BadRequestException을 던진다", async () => {
      (service as any).running.set("session-1", {
        worktreePath: "/tmp/test",
        abortController: new AbortController(),
        status: "running",
      });
      await expect(
        service.execute("session-1", mockOnEvent),
      ).rejects.toThrow(BadRequestException);
    });

    it("최대 동시 실행 수를 초과하면 BadRequestException을 던진다", async () => {
      for (let i = 0; i < 3; i++) {
        (service as any).running.set(`existing-${i}`, {
          worktreePath: `/tmp/w${i}`,
          abortController: new AbortController(),
          status: "running",
        });
      }
      await expect(
        service.execute("new-session", mockOnEvent),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // execute — success flow
  // =========================================================================
  describe("execute success flow", () => {
    beforeEach(() => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      setupExecDefaults();
    });

    it("전체 성공 플로우를 실행한다 — assistant 텍스트 + result", async () => {
      mockQueryFn.mockReturnValue(
        asyncIter([
          {
            type: "assistant",
            message: {
              content: [{ type: "text", text: "기능을 구현합니다." }],
            },
          },
          { type: "result", subtype: "success" },
        ]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      // Verify execution record created
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: mockSessionId, status: "running" }),
      );

      // Verify status events
      const statusEvents = mockOnEvent.mock.calls
        .filter(([e]: any) => e.type === "status")
        .map(([e]: any) => e.status);
      expect(statusEvents).toContain("executing");
      expect(statusEvents).toContain("executed");

      // Verify result event with PR info
      const resultEvent = mockOnEvent.mock.calls.find(([e]: any) => e.type === "result");
      expect(resultEvent).toBeDefined();
      expect(resultEvent![0].prUrl).toContain("pull/42");
      expect(resultEvent![0].prNumber).toBe(42);

      // Verify running map is cleaned up
      expect(service.isRunning(mockSessionId)).toBe(false);
    });

    it("assistant tool_use 메시지를 처리한다 — Read (formatToolInput)", async () => {
      mockQueryFn.mockReturnValue(
        asyncIter([
          {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", name: "Read", input: { file_path: "/src/index.ts" } },
              ],
            },
          },
          { type: "result", subtype: "success" },
        ]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const toolCallEvent = mockOnEvent.mock.calls.find(([e]: any) => e.type === "tool_call");
      expect(toolCallEvent).toBeDefined();
      expect(toolCallEvent![0].tool).toBe("Read");
      expect(toolCallEvent![0].detail).toBe("/src/index.ts");
    });

    it("formatToolInput의 다양한 도구 케이스를 처리한다", async () => {
      mockQueryFn.mockReturnValue(
        asyncIter([
          {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", name: "Bash", input: { command: "pnpm test" } },
                { type: "tool_use", name: "Glob", input: { pattern: "**/*.ts" } },
                { type: "tool_use", name: "Grep", input: { pattern: "import" } },
                { type: "tool_use", name: "Write", input: { file_path: "/a.ts" } },
                { type: "tool_use", name: "Edit", input: { file_path: "/b.ts" } },
                { type: "tool_use", name: "Agent", input: { task: "explore", mode: "deep" } },
              ],
            },
          },
          { type: "result", subtype: "success" },
        ]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const toolCalls = mockOnEvent.mock.calls
        .filter(([e]: any) => e.type === "tool_call")
        .map(([e]: any) => ({ tool: e.tool, detail: e.detail }));

      expect(toolCalls).toEqual([
        { tool: "Bash", detail: "pnpm test" },
        { tool: "Glob", detail: "**/*.ts" },
        { tool: "Grep", detail: "/import/" },
        { tool: "Write", detail: "/a.ts" },
        { tool: "Edit", detail: "/b.ts" },
        { tool: "Agent", detail: "task, mode" },
      ]);
    });

    it("user 메시지의 tool_result를 처리한다 (truncateOutput)", async () => {
      mockQueryFn.mockReturnValue(
        asyncIter([
          {
            type: "user",
            message: {
              content: [{ type: "tool_result", content: "짧은 결과" }],
            },
          },
          { type: "result", subtype: "success" },
        ]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const toolOutput = mockOnEvent.mock.calls.find(([e]: any) => e.type === "tool_output");
      expect(toolOutput).toBeDefined();
      expect(toolOutput![0].content).toBe("짧은 결과");
    });

    it("긴 tool_result 출력을 자른다 (truncateOutput)", async () => {
      const longOutput = "A".repeat(2000);
      mockQueryFn.mockReturnValue(
        asyncIter([
          {
            type: "user",
            message: {
              content: [{ type: "tool_result", content: longOutput }],
            },
          },
          { type: "result", subtype: "success" },
        ]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const toolOutput = mockOnEvent.mock.calls.find(([e]: any) => e.type === "tool_output");
      expect(toolOutput).toBeDefined();
      expect(toolOutput![0].content).toContain("chars truncated");
      expect(toolOutput![0].content.length).toBeLessThan(longOutput.length);
    });

    it("빈 tool_result는 무시한다", async () => {
      mockQueryFn.mockReturnValue(
        asyncIter([
          {
            type: "user",
            message: {
              content: [{ type: "tool_result", content: "" }],
            },
          },
          { type: "result", subtype: "success" },
        ]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const toolOutput = mockOnEvent.mock.calls.find(([e]: any) => e.type === "tool_output");
      expect(toolOutput).toBeUndefined();
    });

    it("tool_use_summary 메시지를 처리한다", async () => {
      mockQueryFn.mockReturnValue(
        asyncIter([
          { type: "tool_use_summary", summary: "파일 3개를 수정했습니다." },
          { type: "result", subtype: "success" },
        ]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const logEvents = mockOnEvent.mock.calls
        .filter(([e]: any) => e.type === "log")
        .map(([e]: any) => e.content);
      expect(logEvents).toContain("파일 3개를 수정했습니다.");
    });

    it("PR URL에서 PR 번호를 추출한다", async () => {
      mockQueryFn.mockReturnValue(
        asyncIter([{ type: "result", subtype: "success" }]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const resultEvent = mockOnEvent.mock.calls.find(([e]: any) => e.type === "result");
      expect(resultEvent).toBeDefined();
      expect(resultEvent![0].prNumber).toBe(42);
    });

    it("PR URL에 번호가 없으면 prNumber는 undefined", async () => {
      mockExecFileSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === "gh" && args?.[0] === "pr") {
          return Buffer.from("Created PR\n");
        }
        if (cmd === "git" && args?.[0] === "rev-parse") {
          return Buffer.from("/home/user/project\n");
        }
        return Buffer.from("");
      });

      mockQueryFn.mockReturnValue(
        asyncIter([{ type: "result", subtype: "success" }]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const resultEvent = mockOnEvent.mock.calls.find(([e]: any) => e.type === "result");
      expect(resultEvent).toBeDefined();
      expect(resultEvent![0].prNumber).toBeUndefined();
    });

    it("CLAUDECODE 환경변수를 저장하고 복원한다", async () => {
      process.env.CLAUDECODE = "test-session-id";

      mockQueryFn.mockReturnValue(
        asyncIter([{ type: "result", subtype: "success" }]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      expect(process.env.CLAUDECODE).toBe("test-session-id");
    });

    it("user 메시지의 비-배열 content를 무시한다", async () => {
      mockQueryFn.mockReturnValue(
        asyncIter([
          { type: "user", message: { content: "string-not-array" } },
          { type: "result", subtype: "success" },
        ]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const toolOutput = mockOnEvent.mock.calls.find(([e]: any) => e.type === "tool_output");
      expect(toolOutput).toBeUndefined();
    });

    it("tool_use_summary에 summary가 없으면 무시한다", async () => {
      mockQueryFn.mockReturnValue(
        asyncIter([
          { type: "tool_use_summary" },
          { type: "result", subtype: "success" },
        ]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      // Should not crash, log events only contain worktree + build + commit logs
      expect(mockOnEvent).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // execute — error handling
  // =========================================================================
  describe("execute error handling", () => {
    beforeEach(() => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      setupExecDefaults();
    });

    it("Claude Code 실행 실패 시 (result subtype !== success) catch 블록을 실행한다", async () => {
      mockQueryFn.mockReturnValue(
        asyncIter([{ type: "result", subtype: "error" }]),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const errorEvent = mockOnEvent.mock.calls.find(([e]: any) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent![0].message).toContain("Claude Code 실행 실패");

      const statusEvents = mockOnEvent.mock.calls
        .filter(([e]: any) => e.type === "status")
        .map(([e]: any) => e.status);
      expect(statusEvents).toContain("failed");

      expect(service.isRunning(mockSessionId)).toBe(false);
    });

    it("createWorktree에서 에러 발생 시 catch 블록을 실행한다", async () => {
      mockExecFileSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === "git" && args?.[0] === "worktree") {
          throw new Error("Worktree creation failed");
        }
        if (cmd === "git" && args?.[0] === "rev-parse") {
          return Buffer.from("/home/user/project\n");
        }
        return Buffer.from("");
      });

      await service.execute(mockSessionId, mockOnEvent);

      const errorEvent = mockOnEvent.mock.calls.find(([e]: any) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent![0].message).toContain("Worktree creation failed");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed" }),
      );
    });

    it("query 중 에러 발생 시 catch 블록을 실행한다", async () => {
      mockQueryFn.mockReturnValue(
        (async function* () {
          throw new Error("SDK connection error");
        })(),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const errorEvent = mockOnEvent.mock.calls.find(([e]: any) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent![0].message).toContain("SDK connection error");
    });

    it("CLAUDECODE 환경변수가 에러 시에도 복원된다", async () => {
      process.env.CLAUDECODE = "restore-me";

      mockQueryFn.mockReturnValue(
        (async function* () {
          throw new Error("fail");
        })(),
      );

      await service.execute(mockSessionId, mockOnEvent);

      expect(process.env.CLAUDECODE).toBe("restore-me");
    });

    it("비-Error 타입 예외도 처리한다", async () => {
      mockQueryFn.mockReturnValue(
        (async function* () {
          throw "string error";
        })(),
      );

      await service.execute(mockSessionId, mockOnEvent);

      const errorEvent = mockOnEvent.mock.calls.find(([e]: any) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent![0].message).toBe("string error");
    });

    it("빌드 실패 시 자동 수정을 시도한다", async () => {
      let tscCallCount = 0;
      mockExecFileSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === "pnpm" && args?.[0] === "tsc") {
          tscCallCount++;
          if (tscCallCount === 1) {
            throw new Error("TS2322: Type error");
          }
          return Buffer.from("");
        }
        if (cmd === "gh" && args?.[0] === "pr") {
          return Buffer.from("https://github.com/org/repo/pull/99\n");
        }
        if (cmd === "git" && args?.[0] === "rev-parse") {
          return Buffer.from("/home/user/project\n");
        }
        return Buffer.from("");
      });

      // First query() for main execution, second for build fix
      let queryCallCount = 0;
      mockQueryFn.mockImplementation(() => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return asyncIter([{ type: "result", subtype: "success" }]);
        }
        return asyncIter([
          {
            type: "assistant",
            message: { content: [{ type: "text", text: "타입 에러를 수정했습니다." }] },
          },
        ]);
      });

      await service.execute(mockSessionId, mockOnEvent);

      const logEvents = mockOnEvent.mock.calls
        .filter(([e]: any) => e.type === "log")
        .map(([e]: any) => e.content);
      expect(logEvents).toContain("빌드 실패 — 자동 수정 시도 중...");
      expect(logEvents).toContain("자동 수정 후 빌드 검증 통과");
      expect(queryCallCount).toBe(2);
    });

    it("빌드 수정 중 tool_use 메시지도 이벤트로 전달한다", async () => {
      let tscCallCount = 0;
      mockExecFileSync.mockImplementation((cmd: string, args?: string[]) => {
        if (cmd === "pnpm" && args?.[0] === "tsc") {
          tscCallCount++;
          if (tscCallCount === 1) throw new Error("Type error");
          return Buffer.from("");
        }
        if (cmd === "gh" && args?.[0] === "pr") {
          return Buffer.from("https://github.com/org/repo/pull/1\n");
        }
        if (cmd === "git" && args?.[0] === "rev-parse") {
          return Buffer.from("/home/user/project\n");
        }
        return Buffer.from("");
      });

      let queryCallCount = 0;
      mockQueryFn.mockImplementation(() => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return asyncIter([{ type: "result", subtype: "success" }]);
        }
        return asyncIter([
          {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", name: "Edit", input: { file_path: "/fix.ts" } },
              ],
            },
          },
        ]);
      });

      await service.execute(mockSessionId, mockOnEvent);

      const toolCallEvents = mockOnEvent.mock.calls.filter(([e]: any) => e.type === "tool_call");
      expect(toolCallEvents.length).toBeGreaterThanOrEqual(1);
      expect(toolCallEvents.some(([e]: any) => e.tool === "Edit")).toBe(true);
    });
  });

  // =========================================================================
  // execute — abort mid-stream
  // =========================================================================
  describe("execute abort", () => {
    it("abort 시 스트림을 중단한다", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      setupExecDefaults();

      const abortableIter = (async function* () {
        yield {
          type: "assistant",
          message: { content: [{ type: "text", text: "Step 1" }] },
        };
        // Abort between messages
        const running = (service as any).running.get(mockSessionId);
        if (running) running.abortController.abort();
        yield {
          type: "assistant",
          message: { content: [{ type: "text", text: "Step 2 — should not emit after break" }] },
        };
      })();

      mockQueryFn.mockReturnValue(abortableIter);

      await service.execute(mockSessionId, mockOnEvent);

      const logEvents = mockOnEvent.mock.calls
        .filter(([e]: any) => e.type === "log")
        .map(([e]: any) => e.content);
      expect(logEvents).toContain("Step 1");
    });
  });

  // =========================================================================
  // cancel
  // =========================================================================
  describe("cancel", () => {
    it("실행 중이 아닌 세션을 취소하면 BadRequestException을 던진다", async () => {
      await expect(service.cancel("unknown")).rejects.toThrow(BadRequestException);
    });

    it("실행 중인 세션을 취소하면 AbortController를 abort한다", async () => {
      const abortController = new AbortController();
      (service as any).running.set("session-1", {
        worktreePath: "/tmp/test",
        abortController,
        status: "running",
      });

      await service.cancel("session-1");

      expect(abortController.signal.aborted).toBe(true);
    });

    it("취소 시 상태를 cancelled로 변경한다", async () => {
      const entry = {
        worktreePath: "/tmp/test",
        abortController: new AbortController(),
        status: "running" as const,
      };
      (service as any).running.set("session-1", entry);

      await service.cancel("session-1");

      expect(entry.status).toBe("cancelled");
    });
  });

  // =========================================================================
  // createWorktree (private)
  // =========================================================================
  describe("createWorktree", () => {
    it("WORKTREE_BASE가 존재하지 않으면 디렉토리를 생성한다", () => {
      mockExistsSync.mockReturnValue(false);

      const createWorktree = (service as any).createWorktree.bind(service);
      createWorktree("/tmp/worktree", "feat/test");

      expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it("WORKTREE_BASE가 이미 존재하면 디렉토리를 생성하지 않는다", () => {
      mockExistsSync.mockReturnValue(true);

      const createWorktree = (service as any).createWorktree.bind(service);
      createWorktree("/tmp/worktree", "feat/test");

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it("git worktree add 명령을 실행한다", () => {
      const createWorktree = (service as any).createWorktree.bind(service);
      createWorktree("/tmp/worktree", "feat/test");

      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", "-b", "feat/test", "/tmp/worktree", "develop"],
        expect.objectContaining({ timeout: 30_000 }),
      );
    });
  });

  // =========================================================================
  // cleanupWorktree (private)
  // =========================================================================
  describe("cleanupWorktree", () => {
    it("worktree 제거 및 브랜치 삭제를 실행한다", () => {
      const cleanupWorktree = (service as any).cleanupWorktree.bind(service);
      cleanupWorktree("/tmp/worktree", "feat/test");

      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["worktree", "remove", "/tmp/worktree", "--force"],
        expect.objectContaining({ timeout: 30_000 }),
      );
      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["branch", "-D", "feat/test"],
        expect.objectContaining({ timeout: 10_000 }),
      );
    });

    it("에러 발생 시 throw하지 않고 경고만 남긴다", () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("git worktree remove failed");
      });

      const cleanupWorktree = (service as any).cleanupWorktree.bind(service);
      expect(() => cleanupWorktree("/tmp/worktree", "feat/test")).not.toThrow();
    });
  });
});
