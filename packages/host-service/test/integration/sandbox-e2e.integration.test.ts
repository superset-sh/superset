/**
 * End-to-end test for Docker-sandboxed workspaces against the REAL
 * host-service app served on a real port (so the container reaches it via
 * host.docker.internal), with the REAL PskHostAuthProvider and the REAL
 * desktop notify-hook script running inside the container.
 *
 * Covers, in order: sticky sandbox resolution at workspace create →
 * container ensure → PTY launch spec runs in-container with the injected
 * SUPERSET_* env → agent hook round-trip (accept + spoof rejection) →
 * CLI-token auth against a protected procedure → in-container commit →
 * workspaces.syncSandbox fast-forward → export-on-destroy via
 * workspace.delete. Gated on SUPERSET_DOCKER_TESTS=1.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { terminalAgentBindings, workspaces } from "../../src/db/schema";
import { PskHostAuthProvider } from "../../src/providers/host-auth";
import { destroyWorkspaceSandbox } from "../../src/runtime/sandbox/container-manager";
import { inspectContainer } from "../../src/runtime/sandbox/docker-cli";
import { getSandboxContainerName } from "../../src/runtime/sandbox/paths";
import {
	computeWorkspaceNameSlug,
	getWorkspaceRuntime,
} from "../../src/runtime/sandbox/registry";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";
import { seedTerminalSession } from "../helpers/seed";

const execFileAsync = promisify(execFile);
const DOCKER_TESTS = process.env.SUPERSET_DOCKER_TESTS === "1";

const TEST_IMAGE = "superset-sandbox-e2e:local";
const PSK = "e2e-psk-secret";
const NOTIFY_TEMPLATE = resolve(
	import.meta.dir,
	"../../../agent-setup/templates/notify-hook.template.sh",
);

async function run(command: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync(command, args, {
		timeout: 5 * 60_000,
		maxBuffer: 16 * 1024 * 1024,
	});
	return stdout;
}

describe.skipIf(!DOCKER_TESTS)("sandbox end-to-end", () => {
	let fixtureRoot: string;
	let savedHomeDir: string | undefined;
	let savedHostPort: string | undefined;
	let scenario: Awaited<ReturnType<typeof createProjectScenario>>;
	let server: ReturnType<typeof Bun.serve>;
	// Hoisted so afterAll can tear the container down even if an assertion
	// between provision and the in-test workspace.delete throws.
	let createdWorkspaceId: string | undefined;

	beforeAll(async () => {
		fixtureRoot = mkdtempSync(join(tmpdir(), "superset-sandbox-e2e-"));
		savedHomeDir = process.env.SUPERSET_HOME_DIR;
		savedHostPort = process.env.HOST_SERVICE_PORT;
		process.env.SUPERSET_HOME_DIR = join(fixtureRoot, "superset-home");

		// The REAL desktop notify hook, rendered like agent-setup does.
		mkdirSync(join(process.env.SUPERSET_HOME_DIR, "hooks"), {
			recursive: true,
		});
		const notifyScript = readFileSync(NOTIFY_TEMPLATE, "utf-8")
			.replaceAll("{{MARKER}}", "# Superset agent notification hook (e2e)")
			.replaceAll("{{DEFAULT_PORT}}", "51741");
		const notifyPath = join(
			process.env.SUPERSET_HOME_DIR,
			"hooks",
			"notify.sh",
		);
		writeFileSync(notifyPath, notifyScript);
		chmodSync(notifyPath, 0o755);

		// Minimal image satisfying the contract + curl for the hook script.
		const dockerfilePath = join(fixtureRoot, "Dockerfile.e2e");
		writeFileSync(
			dockerfilePath,
			"FROM debian:bookworm-slim\nRUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates && rm -rf /var/lib/apt/lists/*\n",
		);
		await run("docker", [
			"build",
			"-t",
			TEST_IMAGE,
			"-f",
			dockerfilePath,
			fixtureRoot,
		]);

		scenario = await createProjectScenario({
			hostOptions: {
				psk: PSK,
				hostAuth: new PskHostAuthProvider(PSK),
				apiOverrides: cloudFlows.workspaceCreateOk(),
			},
		});

		// Repo-shipped sandbox config: enabled + image are honored from the
		// repo source (mounts/env would not be).
		mkdirSync(join(scenario.repo.repoPath, ".superset"), { recursive: true });
		writeFileSync(
			join(scenario.repo.repoPath, ".superset", "config.json"),
			JSON.stringify({
				sandbox: { enabled: true, image: TEST_IMAGE, agentConfig: false },
			}),
		);

		// Real port so the container can reach the app via host.docker.internal.
		server = Bun.serve({
			port: 0,
			fetch: (request) => scenario.host.app.fetch(request),
		});
		process.env.HOST_SERVICE_PORT = String(server.port);
	}, 10 * 60_000);

	afterAll(async () => {
		// Best-effort: the happy path already deleted the workspace; this only
		// fires when an assertion aborted the test mid-run and left a container.
		if (createdWorkspaceId) {
			await destroyWorkspaceSandbox(createdWorkspaceId).catch(() => {});
		}
		server?.stop(true);
		if (savedHomeDir === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = savedHomeDir;
		if (savedHostPort === undefined) delete process.env.HOST_SERVICE_PORT;
		else process.env.HOST_SERVICE_PORT = savedHostPort;
		await scenario?.dispose();
		rmSync(fixtureRoot, { recursive: true, force: true });
	});

	test(
		"create → container → hooks → CLI auth → commit sync → delete export",
		async () => {
			// ── Workspace create resolves the sticky sandbox flag ─────────
			const created = await scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "sandboxed",
				branch: "feat/sbx",
			});
			const workspaceId = created?.workspace?.id;
			if (!workspaceId) throw new Error("workspace create failed");
			createdWorkspaceId = workspaceId;
			const row = scenario.host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, workspaceId))
				.get();
			if (!row) throw new Error("workspace row missing");
			expect(row.sandboxEnabled).toBe(true);
			const containerName = getSandboxContainerName(
				workspaceId,
				computeWorkspaceNameSlug(row),
			);

			// ── Runtime resolution + container ensure ─────────────────────
			const runtime = getWorkspaceRuntime(scenario.host.db, workspaceId);
			expect(runtime.kind).toBe("docker");
			await runtime.prepare();
			expect((await inspectContainer(containerName)).running).toBe(true);

			// ── PTY launch spec, exercised in-container ───────────────────
			const goodTerminal = seedTerminalSession(scenario.host, {
				originWorkspaceId: workspaceId,
			});
			const spoofTerminal = seedTerminalSession(scenario.host, {
				originWorkspaceId: workspaceId,
			});
			const spec = await runtime.buildPtyLaunch({
				terminalId: goodTerminal.id,
				workspaceId,
				workspacePath: row.worktreePath,
				rootPath: scenario.repo.repoPath,
				cwd: row.worktreePath,
				db: scenario.host.db,
			});
			expect(spec.shell).toBe("docker");
			expect(spec.expectsReadyMarker).toBe(true);

			// Same exec argv, non-interactive: -it → -i, inner bash -c script.
			const argvBase = spec.argv
				.map((arg) => (arg === "-it" ? "-i" : arg))
				.slice(0, -3);
			const script = `
set -u
echo "WSID=$SUPERSET_WORKSPACE_ID"
echo "MARKER_LINES=$(grep -c '133;A' /opt/superset/bash/rcfile)"
echo '{"hook_event_name":"SessionStart","session_id":"e2e-session"}' \
  | SUPERSET_AGENT_ID=claude bash "$SUPERSET_HOME_DIR/hooks/notify.sh" || true
echo '{"hook_event_name":"SessionStart","session_id":"spoof"}' \
  | SUPERSET_AGENT_ID=claude SUPERSET_TERMINAL_ID=${spoofTerminal.id} SUPERSET_AGENT_HOOK_TOKEN=wrong-token \
    bash "$SUPERSET_HOME_DIR/hooks/notify.sh" || true
TOKEN=$(cat /sandbox/host/token)
SYNC_URL="$SUPERSET_HOST_ENDPOINT/trpc/workspaces.syncSandbox"
BODY='{"json":{"workspaceId":"${workspaceId}"}}'
echo "AUTH_OK=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$BODY" "$SYNC_URL")"
echo "AUTH_ANON=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "$BODY" "$SYNC_URL")"
`;
			const output = await run("docker", [
				...argvBase,
				"/bin/bash",
				"-c",
				script,
			]);

			expect(output).toContain(`WSID=${workspaceId}`);
			expect(output).not.toContain("MARKER_LINES=0");
			// The bundled-CLI auth path: sandbox token accepted, anonymous not.
			expect(output).toContain("AUTH_OK=200");
			expect(output).toContain("AUTH_ANON=401");

			// Hook round-trip: correct token recorded an agent binding …
			const goodBinding = scenario.host.db
				.select()
				.from(terminalAgentBindings)
				.where(eq(terminalAgentBindings.terminalId, goodTerminal.id))
				.get();
			expect(goodBinding?.agentId).toBe("claude");
			// … the spoofed token did not.
			const spoofBinding = scenario.host.db
				.select()
				.from(terminalAgentBindings)
				.where(eq(terminalAgentBindings.terminalId, spoofTerminal.id))
				.get();
			expect(spoofBinding).toBeFalsy();

			// ── In-container commit → syncSandbox fast-forward ────────────
			await run("docker", [
				"exec",
				"-w",
				row.worktreePath,
				containerName,
				"bash",
				"-c",
				`echo change >> e2e.txt && git add e2e.txt && git -c user.email=a@a -c user.name=agent commit -q -m "agent commit"`,
			]);
			const sync = await scenario.host.trpc.workspaces.syncSandbox.mutate({
				workspaceId,
			});
			expect(sync.status).toBe("fast-forwarded");
			const hostLog = await run("git", [
				"-C",
				row.worktreePath,
				"log",
				"--oneline",
			]);
			expect(hostLog).toContain("agent commit");

			// ── Unsynced commit survives delete as refs/sandbox/<id>/* ────
			await run("docker", [
				"exec",
				"-w",
				row.worktreePath,
				containerName,
				"bash",
				"-c",
				`echo more >> e2e.txt && git add e2e.txt && git -c user.email=a@a -c user.name=agent commit -q -m "unsynced commit"`,
			]);
			await scenario.host.trpc.workspace.delete.mutate({ id: workspaceId });

			expect((await inspectContainer(containerName)).exists).toBe(false);
			expect(existsSync(row.worktreePath)).toBe(false);
			const exportedLog = await run("git", [
				"-C",
				scenario.repo.repoPath,
				"log",
				"--oneline",
				`refs/sandbox/${workspaceId}/feat/sbx`,
			]);
			expect(exportedLog).toContain("unsynced commit");
		},
		10 * 60_000,
	);
});
