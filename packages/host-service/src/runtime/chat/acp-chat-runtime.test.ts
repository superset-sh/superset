import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AcpChatRuntime } from "./acp-chat-runtime";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("AcpChatRuntime", () => {
	test("streams ACP assistant and tool updates into Superset chat state", async () => {
		const cwd = createTempDir();
		const script = writeAgentScript(cwd, streamingAgentScript());
		const runtime = new AcpChatRuntime({
			supersetSessionId: crypto.randomUUID(),
			workspaceId: crypto.randomUUID(),
			cwd,
			command: process.execPath,
			args: [script],
		});

		try {
			await runtime.initialize();
			const result = await runtime.sendMessage({ content: "Say hi" });

			expect(result.stopReason).toBe("end_turn");
			expect(runtime.getDisplayState().isRunning).toBe(false);
			expect(runtime.getDisplayState().currentMessage).toBeNull();
			expect(runtime.listMessages()).toHaveLength(2);
			expect(runtime.listMessages()[0]?.role).toBe("user");
			const assistant = runtime.listMessages()[1];
			expect(assistant?.role).toBe("assistant");
			expect(assistant?.content).toEqual([
				{ type: "text", text: "Hello world" },
				{
					type: "tool_call",
					id: "1",
					name: "read",
					args: { path: "README.md" },
				},
				{
					type: "tool_result",
					id: "1",
					name: "read",
					result: [
						{ type: "content", content: { type: "text", text: "done" } },
					],
				},
			]);
		} finally {
			await runtime.dispose();
		}
	});

	test("surfaces ACP permission requests and resolves selected options", async () => {
		const cwd = createTempDir();
		const script = writeAgentScript(cwd, permissionAgentScript());
		const runtime = new AcpChatRuntime({
			supersetSessionId: crypto.randomUUID(),
			workspaceId: crypto.randomUUID(),
			cwd,
			command: process.execPath,
			args: [script],
		});

		try {
			await runtime.initialize();
			const sendPromise = runtime.sendMessage({ content: "Edit file" });
			await waitFor(() => runtime.getDisplayState().pendingApproval !== null);

			expect(runtime.getDisplayState().pendingApproval).toEqual({
				toolCallId: "perm-1",
				toolName: "Edit file",
				args: { path: "README.md" },
			});
			runtime.respondToApproval({ decision: "approve" });
			await sendPromise;

			expect(runtime.getDisplayState().pendingApproval).toBeNull();
			expect(runtime.listMessages()[1]?.content).toEqual([
				{ type: "text", text: "permission:allow-once" },
			]);
		} finally {
			await runtime.dispose();
		}
	});

	test("rejects concurrent ACP prompts for one chat session", async () => {
		const cwd = createTempDir();
		const script = writeAgentScript(cwd, hangingAgentScript());
		const runtime = new AcpChatRuntime({
			supersetSessionId: crypto.randomUUID(),
			workspaceId: crypto.randomUUID(),
			cwd,
			command: process.execPath,
			args: [script],
		});

		try {
			await runtime.initialize();
			const sendPromise = runtime.sendMessage({ content: "First" });
			await expect(runtime.sendMessage({ content: "Second" })).rejects.toThrow(
				"ACP chat already has a prompt in progress",
			);
			runtime.stop();
			await expect(sendPromise).resolves.toEqual({ stopReason: "cancelled" });
		} finally {
			await runtime.dispose();
		}
	});
});

function createTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "superset-acp-test-"));
	tempDirs.push(dir);
	return dir;
}

function writeAgentScript(dir: string, content: string): string {
	const script = join(dir, "agent.mjs");
	writeFileSync(script, content, "utf-8");
	return script;
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await nextEventLoopTurn();
	}
	throw new Error("Timed out waiting for condition");
}

function nextEventLoopTurn(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	return promise;
}

function agentHarness(body: string): string {
	return `
import { createInterface } from "node:readline";
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
function send(message) { process.stdout.write(JSON.stringify(message) + "\\n"); }
${body}
rl.on("line", (line) => {
  const message = JSON.parse(line);
  handleMessage(message);
});
`;
}

function streamingAgentScript(): string {
	return agentHarness(`
function handleMessage(message) {
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } });
    return;
  }
  if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "acp-session" } });
    return;
  }
  if (message.method === "session/prompt") {
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "acp-session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello " } } } });
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "acp-session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "world" } } } });
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "acp-session", update: { sessionUpdate: "tool_call", toolCallId: 1, title: "read", rawInput: { path: "README.md" } } } });
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "acp-session", update: { sessionUpdate: "tool_call_update", toolCallId: 1, status: "completed", content: [{ type: "content", content: { type: "text", text: "done" } }] } } });
    send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
  }
}
`);
}

function permissionAgentScript(): string {
	return agentHarness(`
let promptId = null;
function handleMessage(message) {
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } });
    return;
  }
  if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "acp-session" } });
    return;
  }
  if (message.method === "session/prompt") {
    promptId = message.id;
    send({ jsonrpc: "2.0", id: 900, method: "session/request_permission", params: { sessionId: "acp-session", toolCall: { toolCallId: "perm-1", title: "Edit file", rawInput: { path: "README.md" } }, options: [{ optionId: "allow-once", name: "Allow once", kind: "allow_once" }, { optionId: "reject", name: "Reject", kind: "reject_once" }] } });
    return;
  }
  if (message.id === 900 && message.result) {
    const optionId = message.result.outcome.optionId;
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "acp-session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "permission:" + optionId } } } });
    send({ jsonrpc: "2.0", id: promptId, result: { stopReason: "end_turn" } });
  }
}
`);
}

function hangingAgentScript(): string {
	return agentHarness(`
function handleMessage(message) {
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } });
    return;
  }
  if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "acp-session" } });
    return;
  }
}
`);
}
