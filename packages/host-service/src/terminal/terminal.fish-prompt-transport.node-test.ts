// End-to-end tests for the fish prompt-transport rewrite (#4705): the shared
// agent prompt transport is a bash-only command-substitution heredoc
// ("$(cat <<'SUPERSET_PROMPT_…')"), which fish cannot parse — the launch died
// with "Expected a string, but found a redirection" and the agent never
// started. The host now rewrites the heredoc for fish launch shells into a
// staged prompt file consumed with fish-native syntax, preserving the prompt
// byte-for-byte and deleting the file as soon as it's consumed.
//
// Same harness as terminal.initial-command.node-test.ts (real pty-daemon
// Server, real SQLite host DB) with a real fish. Skipped when fish isn't
// installed.
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
import { buildPromptCommandString } from "@superset/shared/agent-prompt-launch";
import { createDb, type HostDb } from "../db/index.ts";
import { projects, workspaces } from "../db/schema.ts";
import { disposeDaemonClient } from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSessionAndWait,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

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

const FISH = findOnPath("fish");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-fishxport-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-fishxport-${process.pid}.sock`);
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

// Exercises quotes, dollars, backticks, blank lines, and multi-line content —
// all of it must reach the agent argv/stdin byte-for-byte.
const PROMPT = "fix the 'bug'\n$HOME `pwd` \"quoted\"\n\ndone";

async function launchAndRead(initialCommand: string): Promise<string> {
	const terminalId = `e2e-fishxport-${randomUUID().slice(0, 8)}`;
	const session = await createTerminalSessionInternal({
		terminalId,
		workspaceId,
		db,
		listed: true,
		initialCommand,
	});
	assert.ok(!("error" in session), "error" in session ? session.error : "");
	return terminalId;
}

before(async () => {
	if (!FISH) return;
	fs.mkdirSync(TEST_HOME, { recursive: true });
	fs.mkdirSync(FAKE_USER_HOME, { recursive: true });
	const worktreePath = path.join(TEST_HOME, "worktree");
	fs.mkdirSync(worktreePath, { recursive: true });

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-fishxport-e2e",
	});
	await server.listen();

	for (const key of OVERRIDDEN_ENV_KEYS) savedEnv.set(key, process.env[key]);
	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-fishxport-e2e";
	process.env.NODE_ENV = "development";

	__setAccountShellForTesting(FISH);
	initTerminalBaseEnv({
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		HOME: FAKE_USER_HOME,
		SHELL: FISH,
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
	if (!FISH) return;
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

describe("fish prompt transport rewrite", () => {
	test(
		"argv heredoc transport delivers the exact prompt to a real fish",
		{ skip: !FISH, timeout: 30_000 },
		async () => {
			const outFile = path.join(TEST_HOME, "argv-out");
			// `printf '%s'` prints its argv-1 verbatim — whatever fish passes as
			// the substituted argument is exactly what lands in the file.
			const initialCommand = buildPromptCommandString({
				command: "printf '%s'",
				suffix: `> "${outFile}"`,
				transport: "argv",
				prompt: PROMPT,
				randomId: randomUUID(),
			});

			const terminalId = await launchAndRead(initialCommand);
			try {
				await waitFor(() => fs.existsSync(outFile), 25_000);
				await new Promise((r) => setTimeout(r, 300));
				assert.equal(fs.readFileSync(outFile, "utf8"), PROMPT);

				// The staged prompt file deleted itself when the command consumed it.
				const leftovers = fs
					.readdirSync(os.tmpdir())
					.filter((f) => f.startsWith(`superset-launch-prompt-${terminalId}`));
				assert.deepEqual(leftovers, []);
			} finally {
				await disposeSessionAndWait(terminalId, db);
			}
		},
	);

	test(
		"stdin heredoc transport delivers the exact prompt to a real fish",
		{ skip: !FISH, timeout: 30_000 },
		async () => {
			const outFile = path.join(TEST_HOME, "stdin-out");
			const initialCommand = buildPromptCommandString({
				command: "cat",
				suffix: `> "${outFile}"`,
				transport: "stdin",
				prompt: PROMPT,
				randomId: randomUUID(),
			});

			const terminalId = await launchAndRead(initialCommand);
			try {
				await waitFor(() => fs.existsSync(outFile), 25_000);
				await new Promise((r) => setTimeout(r, 300));
				// The heredoc body carries a trailing newline; so does the staged file.
				assert.equal(fs.readFileSync(outFile, "utf8"), `${PROMPT}\n`);

				const leftovers = fs
					.readdirSync(os.tmpdir())
					.filter((f) => f.startsWith(`superset-launch-prompt-${terminalId}`));
				assert.deepEqual(leftovers, []);
			} finally {
				await disposeSessionAndWait(terminalId, db);
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
