import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	createPrimeAgentExtension,
	createPrimeAgentWrapper,
	getPrimeAgentExtensionPath,
} from "./agent-wrappers-prime-agent";

const home = mkdtempSync(path.join(tmpdir(), "superset-prime-agent-"));
const previousHome = process.env.SUPERSET_HOME_DIR;
let bridgePath: string;
process.env.SUPERSET_HOME_DIR = home;

afterAll(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(home, { recursive: true, force: true });
});

describe("Prime Agent integration", () => {
	it("passes an environment-scoped extension and keeps user arguments", () => {
		mkdirSync(path.join(home, "hooks"), { recursive: true });
		mkdirSync(path.join(home, "bin"), { recursive: true });
		createPrimeAgentExtension();
		createPrimeAgentWrapper();
		const realBin = path.join(home, "real-bin");
		mkdirSync(realBin);
		writeFileSync(
			path.join(realBin, "prime-agent"),
			"#!/bin/bash\nprintf '%s\n' \"$@\"\n",
			{ mode: 0o755 },
		);
		chmodSync(path.join(realBin, "prime-agent"), 0o755);
		const run = (terminalId: string, argv = ["--resume", "session-1"]) =>
			spawnSync(path.join(home, "bin", "prime-agent"), argv, {
				encoding: "utf8",
				env: {
					...process.env,
					SUPERSET_TERMINAL_ID: terminalId,
					SUPERSET_AGENT_ID: "",
					PATH: `${path.join(home, "bin")}:${realBin}:${process.env.PATH}`,
				},
			});
		const inTerminal = run("terminal-1");
		expect(inTerminal.status).toBe(0);
		const args = inTerminal.stdout.trim().split("\n");
		bridgePath = args[1] ?? "";
		expect(args).toEqual(["--extension", bridgePath, "--resume", "session-1"]);
		expect(readFileSync(bridgePath, "utf8")).toContain(
			getPrimeAgentExtensionPath(),
		);
		expect(run("").stdout.trim().split("\n")).toEqual([
			"--resume",
			"session-1",
		]);
		expect(
			run("terminal-1", ["sessions", "--all"]).stdout.trim().split("\n"),
		).toEqual(["sessions", "--all"]);
	});

	it("reports attach, working, completed, and detach with the resumable session id", () => {
		const notify = path.join(home, "hooks", "notify.sh");
		const events = path.join(home, "events.jsonl");
		writeFileSync(
			notify,
			`#!/bin/bash\nprintf "%s\\n" "$1" >> ${JSON.stringify(events)}\n`,
			{ mode: 0o755 },
		);
		chmodSync(notify, 0o755);
		const script = `import extension from ${JSON.stringify(bridgePath)};
const handlers = {};
extension({ on(name, handler) { handlers[name] = handler; }, registerTool() {} });
const ctx = { sessionManager: { getSessionId: () => "session-uuid" } };
for (const name of ["session_start", "agent_start", "agent_end", "session_shutdown"]) handlers[name](name === "agent_end" ? { messages: [] } : {}, ctx);`;
		const result = spawnSync(
			process.execPath,
			["--input-type=module", "-e", script],
			{
				encoding: "utf8",
				env: {
					...process.env,
					SUPERSET_HOME_DIR: home,
					SUPERSET_TERMINAL_ID: "",
					SUPERSET_AGENT_ID: "",
					PRIME_TEST_EVENTS: events,
				},
			},
		);
		expect(result.status).toBe(0);
		expect(
			readFileSync(events, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line)),
		).toEqual(
			["SessionStart", "Start", "Stop", "SessionEnd"].map(
				(hook_event_name) => ({ hook_event_name, session_id: "session-uuid" }),
			),
		);
	});

	it("shows attention only while the question dialog is pending", () => {
		const events = path.join(home, "events.jsonl");
		writeFileSync(events, "");
		const script = `import extension from ${JSON.stringify(bridgePath)};
import { readFileSync } from "node:fs";
const handlers = {};
let tool;
extension({ on(name, handler) { handlers[name] = handler; }, registerTool(value) { tool = value; } });
let answer;
let opened;
const dialogOpened = new Promise((resolve) => { opened = resolve; });
let timerFired;
const attentionSent = new Promise((resolve) => { timerFired = resolve; });
const ctx = {
  hasUI: true,
  setTimeout(callback) { return setTimeout(async () => { await callback(); timerFired(); }, 0); },
  clearTimeout(timer) { clearTimeout(timer); },
  sessionManager: { getSessionId: () => "session-uuid" },
  ui: { input() { opened(); return new Promise((resolve) => { answer = resolve; }); } },
};
await handlers.agent_start({}, ctx);
const pending = tool.execute("call-1", { question: "Which option?" }, undefined, undefined, ctx);
await dialogOpened;
await attentionSent;
const during = readFileSync(${JSON.stringify(events)}, "utf8").trim().split("\\n").map(JSON.parse).map((event) => event.hook_event_name);
answer("Option A");
const result = await pending;
ctx.ui.input = async () => undefined;
const cancelled = await tool.execute("call-2", { question: "Still waiting?" }, undefined, undefined, ctx);
await handlers.agent_end({ messages: [{ role: "assistant", stopReason: "stop" }] }, ctx);
const after = readFileSync(${JSON.stringify(events)}, "utf8").trim().split("\\n").map(JSON.parse).map((event) => event.hook_event_name);
console.log(JSON.stringify({ name: tool.name, during, after, result, cancelled }));`;
		const result = spawnSync(
			process.execPath,
			["--input-type=module", "-e", script],
			{
				encoding: "utf8",
				env: {
					...process.env,
					SUPERSET_TERMINAL_ID: "",
					SUPERSET_AGENT_ID: "",
				},
			},
		);
		expect(result.status).toBe(0);
		const output = JSON.parse(result.stdout.trim());
		expect(output.name).toBe("superset_ask_user");
		expect(output.during).toEqual(["Start", "PermissionRequest"]);
		expect(output.after).toEqual([
			"Start",
			"PermissionRequest",
			"Start",
			"Stop",
		]);
		expect(output.result.content).toEqual([{ type: "text", text: "Option A" }]);
		expect(output.cancelled.content).toEqual([
			{ type: "text", text: "User cancelled the question." },
		]);
	});

	it("reports a final model error as Failed, not Stop", () => {
		const events = path.join(home, "events.jsonl");
		writeFileSync(events, "");
		const script = `import extension from ${JSON.stringify(bridgePath)};
import { readFileSync } from "node:fs";
const handlers = {};
extension({ on(name, handler) { handlers[name] = handler; }, registerTool() {} });
const ctx = { sessionManager: { getSessionId: () => "session-uuid" } };
await handlers.agent_start({}, ctx);
await handlers.agent_end({ messages: [{ role: "assistant", stopReason: "error", errorMessage: "Provider unavailable" }] }, ctx);
console.log(JSON.stringify(readFileSync(${JSON.stringify(events)}, "utf8").trim().split("\\n").map(JSON.parse).map((event) => event.hook_event_name)));`;
		const result = spawnSync(
			process.execPath,
			["--input-type=module", "-e", script],
			{
				encoding: "utf8",
				env: {
					...process.env,
					SUPERSET_TERMINAL_ID: "",
					SUPERSET_AGENT_ID: "",
				},
			},
		);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout.trim())).toEqual(["Start", "Failed"]);
	});
});
