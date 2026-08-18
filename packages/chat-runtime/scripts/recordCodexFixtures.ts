import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	CodexRpcClient,
	spawnCodexTransport,
} from "../src/harness/codex/rpcClient";

type RecordedFrame = { direction: "in" | "out"; frame: unknown };

type Scenario = {
	name: string;
	prompt: string;
	sandbox: "read-only" | "workspace-write" | "danger-full-access";
	approvalPolicy: "untrusted" | "on-request" | "never";
	approvalDecision?: "accept" | "decline";
	interruptAfterMs?: number;
	seedFiles?: Record<string, string>;
	timeoutMs: number;
};

const SCENARIOS: Scenario[] = [
	{
		name: "text",
		prompt: "Reply with exactly the word: hello. Do not use any tools.",
		sandbox: "read-only",
		approvalPolicy: "never",
		timeoutMs: 90_000,
	},
	{
		name: "command",
		prompt:
			"Run the shell command `echo superset-probe` and then tell me its output. Do not do anything else.",
		sandbox: "workspace-write",
		approvalPolicy: "never",
		timeoutMs: 90_000,
	},
	{
		name: "fileChange",
		prompt:
			"Create a file named notes.txt in the current directory containing exactly the text `hi`. Do not do anything else.",
		sandbox: "workspace-write",
		approvalPolicy: "never",
		timeoutMs: 90_000,
	},
	{
		name: "fileEdit",
		prompt:
			"In notes.txt, change the word `beta` to `BETA`. Do not do anything else.",
		sandbox: "workspace-write",
		approvalPolicy: "never",
		seedFiles: { "notes.txt": "alpha\nbeta\ngamma\ndelta\nepsilon\n" },
		timeoutMs: 90_000,
	},
	{
		name: "approval",
		prompt:
			"Run the shell command `touch approved.txt` in the current directory. Do not do anything else.",
		sandbox: "read-only",
		approvalPolicy: "on-request",
		approvalDecision: "accept",
		timeoutMs: 120_000,
	},
	{
		name: "interrupt",
		prompt:
			"Write out the numbers from 1 to 500, one per line, as your reply text. Do not use tools.",
		sandbox: "read-only",
		approvalPolicy: "never",
		interruptAfterMs: 6_000,
		timeoutMs: 90_000,
	},
];

const APPROVAL_METHODS = new Set([
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
]);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isolatedCodexHome(): string {
	const home = mkdtempSync(join(tmpdir(), "codex-fixture-home-"));
	copyFileSync(
		join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"),
		join(home, "auth.json"),
	);
	return home;
}

// Fixtures are committed to a public repo, so anything carrying account state
// is emptied here. The adapter ignores these notifications; only their method
// and ordering matter to the replay tests.
const REDACTED_PARAMS = new Set(["account/rateLimits/updated"]);

function redact(recorded: RecordedFrame): string {
	const frame = recorded.frame as { method?: string; params?: unknown };
	const scrubbed =
		frame.method && REDACTED_PARAMS.has(frame.method)
			? { ...recorded, frame: { ...frame, params: "<redacted>" } }
			: recorded;
	return JSON.stringify(scrubbed)
		.replaceAll(homedir(), "/home/codex")
		.replace(/"installationId":"[^"]*"/g, '"installationId":"<redacted>"');
}

async function record(
	scenario: Scenario,
	outputDir: string,
	command: string,
	codexHome: string,
): Promise<void> {
	const frames: RecordedFrame[] = [];
	const cwd = mkdtempSync(join(tmpdir(), `codex-fixture-${scenario.name}-`));
	for (const [name, contents] of Object.entries(scenario.seedFiles ?? {})) {
		writeFileSync(join(cwd, name), contents);
	}
	let settled = false;
	let resolveDone: () => void = () => {};
	const done = new Promise<void>((resolve) => {
		resolveDone = () => {
			if (settled) return;
			settled = true;
			resolve();
		};
	});

	const client = new CodexRpcClient({
		clientVersion: "0.0.1",
		createTransport: (handlers) =>
			spawnCodexTransport(
				{ command, cwd, env: { ...process.env, CODEX_HOME: codexHome } },
				handlers,
			),
		onFrame: (direction, frame) => frames.push({ direction, frame }),
		onStderr: (chunk) => process.stderr.write(`[${scenario.name}] ${chunk}`),
		onExit: () => resolveDone(),
		onNotification: (notification) => {
			if (notification.method === "turn/completed") resolveDone();
		},
		onServerRequest: (request) => {
			if (APPROVAL_METHODS.has(request.method)) {
				client.respond(request.id, {
					decision: scenario.approvalDecision ?? "decline",
				});
				return;
			}
			client.respondWithError(request.id, `unsupported: ${request.method}`);
		},
	});

	const initialize = await client.initialize();
	process.stdout.write(
		`[${scenario.name}] userAgent=${initialize.userAgent}\n`,
	);

	const threadResponse = (await client.request("thread/start", {
		cwd,
		sandbox: scenario.sandbox,
		approvalPolicy: scenario.approvalPolicy,
	})) as { thread: { id: string } };
	const threadId = threadResponse.thread.id;

	const turnResponse = (await client.request("turn/start", {
		threadId,
		input: [{ type: "text", text: scenario.prompt, text_elements: [] }],
	})) as { turn?: { id: string } };

	if (scenario.interruptAfterMs !== undefined) {
		const turnId = turnResponse.turn?.id;
		void sleep(scenario.interruptAfterMs).then(async () => {
			if (settled || !turnId) return;
			await client
				.request("turn/interrupt", { threadId, turnId })
				.catch((error: Error) =>
					process.stderr.write(
						`[${scenario.name}] interrupt: ${error.message}\n`,
					),
				);
		});
	}

	await Promise.race([done, sleep(scenario.timeoutMs)]);
	await sleep(500);
	await client.close();

	const path = join(outputDir, `${scenario.name}.jsonl`);
	writeFileSync(path, `${frames.map(redact).join("\n")}\n`);
	process.stdout.write(
		`[${scenario.name}] ${frames.length} frames → ${path}\n`,
	);
}

async function main(): Promise<void> {
	const outputDir = join(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		"src",
		"harness",
		"codex",
		"fixtures",
	);
	mkdirSync(outputDir, { recursive: true });
	const command = process.env.CODEX_BIN ?? "codex";
	const codexHome = isolatedCodexHome();
	const only = process.argv.slice(2);
	for (const scenario of SCENARIOS) {
		if (only.length > 0 && !only.includes(scenario.name)) continue;
		await record(scenario, outputDir, command, codexHome);
	}
}

if (import.meta.main) {
	await main();
}
