// End-to-end tests for ungated initialCommand protection: launches whose
// shell configuration never installs the OSC 133;A marker (unwrapped bash
// falling back to `-l`, sh/ksh, nushell) used to type the command the instant
// the PTY opened. Two startup classes ate it: a profile `read` steals the
// leading byte(s) so `date` runs as `ate` (#3941/#5712 for bash users), and
// reedline-style editors flush ALL pending typeahead when they enable raw
// mode after init, so the command vanishes behind an intact-looking kernel
// echo (#6024). reedline also blocks on a DSR cursor query (`ESC[6n`) that
// nothing answers when no renderer is attached.
//
// Same harness as terminal.initial-command.node-test.ts (real pty-daemon
// Server, real SQLite host DB) with real /bin/bash and NO wrapper rcfile, so
// shellLaunchExpectsReadyMarker() returns false and the ungated path is
// exercised for real.
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
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSessionAndWait,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-ungated-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-ungated-${process.pid}.sock`);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");
const FAKE_USER_HOME = path.join(TEST_HOME, "user-home");

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

async function launchAndMeasure(
	command: string,
): Promise<{ elapsed: number; body: string }> {
	const terminalId = `e2e-ungated-${randomUUID().slice(0, 8)}`;
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

before(async () => {
	fs.mkdirSync(TEST_HOME, { recursive: true });
	fs.mkdirSync(FAKE_USER_HOME, { recursive: true });
	const worktreePath = path.join(TEST_HOME, "worktree");
	fs.mkdirSync(worktreePath, { recursive: true });

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-ungated-e2e",
	});
	await server.listen();

	for (const key of OVERRIDDEN_ENV_KEYS) savedEnv.set(key, process.env[key]);
	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-ungated-e2e";
	process.env.NODE_ENV = "development";

	__setAccountShellForTesting("/bin/bash");
	initTerminalBaseEnv({
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		HOME: FAKE_USER_HOME,
		SHELL: "/bin/bash",
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
	__resetSessionsForTesting();
	__setAccountShellForTesting(undefined);
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

describe("ungated launch protection", () => {
	test(
		"startup stdin eater: the command survives via echo-verified retype",
		{ timeout: 60_000 },
		async () => {
			// No wrapper rcfile on disk — the launch falls back to `bash -l` and
			// no marker will ever arrive.
			assert.equal(
				shellLaunchExpectsReadyMarker({
					shell: "/bin/bash",
					supersetHomeDir: TEST_HOME,
				}),
				false,
				"bash without a wrapper rcfile must be ungated",
			);

			// The #3941/#5712 class: a login-profile `read` is consuming the TTY
			// during startup. Typed-blind launches lose their first byte to it.
			fs.writeFileSync(
				path.join(FAKE_USER_HOME, ".bash_profile"),
				"read -t 2 -n 1 _j || true\n",
			);
			try {
				for (let i = 1; i <= 2; i++) {
					const { elapsed, body } = await launchAndMeasure("date +%s");
					assert.match(
						body,
						/^\d{10}$/,
						`launch ${i} produced ${JSON.stringify(body)} — the startup read ate the command`,
					);
					assert.ok(
						elapsed < 10_000,
						`launch ${i} took ${elapsed}ms — expected well under 10s`,
					);
				}
			} finally {
				fs.rmSync(path.join(FAKE_USER_HOME, ".bash_profile"), {
					force: true,
				});
			}
		},
	);

	test(
		"clean ungated launch waits for quiescence and lands intact",
		{ timeout: 30_000 },
		async () => {
			const { elapsed, body } = await launchAndMeasure("date +%s");
			assert.match(body, /^\d{10}$/);
			assert.ok(elapsed < 10_000, `clean launch took ${elapsed}ms`);
		},
	);

	test(
		"unattached session answers a DSR cursor query (reedline init gate)",
		{ timeout: 30_000 },
		async () => {
			// Stand-in for nushell's reedline: emit ESC[6n and refuse to start
			// the line editor until the terminal answers. With no renderer
			// attached, only the host can answer — without that, this shell
			// never reaches a prompt and the launch is lost.
			const replyFile = path.join(TEST_HOME, `dsr-reply-${process.pid}`);
			const fakeShell = path.join(TEST_HOME, "reedline-like");
			fs.writeFileSync(
				fakeShell,
				[
					"#!/bin/bash",
					"printf 'starting up\\n'",
					"printf '\\033[6n'",
					"IFS='' read -r -d 'R' -t 5 _reply || true",
					`printf '%s' "$_reply" > "${replyFile}"`,
					"exec /bin/bash --noprofile --norc -i",
					"",
				].join("\n"),
				{ mode: 0o755 },
			);
			__setAccountShellForTesting(fakeShell);
			try {
				const { body } = await launchAndMeasure("date +%s");
				assert.match(body, /^\d{10}$/);
				const reply = fs.readFileSync(replyFile, "utf8");
				assert.match(
					reply,
					// biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the raw DSR reply bytes
					/^\x1b\[\d+;\d+$/,
					`expected a cursor position report, got ${JSON.stringify(reply)}`,
				);
			} finally {
				__setAccountShellForTesting("/bin/bash");
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
