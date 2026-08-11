import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type CanUseTool,
	type Options,
	type PermissionResult,
	query,
	type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

const FIXTURES_DIR = resolve(
	fileURLToPath(new URL(".", import.meta.url)),
	"../src/harness/claude/fixtures",
);

const MODEL = process.env.FIXTURE_MODEL ?? "claude-haiku-4-5-20251001";

type Scenario = {
	name: string;
	prompt: string;
	seed?: (cwd: string) => void;
	allowedTools?: string[];
	decide?: (
		toolName: string,
		input: Record<string, unknown>,
	) => PermissionResult;
	abortAfterToolUse?: boolean;
};

// `updatedInput` is optional in the SDK types but required by its runtime zod
// schema: omitting it fails the tool call with a ZodError.
const allow = (input: Record<string, unknown>): PermissionResult => ({
	behavior: "allow",
	updatedInput: input,
});

const SCENARIOS: Scenario[] = [
	{
		name: "text-reply",
		prompt: "Reply with exactly: hello",
		allowedTools: [],
	},
	{
		name: "bash-run",
		prompt: "Run the shell command `echo hi` and tell me what it printed.",
		allowedTools: ["Bash"],
		decide: (_name, input) => allow(input),
	},
	{
		name: "edit-approved",
		prompt: "In note.txt, replace the word foo with bar. Do not explain.",
		seed: (cwd) => writeFileSync(join(cwd, "note.txt"), "foo\n"),
		decide: (_name, input) => allow(input),
	},
	{
		name: "edit-declined",
		prompt:
			"In note.txt, replace the word foo with bar, then tell me if it worked.",
		seed: (cwd) => writeFileSync(join(cwd, "note.txt"), "foo\n"),
		decide: (toolName, input) =>
			toolName === "Edit" || toolName === "Write"
				? { behavior: "deny", message: "User declined this edit." }
				: allow(input),
	},
	{
		name: "abort-mid-tool",
		prompt:
			"Run this exact shell command and report its output: for i in $(seq 1 30); do echo tick; sleep 1; done",
		allowedTools: ["Bash"],
		decide: (_name, input) => allow(input),
		abortAfterToolUse: true,
	},
	{
		name: "subagent-task",
		prompt:
			'Call the Task tool once with subagent_type "general-purpose" and a prompt telling it to reply with the word ping. Use the Task tool, not TaskCreate.',
		decide: (_name, input) => allow(input),
	},
];

function optionsFor(
	scenario: Scenario,
	cwd: string,
	abortController: AbortController,
): Options {
	const canUseTool: CanUseTool | undefined = scenario.decide
		? async (toolName, input) =>
				scenario.decide?.(toolName, input) ?? allow(input)
		: undefined;

	return {
		cwd,
		model: MODEL,
		includePartialMessages: true,
		settingSources: [],
		permissionMode: "default",
		abortController,
		canUseTool,
		allowedTools: scenario.allowedTools,
		env: { ...process.env, CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: "1" },
	};
}

// Fixtures are committed and public: never ship the recording machine's paths.
function redact(line: string, cwd: string): string {
	return line
		.split(JSON.stringify(cwd).slice(1, -1))
		.join("/workspace")
		.split(JSON.stringify(homedir()).slice(1, -1))
		.join("/home/user")
		.replace(/\/private\/var\/folders\/[^"\\ ]*/g, "/workspace");
}

async function record(scenario: Scenario): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), `claude-fixture-${scenario.name}-`));
	scenario.seed?.(cwd);

	const abortController = new AbortController();
	const messages: SDKMessage[] = [];
	const started = Date.now();
	let sawToolUse = false;

	try {
		for await (const message of query({
			prompt: scenario.prompt,
			options: optionsFor(scenario, cwd, abortController),
		})) {
			messages.push(message);

			if (scenario.abortAfterToolUse && !sawToolUse) {
				const isToolUse =
					message.type === "assistant" &&
					message.message.content.some((block) => block.type === "tool_use");
				if (isToolUse) {
					sawToolUse = true;
					abortController.abort();
				}
			}
		}
	} catch (error) {
		if (!scenario.abortAfterToolUse) throw error;
		messages.push({
			type: "system",
			subtype: "recorder_abort",
			error: String(error),
		} as unknown as SDKMessage);
	}

	const lines = messages
		.map((message) => redact(JSON.stringify(message), cwd))
		.join("\n");
	writeFileSync(join(FIXTURES_DIR, `${scenario.name}.jsonl`), `${lines}\n`);

	const kinds = new Map<string, number>();
	for (const message of messages) {
		kinds.set(message.type, (kinds.get(message.type) ?? 0) + 1);
	}
	console.log(
		`${scenario.name}: ${messages.length} messages in ${Math.round(
			(Date.now() - started) / 1000,
		)}s — ${[...kinds].map(([type, count]) => `${type}x${count}`).join(" ")}`,
	);
}

async function main(): Promise<void> {
	mkdirSync(FIXTURES_DIR, { recursive: true });
	const only = process.argv.slice(2);
	const selected = only.length
		? SCENARIOS.filter((scenario) => only.includes(scenario.name))
		: SCENARIOS;

	for (const scenario of selected) {
		await record(scenario);
	}
}

await main();
