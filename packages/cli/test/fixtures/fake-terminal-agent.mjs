import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";

const START_PASTE = "\u001b[200~";
const END_PASTE = "\u001b[201~";
const capturePath = process.env.SUPERSET_E2E_CAPTURE_PATH;
const initialPrompt = process.argv.at(-1) ?? "";

function capture(kind, prompt) {
	if (!capturePath) return;
	appendFileSync(
		capturePath,
		`${JSON.stringify({ kind, prompt: Buffer.from(prompt).toString("base64") })}\n`,
	);
}

async function postHook(eventType) {
	const url = process.env.SUPERSET_HOST_AGENT_HOOK_URL;
	const terminalId = process.env.SUPERSET_TERMINAL_ID;
	if (!url || !terminalId) return;
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			json: {
				terminalId,
				eventType,
				agent: {
					agentId: "codex",
					sessionId: `fake-${terminalId}`,
					definitionId: "custom:e2e",
				},
			},
		}),
	});
	if (!response.ok) {
		throw new Error(`hook ${eventType} failed with HTTP ${response.status}`);
	}
}

async function handlePrompt(prompt) {
	capture("follow-up", prompt);
	await postHook("UserPromptSubmit");
	process.stdout.write(
		`FOLLOWUP bytes=${Buffer.byteLength(prompt)} base64=${Buffer.from(prompt).toString("base64")}\r\n`,
	);

	if (prompt === "PERMISSION") {
		await postHook("PermissionRequest");
		return;
	}
	if (prompt === "WORKING") return;
	if (prompt === "FAIL") {
		await postHook("StopFailure");
		return;
	}
	if (prompt === "EXIT") {
		process.stdout.write("EXITING\r\n");
		await postHook("SessionEnd");
		process.exit(0);
	}

	await new Promise((resolve) => setTimeout(resolve, 30));
	await postHook("Stop");
}

capture("initial", initialPrompt);
process.stdout.write(
	`READY bytes=${Buffer.byteLength(initialPrompt)} sha256=${createHash("sha256").update(initialPrompt).digest("hex")}\r\n`,
);
await postHook("Stop");

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

let pending = "";
let handling = Promise.resolve();
process.stdin.on("data", (chunk) => {
	pending += chunk;
	for (;;) {
		const start = pending.indexOf(START_PASTE);
		if (start < 0) {
			pending = pending.slice(-START_PASTE.length);
			return;
		}
		const end = pending.indexOf(END_PASTE, start + START_PASTE.length);
		if (end < 0) {
			pending = pending.slice(start);
			return;
		}
		const prompt = pending.slice(start + START_PASTE.length, end);
		pending = pending.slice(end + END_PASTE.length);
		if (pending.startsWith("\r")) pending = pending.slice(1);
		handling = handling
			.then(() => handlePrompt(prompt))
			.catch((error) => {
				console.error(error);
				process.exitCode = 1;
			});
	}
});
