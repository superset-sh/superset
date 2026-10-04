import { describe, expect, it, mock } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { AgentIdentity } from "@superset/shared/agent-identity";
import { buildCodexWrapperExecLine } from "../../../agent-setup/src/agent-wrappers-claude-codex-opencode";
import { buildWrapperScript } from "../../../agent-setup/src/agent-wrappers-common";
import { getNotifyScriptContent } from "../../../agent-setup/src/notify-hook";
import type { AgentLifecycleEventType } from "../../src/events";
import { TerminalAgentStore } from "../../src/terminal-agents";
import { notificationsRouter } from "../../src/trpc/router/notifications/notifications";
import type { HostServiceContext } from "../../src/types";

interface BroadcastedAgentLifecycleEvent {
	workspaceId: string;
	eventType: AgentLifecycleEventType;
	terminalId: string;
	agent?: AgentIdentity;
	preview?: string;
	occurredAt: number;
}

function createContext() {
	const broadcastAgentLifecycle = mock(
		(_event: BroadcastedAgentLifecycleEvent) => {},
	);
	const terminalAgentStore = new TerminalAgentStore();
	const ctx = {
		db: {
			query: {
				terminalSessions: {
					findFirst: () => ({
						sync: () => ({ originWorkspaceId: "workspace-1" }),
					}),
				},
				workspaces: { findFirst: () => ({ sync: () => ({ taskId: null }) }) },
			},
			update: () => ({ set: () => ({ where: () => ({ run: () => {} }) }) }),
			select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }),
		},
		eventBus: {
			broadcastAgentLifecycle,
			broadcastAgentBindingsChanged: () => {},
			broadcastWorkspaceChanged: () => {},
		},
		terminalAgentStore,
	} as unknown as HostServiceContext;
	return { ctx, broadcastAgentLifecycle, terminalAgentStore };
}

function createShellHookContext(agentId = "claude") {
	const context = createContext();
	const caller = notificationsRouter.createCaller(context.ctx);
	const root = mkdtempSync(resolve(tmpdir(), "nested hook "));
	const bin = resolve(root, "bin");
	const notify = resolve(root, "hooks", "notify.sh");
	mkdirSync(bin, { recursive: true });
	mkdirSync(resolve(root, "hooks"));
	writeFileSync(notify, getNotifyScriptContent(), { mode: 0o755 });
	const server = Bun.serve({
		port: 0,
		fetch: async (request) => {
			const body = (await request.json()) as {
				json: Parameters<typeof caller.hook>[0];
			};
			const result = await caller.hook(body.json);
			if (body.json.eventType === "PermissionRequest") {
				writeFileSync(resolve(root, "approval-seen"), "1");
			}
			return Response.json({ result: { data: { json: result } } });
		},
	});
	const env = {
		...process.env,
		PATH: `${bin}:/usr/bin:/bin`,
		TMPDIR: `${root}/`,
		SUPERSET_HOME_DIR: root,
		SUPERSET_AGENT_ID: agentId,
		SUPERSET_AGENT_LAUNCH_ID: "launch-A",
		SUPERSET_NESTED_AGENT: "",
		SUPERSET_TERMINAL_ID: "terminal-1",
		SUPERSET_TAB_ID: "",
		SUPERSET_DEBUG_HOOKS: "0",
		SUPERSET_ENV: "test",
		NODE_ENV: "test",
		SUPERSET_HOST_AGENT_HOOK_URL: `http://127.0.0.1:${server.port}/trpc/notifications.hook`,
	};
	async function run(script: string, overrides: Record<string, string> = {}) {
		const proc = Bun.spawn({
			cmd: ["bash", "-c", script],
			env: { ...env, ...overrides },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stderr).text(),
		]);
		expect(stderr).toBe("");
		expect(exitCode).toBe(0);
	}
	async function hook(event: string, sessionId = "A", extra = {}) {
		await run(
			`"${notify}" '${JSON.stringify({ hook_event_name: event, session_id: sessionId, ...extra })}'`,
		);
	}
	function binary(name: string, body: string) {
		writeFileSync(resolve(bin, name), `#!/bin/bash\n${body}\n`, {
			mode: 0o755,
		});
	}
	return {
		...context,
		root,
		notify,
		run,
		hook,
		binary,
		close() {
			server.stop(true);
			rmSync(root, { recursive: true, force: true });
		},
	};
}

describe("wrapper hook lifecycle isolation", () => {
	it("preserves A's binding, status and roster while nested B starts and ends", async () => {
		const h = createShellHookContext();
		try {
			await h.hook("SessionStart");
			await h.hook("UserPromptSubmit");
			await h.hook("SubagentStart", "A", { agent_id: "child-A" });
			const before = h.terminalAgentStore.get("terminal-1");
			const broadcasts = h.broadcastAgentLifecycle.mock.calls.length;
			h.binary(
				"claude",
				`"${h.notify}" '{"hook_event_name":"SessionStart","session_id":"B"}'
"${h.notify}" '{"hook_event_name":"UserPromptSubmit","session_id":"B"}'
"${h.notify}" '{"hook_event_name":"SessionEnd","session_id":"B"}'`,
			);
			await h.run(
				buildWrapperScript("claude", 'exec "$REAL_BIN" "$@"', {
					agentId: "claude",
				}),
			);
			expect(h.terminalAgentStore.get("terminal-1")).toEqual(before);
			expect(before?.agentSessionId).toBe("A");
			expect(before?.lastEventType).toBe("Start");
			expect(before?.subagents?.map((child) => child.id)).toEqual(["child-A"]);
			expect(h.broadcastAgentLifecycle.mock.calls.length).toBe(broadcasts);
		} finally {
			h.close();
		}
	});

	it("accepts Claude clear's SessionEnd A followed by SessionStart A2", async () => {
		const h = createShellHookContext();
		try {
			await h.hook("SessionStart");
			await h.hook("SubagentStart", "A", { agent_id: "child-A" });
			await h.hook("SessionEnd");
			expect(h.terminalAgentStore.get("terminal-1")).toBeUndefined();
			await h.hook("SessionStart", "A2");
			expect(h.terminalAgentStore.get("terminal-1")).toMatchObject({
				agentSessionId: "A2",
				lastEventType: "Attached",
			});
			expect(h.terminalAgentStore.get("terminal-1")?.subagents).toBeUndefined();
		} finally {
			h.close();
		}
	});

	it("accepts Codex new's SessionStart A2 without SessionEnd", async () => {
		const h = createShellHookContext("codex");
		try {
			await h.hook("SessionStart");
			await h.hook("SubagentStart", "A", { agent_id: "child-A" });
			await h.hook("SessionStart", "A2");
			expect(h.terminalAgentStore.get("terminal-1")).toMatchObject({
				agentId: "codex",
				agentSessionId: "A2",
				lastEventType: "Attached",
			});
			expect(h.terminalAgentStore.get("terminal-1")?.subagents).toBeUndefined();
		} finally {
			h.close();
		}
	});

	it("accepts the real Codex wrapper watcher's Start and PermissionRequest and its exit fallback", async () => {
		const h = createShellHookContext("codex");
		try {
			h.binary(
				"codex",
				`printf '%s' "$SUPERSET_NESTED_AGENT" > "$SUPERSET_HOME_DIR/marker"
printf '%s\n' '{"dir":"from_tui","kind":"op","UserTurn":{}}' '{"exec_approval_request":{}}' > "$CODEX_TUI_SESSION_LOG_PATH"
for i in {1..80}; do
  [ -f "$SUPERSET_HOME_DIR/approval-seen" ] && exit 0
  sleep 0.1
done
exit 1`,
			);
			await h.run(
				buildWrapperScript("codex", buildCodexWrapperExecLine(h.notify), {
					agentId: "codex",
				}),
				{ SUPERSET_AGENT_ID: "", SUPERSET_AGENT_LAUNCH_ID: "" },
			);
			expect(readFileSync(resolve(h.root, "marker"), "utf-8")).toBe("");
			const events = h.broadcastAgentLifecycle.mock.calls.map(
				([event]) => event.eventType,
			);
			expect(events).toContain("Start");
			expect(events).toContain("PermissionRequest");
			expect(events.at(-1)).toBe("Detached");
			expect(h.terminalAgentStore.get("terminal-1")).toBeUndefined();
		} finally {
			h.close();
		}
	});

	it("keeps Codex's sessionless exit fallback after A2 replaced A", async () => {
		const h = createShellHookContext("codex");
		try {
			await h.hook("SessionStart");
			await h.hook("SessionStart", "A2");
			h.binary("codex", "exit 0");
			await h.run(
				buildWrapperScript("codex", buildCodexWrapperExecLine(h.notify), {
					agentId: "codex",
				}),
				{ SUPERSET_AGENT_ID: "", SUPERSET_AGENT_LAUNCH_ID: "" },
			);
			expect(h.terminalAgentStore.get("terminal-1")).toBeUndefined();
			expect(h.broadcastAgentLifecycle.mock.calls.at(-1)?.[0].eventType).toBe(
				"Detached",
			);
		} finally {
			h.close();
		}
	});

	it("binds C after A exits", async () => {
		const h = createShellHookContext();
		try {
			await h.hook("SessionStart");
			await h.hook("SessionEnd");
			await h.hook("SessionStart", "C");
			await h.hook("UserPromptSubmit", "C");
			expect(h.terminalAgentStore.get("terminal-1")).toMatchObject({
				agentSessionId: "C",
				lastEventType: "Start",
			});
		} finally {
			h.close();
		}
	});

	it.each([
		"",
		"legacy",
	])("keeps historical replacement and detach without a marker (%s hooks)", async (version) => {
		const h = createShellHookContext();
		try {
			await h.hook("SessionStart");
			await h.hook("SubagentStart", "A", { agent_id: "child-A" });
			if (version === "legacy") {
				await h.run(
					`"${h.notify}" '{"hook_event_name":"SessionStart","session_id":"B"}'`,
					{ SUPERSET_AGENT_LAUNCH_ID: "" },
				);
			} else {
				await h.hook("SessionStart", "B");
			}
			expect(h.terminalAgentStore.get("terminal-1")?.agentSessionId).toBe("B");
			expect(h.terminalAgentStore.get("terminal-1")?.subagents).toBeUndefined();
			await h.hook("SessionEnd", "B");
			expect(h.terminalAgentStore.get("terminal-1")).toBeUndefined();
		} finally {
			h.close();
		}
	});

	it("counts A's subagents and ignores B's subagents", async () => {
		const h = createShellHookContext();
		try {
			await h.hook("SessionStart");
			await h.hook("SubagentStart", "A", { agent_id: "child-A" });
			h.binary(
				"claude",
				`"${h.notify}" '{"hook_event_name":"SubagentStart","session_id":"B","agent_id":"child-B"}'
"${h.notify}" '{"hook_event_name":"SubagentStop","session_id":"A","agent_id":"child-A"}'`,
			);
			await h.run(
				buildWrapperScript("claude", 'exec "$REAL_BIN" "$@"', {
					agentId: "claude",
				}),
			);
			expect(
				h.terminalAgentStore
					.get("terminal-1")
					?.subagents?.map((child) => child.id),
			).toEqual(["child-A"]);
		} finally {
			h.close();
		}
	});
});
