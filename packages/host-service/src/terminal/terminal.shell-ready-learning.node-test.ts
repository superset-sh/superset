// End-to-end tests for shell-ready evidence learning (SUPER-1103): a user
// profile can keep the OSC 133;A marker from ever reaching the PTY stream
// (exec-ing another shell or tmux from .zshrc, cleared precmd hooks). Before
// learning, every marker-gated launch on such a machine rode the full 15s
// fallback — clicking an agent preset stalled exactly 15s, every time. The
// host now records what the scanner actually observed: the first timed-out
// launch brands the shell `missing`, later launches use a short grace, and an
// observed marker flips the brand back to `delivered`.
//
// Same harness as terminal.initial-command.node-test.ts (real pty-daemon
// Server, real SQLite host DB) but with real /bin/zsh plus the desktop's zsh
// wrapper files, so shellLaunchExpectsReadyMarker() returns true and the
// shell-ready gate is exercised for real.
//
//   node --experimental-strip-types --test <file>
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Server } from "@superset/pty-daemon";
import { createDb, type HostDb } from "../db/index.ts";
import { projects, workspaces } from "../db/schema.ts";
import { disposeDaemonClient } from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import { shellLaunchExpectsReadyMarker } from "./shell-launch.ts";
import { __resetShellReadyEvidenceForTesting } from "./shell-ready-evidence.ts";
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSessionAndWait,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-shellready-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-shellready-${process.pid}.sock`);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");

// Isolated fake user home so the test never sources the real user's rc files.
const FAKE_USER_HOME = path.join(TEST_HOME, "user-home");

function findOnPath(name: string): string | null {
	for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
		if (!dir) continue;
		const candidate = path.join(dir, name);
		try {
			fs.accessSync(candidate, fs.constants.X_OK);
			return candidate;
		} catch {
			// keep looking
		}
	}
	return null;
}

const ZSH = findOnPath("zsh");

// The harness overwrites process-wide env; restore whatever was there so this
// suite composes with others in the same node --test invocation.
const OVERRIDDEN_ENV_KEYS = [
	"SUPERSET_PTY_DAEMON_SOCKET",
	"SUPERSET_HOME_DIR",
	"HOST_SERVICE_VERSION",
	"NODE_ENV",
] as const;
const savedEnv = new Map<string, string | undefined>();

let server: Server;
let db: HostDb;
let workspaceId: string;

/**
 * Faithful copy of the zsh wrapper chain that
 * packages/agent-setup/src/shell-wrappers.ts writes (minus the
 * PATH-prepend helpers, which don't affect readiness): ZDOTDIR redirection
 * through .zshenv/.zprofile/.zshrc, marker hook registered last in .zlogin.
 */
function writeZshWrappers(zshDir: string): void {
	const SAVE = `_superset_saved_env="$(export -p 2>/dev/null | grep ' SUPERSET_')"`;
	const RESTORE = `eval "$_superset_saved_env" 2>/dev/null || true`;
	const quoted = `'${zshDir}'`;
	fs.mkdirSync(zshDir, { recursive: true });
	const sourceUser = (file: string, guard?: string) =>
		[
			SAVE,
			`_superset_home="\${SUPERSET_ORIG_ZDOTDIR:-$HOME}"`,
			`export ZDOTDIR="$_superset_home"`,
			guard
				? `if [[ -o interactive ]]; then\n  [[ -f "$_superset_home/${file}" ]] && source "$_superset_home/${file}"\nfi`
				: `[[ -f "$_superset_home/${file}" ]] && source "$_superset_home/${file}"`,
			RESTORE,
		].join("\n");
	fs.writeFileSync(
		path.join(zshDir, ".zshenv"),
		`${sourceUser(".zshenv")}\nexport ZDOTDIR=${quoted}\n`,
	);
	fs.writeFileSync(
		path.join(zshDir, ".zprofile"),
		`${sourceUser(".zprofile")}\nexport ZDOTDIR=${quoted}\n`,
	);
	fs.writeFileSync(
		path.join(zshDir, ".zshrc"),
		`${sourceUser(".zshrc")}\nexport ZDOTDIR=${quoted}\n`,
	);
	fs.writeFileSync(
		path.join(zshDir, ".zlogin"),
		`${sourceUser(".zlogin", "interactive")}
__superset_prompt_mark() {
  printf "\\033]777;superset-shell-ready\\007\\033]133;A\\007"
}
precmd_functions=(\${precmd_functions[@]} __superset_prompt_mark)
export ZDOTDIR="$_superset_home"
`,
	);
}

async function launchAndMeasure(
	command: string,
): Promise<{ elapsed: number; body: string }> {
	const terminalId = `e2e-ready-${randomUUID().slice(0, 8)}`;
	const outFile = path.join(TEST_HOME, `out-${terminalId}`);
	const start = Date.now();
	const session = await createTerminalSessionInternal({
		terminalId,
		workspaceId,
		db,
		listed: true,
		initialCommand: `${command} > "${outFile}"`,
	});
	assert.ok(!("error" in session), "error" in session ? session.error : "");
	try {
		await waitFor(() => fs.existsSync(outFile), 25_000);
		const elapsed = Date.now() - start;
		// Small settle so the redirect finishes writing before we read it back.
		await new Promise((r) => setTimeout(r, 150));
		return { elapsed, body: fs.readFileSync(outFile, "utf8").trim() };
	} finally {
		await disposeSessionAndWait(terminalId, db);
	}
}

function readEvidenceFile(): Record<string, string> {
	try {
		return JSON.parse(
			fs.readFileSync(
				path.join(TEST_HOME, "shell-ready-evidence.json"),
				"utf8",
			),
		);
	} catch {
		return {};
	}
}

before(async () => {
	if (!ZSH) return;
	fs.mkdirSync(TEST_HOME, { recursive: true });
	fs.mkdirSync(FAKE_USER_HOME, { recursive: true });
	const worktreePath = path.join(TEST_HOME, "worktree");
	fs.mkdirSync(worktreePath, { recursive: true });
	writeZshWrappers(path.join(TEST_HOME, "zsh"));

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-shellready-e2e",
	});
	await server.listen();

	for (const key of OVERRIDDEN_ENV_KEYS) savedEnv.set(key, process.env[key]);
	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-shellready-e2e";
	process.env.NODE_ENV = "development";

	__resetShellReadyEvidenceForTesting();
	__setAccountShellForTesting(ZSH);
	initTerminalBaseEnv({
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		HOME: FAKE_USER_HOME,
		SHELL: ZSH,
	});

	db = createDb(path.join(TEST_HOME, "host.db"), MIGRATIONS);

	const projectId = randomUUID();
	workspaceId = randomUUID();
	db.insert(projects).values({ id: projectId, repoPath: worktreePath }).run();
	db.insert(workspaces)
		.values({
			id: workspaceId,
			projectId,
			worktreePath,
			branch: "main",
		})
		.run();
});

after(async () => {
	if (!ZSH) return;
	__resetSessionsForTesting();
	__setAccountShellForTesting(undefined);
	__resetShellReadyEvidenceForTesting();
	await disposeDaemonClient();
	await server.close();
	for (const [key, value] of savedEnv) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		fs.rmSync(TEST_HOME, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

describe("shell-ready evidence learning", () => {
	test(
		"marker-delivering profile: prompt launch, evidence records delivered",
		{ skip: !ZSH },
		async () => {
			assert.ok(ZSH);
			assert.equal(
				shellLaunchExpectsReadyMarker({
					shell: ZSH,
					supersetHomeDir: TEST_HOME,
				}),
				true,
				"wrapper files should make the launch marker-backed",
			);

			const { elapsed } = await launchAndMeasure("date +%s");
			assert.ok(
				elapsed < 10_000,
				`healthy profile took ${elapsed}ms — gate fell back to the timeout`,
			);
			await waitFor(() => readEvidenceFile().zsh === "delivered", 5_000);
		},
	);

	test(
		"marker-diverting profile: one full timeout, then launches use the short grace",
		{ skip: !ZSH, timeout: 60_000 },
		async () => {
			// A .zshrc that execs another shell keeps the wrapper .zlogin (and
			// so the marker) from ever running — the class behind SUPER-1103.
			fs.writeFileSync(
				path.join(FAKE_USER_HOME, ".zshrc"),
				"exec /bin/zsh -f\n",
			);

			const first = await launchAndMeasure("date +%s");
			assert.ok(
				first.elapsed >= 15_000,
				`first marker-less launch took ${first.elapsed}ms — expected the full 15s fallback`,
			);
			await waitFor(() => readEvidenceFile().zsh === "missing", 5_000);

			const second = await launchAndMeasure("date +%s");
			assert.ok(
				second.elapsed < 10_000,
				`branded-missing launch took ${second.elapsed}ms — evidence should shrink the wait`,
			);
			assert.ok(
				second.elapsed >= 2_000,
				`branded-missing launch took ${second.elapsed}ms — grace period should still apply`,
			);
		},
	);

	test(
		"recovered profile: an observed marker flips evidence back to delivered",
		{ skip: !ZSH },
		async () => {
			// Profile fixed: markers flow again and arrive within the grace window,
			// so the very next launch re-learns `delivered`.
			fs.rmSync(path.join(FAKE_USER_HOME, ".zshrc"), { force: true });

			const { elapsed } = await launchAndMeasure("date +%s");
			assert.ok(
				elapsed < 10_000,
				`recovered profile took ${elapsed}ms — expected a prompt launch`,
			);
			await waitFor(() => readEvidenceFile().zsh === "delivered", 5_000);
		},
	);

	test(
		"stdin-eating marker-less profile: grace launch survives a startup `read`",
		{ skip: !ZSH, timeout: 60_000 },
		async () => {
			// Adversarial combo (the omz-updater class of #3941, on a machine
			// whose marker also never arrives): a startup `read` is consuming the
			// TTY when the learned grace window fires, so a blindly typed command
			// loses its first byte(s) — `date …` runs as `ate …`, performing the
			// redirect (empty out file) and then failing. The grace path must
			// verify the command echoed back intact and retype it if not.
			fs.writeFileSync(
				path.join(FAKE_USER_HOME, ".zshrc"),
				"read -t 3 -k 1 _j || true\nexec /bin/zsh -f\n",
			);

			// Previous test re-learned `delivered`, so this first launch rides
			// the full fallback (typing at 15s, long after the eater is gone)
			// and re-brands the shell `missing`.
			const first = await launchAndMeasure("date +%s");
			assert.ok(
				first.elapsed >= 15_000,
				`first eater launch took ${first.elapsed}ms — expected the full 15s fallback`,
			);
			assert.match(
				first.body,
				/^\d{10}$/,
				`first eater launch produced ${JSON.stringify(first.body)} — command mangled`,
			);
			await waitFor(() => readEvidenceFile().zsh === "missing", 5_000);

			// Grace-window launch fires while `read -t 3` is still eating stdin.
			const second = await launchAndMeasure("date +%s");
			assert.match(
				second.body,
				/^\d{10}$/,
				`grace launch produced ${JSON.stringify(second.body)} — the startup read ate the command`,
			);
			assert.ok(
				second.elapsed < 10_000,
				`grace launch took ${second.elapsed}ms — echo verification gave back the latency win`,
			);

			fs.rmSync(path.join(FAKE_USER_HOME, ".zshrc"), { force: true });
		},
	);

	test(
		"late marker after the grace window flips evidence back to delivered",
		{ skip: !ZSH, timeout: 60_000 },
		async () => {
			// A slow-init profile delivers the marker AFTER the 2s grace fires
			// (typed on learned `missing` evidence). The late marker is still
			// proof this profile delivers — evidence must self-heal instead of
			// `missing` being a one-way brand.
			assert.equal(
				readEvidenceFile().zsh,
				"missing",
				"precondition: previous test left zsh branded missing",
			);
			fs.writeFileSync(path.join(FAKE_USER_HOME, ".zshrc"), "sleep 4\n");
			try {
				const { body } = await launchAndMeasure("date +%s");
				assert.match(
					body,
					/^\d{10}$/,
					`late-marker launch produced ${JSON.stringify(body)}`,
				);
				await waitFor(() => readEvidenceFile().zsh === "delivered", 10_000);
			} finally {
				fs.rmSync(path.join(FAKE_USER_HOME, ".zshrc"), { force: true });
			}
		},
	);
});

async function waitFor(predicate: () => boolean, ms: number): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > ms) throw new Error("waitFor timed out");
		await new Promise((r) => setTimeout(r, 25));
	}
}
