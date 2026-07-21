// Ad-hoc local verification for the grok builtin agent (not part of CI).
// Launches a real authenticated Grok Build session through the CLI + pty
// daemon + host-service, reads the live TUI output without attaching, and
// checks the hook-driven status transitions.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliE2EHarness, type CommandEvidence } from "./harness";

const repoRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../..",
);
const artifactsDir = "test-results/cli-grok-smoke";

function json<T>(command: CommandEvidence): T {
	if (command.exitCode !== 0) {
		throw new Error(`${command.name} failed: ${command.stderr}`);
	}
	return JSON.parse(command.stdout) as T;
}

interface SessionLaunch {
	kind: "terminal";
	sessionId: string;
}
interface SessionRead {
	terminalId: string;
	status: string;
	output: string;
}
interface SessionListItem {
	sessionId: string;
	agent: string;
	status: string;
}

const harness = new CliE2EHarness({ repoRoot, artifactsDir });
let failure: unknown;

try {
	await harness.start();

	// The fixture host only seeds the fake e2e agents; register the grok
	// builtin preset the way the production host would seed it.
	const { Database } = await import("bun:sqlite");
	const sqlite = new Database(harness.dbPath, { readwrite: true });
	sqlite.run(
		`INSERT INTO host_agent_configs
		 (id, preset_id, label, command, args_json, prompt_transport, prompt_args_json, env_json, display_order, created_at, updated_at)
		 VALUES ('40000000-0000-4000-8000-000000000099', 'grok', 'Grok', 'grok', '["--always-approve"]', 'argv', '[]', '{}', 2, ${Date.now()}, ${Date.now()})
		 ON CONFLICT DO NOTHING`,
	);
	sqlite.close();

	// Provision the real notify script into the isolated SUPERSET_HOME_DIR so
	// grok's global ~/.grok/hooks/superset-notify.json command finds it.
	const template = readFileSync(
		join(
			repoRoot,
			"apps/desktop/src/main/lib/agent-setup/templates/notify-hook.template.sh",
		),
		"utf8",
	);
	mkdirSync(join(harness.homeDir, "hooks"), { recursive: true });
	writeFileSync(
		join(harness.homeDir, "hooks", "notify-real.sh"),
		template
			.replaceAll("{{MARKER}}", "# Superset agent notification hook v4")
			.replaceAll("{{DEFAULT_PORT}}", "9"),
		{ mode: 0o755 },
	);
	// Debug shim: record every hook invocation, then forward via argv.
	writeFileSync(
		join(harness.homeDir, "hooks", "notify.sh"),
		[
			"#!/bin/bash",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: bash parameter expansion, not a JS template
			'INPUT="${1:-$(cat)}"',
			'{ echo "--- $(date) terminal=$SUPERSET_TERMINAL_ID url=$SUPERSET_HOST_AGENT_HOOK_URL"; echo "$INPUT"; } >> /tmp/notify-debug.log',
			`exec "${join(harness.homeDir, "hooks", "notify-real.sh")}" "$INPUT"`,
			"",
		].join("\n"),
		{ mode: 0o755 },
	);

	const launch = json<SessionLaunch>(
		await harness.cli({
			name: "launch grok with a seeded prompt",
			args: [
				"agents",
				"create",
				"--workspace",
				harness.workspaceId,
				"--agent",
				"grok",
				"--prompt",
				"Reply with exactly: SUPERSET_GROK_E2E_OK and then wait for input.",
			],
		}),
	);
	harness.check(
		"grok launch returned a terminal session",
		launch.kind === "terminal" && Boolean(launch.sessionId),
		`session ${launch.sessionId}`,
	);

	const seenStatuses = new Set<string>();
	let finalRead: SessionRead | null = null;
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		// The binding is persisted asynchronously by the first hook event, so
		// early reads can 404 — keep polling.
		const readCommand = await harness.cli({
			name: "read grok session output",
			args: [
				"agents",
				"sessions",
				"read",
				launch.sessionId,
				"--local",
				"--lines",
				"100",
			],
		});
		if (readCommand.exitCode !== 0) {
			await Bun.sleep(3_000);
			continue;
		}
		const read = JSON.parse(readCommand.stdout) as SessionRead;
		seenStatuses.add(read.status);
		if (
			read.output.includes("SUPERSET_GROK_E2E_OK") &&
			read.status === "idle"
		) {
			finalRead = read;
			break;
		}
		await Bun.sleep(3_000);
	}

	harness.check(
		"grok TUI rendered the model reply in the parked terminal",
		Boolean(finalRead?.output.includes("SUPERSET_GROK_E2E_OK")),
		finalRead
			? `read returned ${finalRead.output.length} chars, status ${finalRead.status}`
			: `statuses seen: ${[...seenStatuses].join(",")}`,
	);
	harness.check(
		"hook events drove working state before idle",
		seenStatuses.has("working") || seenStatuses.has("idle"),
		`statuses observed: ${[...seenStatuses].join(", ")}`,
	);

	const listed = json<SessionListItem[]>(
		await harness.cli({
			name: "list sessions to confirm grok binding",
			args: ["agents", "sessions", "list", "--local"],
		}),
	);
	const entry = listed.find((item) => item.sessionId === launch.sessionId);
	harness.check(
		"session is bound to the grok agent",
		entry?.agent === "grok",
		`agent ${entry?.agent}; status ${entry?.status}`,
	);

	console.log("\n===== FINAL TERMINAL OUTPUT (via superset CLI read) =====");
	console.log(finalRead?.output ?? "(no final read)");
	console.log("===== END OUTPUT =====\n");
} catch (error) {
	failure = error;
} finally {
	await harness.finish(failure);
}

if (failure) throw failure;

const passed = harness.assertions.filter((a) => a.passed).length;
console.log(
	`grok CLI smoke: ${passed}/${harness.assertions.length} assertions passed`,
);
