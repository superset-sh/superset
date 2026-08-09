// End-to-end tests for the headless follow-up surface: writeFramedInputToSession
// and snapshotSession. Drives a real pty-daemon Server (in-process), real
// SQLite host DB, and real shells — same harness as terminal.adoption.node-test.
//
// Covers the behaviors the public terminals.send / terminals.read verbs rely on:
//   - send delivers text + Enter into a live shell
//   - multi-line text is framed as a bracketed paste when (and only when) the
//     running program enabled paste mode — verified byte-for-byte via `cat > f`
//   - snapshot returns the emulator's screen text (normal and alt buffer),
//     respects maxLines, and never disturbs the session
//   - both verbs adopt daemon-owned sessions after a host-service restart
//   - error cases: unknown terminal, exited session, cross-workspace targeting
//
// Runs under Node with the tsx loader (the tRPC router tree uses
// extensionless imports, which --experimental-strip-types cannot resolve), or
// Electron-as-Node when the local better-sqlite3 build targets the Electron
// ABI:
//   ELECTRON_RUN_AS_NODE=1 <electron> --import <tsx>/dist/loader.mjs --test <file>

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
import {
	disposeDaemonClient,
	getDaemonClient,
} from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSessionAndWait,
	snapshotSession,
	writeFramedInputToSession,
	writeInputToSession,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-sendsnap-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-sendsnap-${process.pid}.sock`);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");

let server: Server;
let db: HostDb;
let projectId: string;
let workspaceId: string;
let otherWorkspaceId: string;
let worktreePath: string;
let otherWorktreePath: string;

before(async () => {
	fs.mkdirSync(TEST_HOME, { recursive: true });
	worktreePath = path.join(TEST_HOME, "worktree");
	otherWorktreePath = path.join(TEST_HOME, "other-worktree");
	fs.mkdirSync(worktreePath, { recursive: true });
	fs.mkdirSync(otherWorktreePath, { recursive: true });

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-sendsnap-e2e",
	});
	await server.listen();

	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-sendsnap-e2e";
	process.env.NODE_ENV = "development";

	__setAccountShellForTesting("/bin/sh");
	initTerminalBaseEnv({
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		HOME: process.env.HOME ?? TEST_HOME,
		SHELL: "/bin/sh",
	});

	db = createDb(path.join(TEST_HOME, "host.db"), MIGRATIONS);

	projectId = randomUUID();
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
	otherWorkspaceId = randomUUID();
	db.insert(workspaces)
		.values({
			id: otherWorkspaceId,
			projectId,
			worktreePath: otherWorktreePath,
			branch: "feature/other",
		})
		.run();
});

after(async () => {
	__resetSessionsForTesting();
	__setAccountShellForTesting(undefined);
	await disposeDaemonClient();
	await server.close();
	try {
		fs.rmSync(TEST_HOME, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

describe("writeFramedInputToSession / snapshotSession", () => {
	test("send delivers text + Enter into a live shell", async () => {
		const terminalId = `e2e-send-${randomUUID().slice(0, 8)}`;
		const sentinelFile = path.join(TEST_HOME, `send-${terminalId}`);

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		const result = await writeFramedInputToSession({
			terminalId,
			workspaceId,
			text: `echo ok > "${sentinelFile}"`,
			submit: true,
			db,
		});
		assert.ok(!("error" in result), JSON.stringify(result));
		await waitFor(() => fs.existsSync(sentinelFile), 5000);

		await disposeSessionAndWait(terminalId, db);
	});

	test("submit: false stages text without executing it", async () => {
		const terminalId = `e2e-stage-${randomUUID().slice(0, 8)}`;
		const sentinelFile = path.join(TEST_HOME, `stage-${terminalId}`);

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		const staged = await writeFramedInputToSession({
			terminalId,
			workspaceId,
			text: `echo ok > "${sentinelFile}"`,
			submit: false,
			db,
		});
		assert.ok(!("error" in staged));

		// The staged text is echoed by the PTY but must not execute.
		await waitForSnapshotText(terminalId, sentinelFile, 5000);
		await new Promise((r) => setTimeout(r, 300));
		assert.equal(fs.existsSync(sentinelFile), false);

		// A bare Enter afterwards executes the staged line.
		const submitted = await writeFramedInputToSession({
			terminalId,
			workspaceId,
			text: "",
			submit: true,
			db,
		});
		// Empty text is rejected at the router; at this layer it is a plain
		// Enter press.
		assert.ok(!("error" in submitted));
		await waitFor(() => fs.existsSync(sentinelFile), 5000);

		await disposeSessionAndWait(terminalId, db);
	});

	test("snapshot returns screen text and respects maxLines", async () => {
		const terminalId = `e2e-snap-${randomUUID().slice(0, 8)}`;
		const marker = `snap-marker-${randomUUID().slice(0, 6)}`;

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: `printf 'one\\ntwo\\n%s\\n' "${marker}"`,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		await waitForSnapshotText(terminalId, marker, 5000);

		const full = await snapshotSession({ terminalId, workspaceId, db });
		assert.ok(!("error" in full), JSON.stringify(full));
		if ("error" in full) return;
		assert.ok(full.cols > 0 && full.rows > 0);
		assert.ok(full.text.includes(marker));

		// maxLines: 1 returns at most the bottom row of the buffer (trailing
		// blank rows are trimmed, so it may be empty but never multi-line).
		const capped = await snapshotSession({
			terminalId,
			workspaceId,
			maxLines: 1,
			db,
		});
		assert.ok(!("error" in capped));
		if ("error" in capped) return;
		assert.ok(capped.text.split("\n").length <= 1);
		assert.ok(capped.text.length <= full.text.length);

		await disposeSessionAndWait(terminalId, db);
	});

	test("multi-line send is paste-framed only when the program enabled bracketed paste", async () => {
		const terminalId = `e2e-paste-${randomUUID().slice(0, 8)}`;
		const id = randomUUID().slice(0, 6);
		const captureFile = path.join(TEST_HOME, `paste-${terminalId}`);
		const doneFile = path.join(TEST_HOME, `paste-done-${terminalId}`);

		// The shell itself has paste mode off; `printf` turns it on the way a
		// TUI agent does at startup, then `cat` captures exactly the bytes the
		// PTY delivers to the foreground program.
		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: `printf '\\033[?2004h'; cat > "${captureFile}"; printf '\\033[?2004l'; echo done > "${doneFile}"`,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		await waitFor(() => session.modeTracker.isBracketedPasteActive(), 5000);

		const sent = await writeFramedInputToSession({
			terminalId,
			workspaceId,
			text: `line1-${id}\nline2-${id}`,
			submit: true,
			db,
		});
		assert.ok(!("error" in sent));

		// EOF for cat: the framed write ended in Enter, so input is at line
		// start and a single ^D terminates it. Sent byte-exact — the framed
		// path would paste-wrap the control char (send has text semantics).
		const eof = writeInputToSession({
			terminalId,
			workspaceId,
			data: "\x04",
		});
		assert.ok(!("error" in eof));

		await waitFor(() => fs.existsSync(doneFile), 5000);
		const captured = fs.readFileSync(captureFile, "latin1");
		assert.ok(
			captured.includes(`\x1b[200~line1-${id}\nline2-${id}\x1b[201~`),
			`expected paste-framed payload, got: ${JSON.stringify(captured)}`,
		);

		// After `cat` exits, `printf '\\033[?2004l'` turned paste mode off
		// again; the same send must now go through unframed.
		await waitFor(() => !session.modeTracker.isBracketedPasteActive(), 5000);
		const plainFile = path.join(TEST_HOME, `plain-${terminalId}`);
		const plain = await writeFramedInputToSession({
			terminalId,
			workspaceId,
			text: `echo plain-${id} > "${plainFile}"`,
			submit: true,
			db,
		});
		assert.ok(!("error" in plain));
		await waitFor(() => fs.existsSync(plainFile), 5000);

		await disposeSessionAndWait(terminalId, db);
	});

	test("submit Enter is a separate write, delayed past the paste burst", async () => {
		const terminalId = `e2e-enterdelay-${randomUUID().slice(0, 8)}`;
		const id = randomUUID().slice(0, 6);
		const captureFile = path.join(TEST_HOME, `enterdelay-${terminalId}`);
		const doneFile = path.join(TEST_HOME, `enterdelay-done-${terminalId}`);

		// `cat > file` under canonical mode: nothing reaches the file until a
		// line terminator arrives, so the capture file is the oracle for
		// whether the Enter has been written yet.
		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: `printf '\\033[?2004h'; cat > "${captureFile}"; printf '\\033[?2004l'; echo done > "${doneFile}"`,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		await waitFor(() => session.modeTracker.isBracketedPasteActive(), 5000);

		// Record pty writes so the assertion is on the write layer itself: a
		// delayed-but-bundled `text\r` write would still pass a file-content
		// check, but not a two-writes-with-a-gap check.
		const writes: Array<{ data: string; at: number }> = [];
		const pty = session.pty as unknown as { write(data: string): void };
		const originalWrite = pty.write.bind(session.pty);
		pty.write = (data: string) => {
			writes.push({ data, at: Date.now() });
			originalWrite(data);
		};

		const pending = writeFramedInputToSession({
			terminalId,
			workspaceId,
			text: `delayed-${id}`,
			submit: true,
			db,
		});
		// Mid-delay: the text write must not have been submitted yet — a
		// bundled `text\r` write would have flushed the line already.
		await new Promise((r) => setTimeout(r, 150));
		const midDelay = fs.existsSync(captureFile)
			? fs.readFileSync(captureFile, "latin1")
			: "";
		assert.ok(
			!midDelay.includes(`delayed-${id}`),
			`Enter must be delayed past the text write, got: ${JSON.stringify(midDelay)}`,
		);

		const sent = await pending;
		pty.write = originalWrite;
		assert.ok(!("error" in sent));
		assert.deepEqual(
			writes.map((w) => w.data),
			[`\x1b[200~delayed-${id}\x1b[201~`, "\r"],
			"send must be exactly two writes: framed text, then a bare Enter",
		);
		const [textWrite, enterWrite] = writes;
		assert.ok(textWrite && enterWrite);
		assert.ok(
			enterWrite.at - textWrite.at >= 400,
			`Enter must trail the text write, gap was ${enterWrite.at - textWrite.at}ms`,
		);
		await waitFor(
			() =>
				fs.existsSync(captureFile) &&
				fs
					.readFileSync(captureFile, "latin1")
					.includes(`\x1b[200~delayed-${id}\x1b[201~`),
			5000,
		);

		const eof = writeInputToSession({ terminalId, workspaceId, data: "\x04" });
		assert.ok(!("error" in eof));
		await waitFor(() => fs.existsSync(doneFile), 5000);

		await disposeSessionAndWait(terminalId, db);
	});

	test("concurrent sends serialize: a staged draft cannot ride another send's Enter", async () => {
		const terminalId = `e2e-serialize-${randomUUID().slice(0, 8)}`;
		const id = randomUUID().slice(0, 6);

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		const writes: string[] = [];
		const pty = session.pty as unknown as { write(data: string): void };
		const originalWrite = pty.write.bind(session.pty);
		pty.write = (data: string) => {
			writes.push(data);
			originalWrite(data);
		};

		// Fire a submitting send and a submit: false draft concurrently. The
		// draft must not land inside the first send's text→Enter window, or
		// the Enter would submit it too.
		const [first, second] = await Promise.all([
			writeFramedInputToSession({
				terminalId,
				workspaceId,
				text: `: submit-${id}`,
				submit: true,
				db,
			}),
			writeFramedInputToSession({
				terminalId,
				workspaceId,
				text: `: draft-${id}`,
				submit: false,
				db,
			}),
		]);
		pty.write = originalWrite;
		assert.ok(!("error" in first));
		assert.ok(!("error" in second));
		assert.deepEqual(
			writes,
			[`: submit-${id}`, "\r", `: draft-${id}`],
			"draft text must come after the first send's Enter",
		);

		await disposeSessionAndWait(terminalId, db);
	});

	test("concurrent sends racing a fresh adoption share one session and serialize", async () => {
		const terminalId = `e2e-adoptrace-${randomUUID().slice(0, 8)}`;
		const id = randomUUID().slice(0, 6);
		const captureFile = path.join(TEST_HOME, `adoptrace-${terminalId}`);
		const doneFile = path.join(TEST_HOME, `adoptrace-done-${terminalId}`);

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: `printf '\\033[?2004h'; cat > "${captureFile}"; printf '\\033[?2004l'; echo done > "${doneFile}"`,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;
		await waitFor(() => session.modeTracker.isBracketedPasteActive(), 5000);

		// Simulate a host-service restart: memory empties, daemon lives. Both
		// sends below then race the adoption; without in-flight dedup they get
		// separate TerminalSession objects whose write chains interleave, and
		// the draft rides the first send's Enter.
		__resetSessionsForTesting();
		await disposeDaemonClient();

		const [first, second] = await Promise.all([
			writeFramedInputToSession({
				terminalId,
				workspaceId,
				text: `submit-${id}`,
				submit: true,
				db,
			}),
			writeFramedInputToSession({
				terminalId,
				workspaceId,
				text: `draft-${id}`,
				submit: false,
				db,
			}),
		]);
		assert.ok(!("error" in first), JSON.stringify(first));
		assert.ok(!("error" in second), JSON.stringify(second));

		// First ^D flushes the staged draft line to cat, second at line start
		// is EOF.
		writeInputToSession({ terminalId, workspaceId, data: "\x04" });
		writeInputToSession({ terminalId, workspaceId, data: "\x04" });
		await waitFor(() => fs.existsSync(doneFile), 5000);

		const captured = fs.readFileSync(captureFile, "latin1");
		const submitIndex = captured.indexOf(`submit-${id}`);
		const draftIndex = captured.indexOf(`draft-${id}`);
		assert.ok(
			submitIndex >= 0 && draftIndex > submitIndex,
			`expected submit before draft, got: ${JSON.stringify(captured)}`,
		);
		assert.ok(
			captured.slice(submitIndex, draftIndex).includes("\n"),
			`Enter must land between the submitted text and the draft, got: ${JSON.stringify(captured)}`,
		);

		await disposeSessionAndWait(terminalId, db);
	});

	test("snapshot reads the alt-screen buffer while a TUI is active", async () => {
		const terminalId = `e2e-alt-${randomUUID().slice(0, 8)}`;
		const id = randomUUID().slice(0, 6);

		// Enter the alt screen and draw a marker assembled by printf so the
		// echoed command line (which stays in the normal buffer) can't match.
		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: `printf '\\033[?1049h\\033[HALT-%s' "${id}"`,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		await waitForSnapshotText(terminalId, `ALT-${id}`, 5000);

		const snap = await snapshotSession({ terminalId, workspaceId, db });
		assert.ok(!("error" in snap));
		if ("error" in snap) return;
		assert.ok(snap.text.includes(`ALT-${id}`));

		await disposeSessionAndWait(terminalId, db);
	});

	test("send and snapshot adopt a daemon session after host-service restart simulation", async () => {
		const terminalId = `e2e-sendadopt-${randomUUID().slice(0, 8)}`;
		const id = randomUUID().slice(0, 6);
		const sentinelFile = path.join(TEST_HOME, `sendadopt-${terminalId}`);

		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: `echo pre-restart-${id}`,
		});
		assert.ok(!("error" in first));
		if ("error" in first) return;
		await waitForSnapshotText(terminalId, `pre-restart-${id}`, 5000);

		// Simulate host-service crash + restart: memory empties, daemon lives.
		__resetSessionsForTesting();
		await disposeDaemonClient();

		// Snapshot adopts and sees pre-restart output via ring-buffer replay.
		const snap = await snapshotSession({ terminalId, workspaceId, db });
		assert.ok(!("error" in snap), JSON.stringify(snap));
		if ("error" in snap) return;
		assert.ok(
			snap.text.includes(`pre-restart-${id}`),
			`replayed snapshot should contain pre-restart output, got: ${JSON.stringify(snap.text)}`,
		);

		// Send keeps working against the adopted (same-pid) shell.
		const sent = await writeFramedInputToSession({
			terminalId,
			workspaceId,
			text: `echo ok > "${sentinelFile}"`,
			submit: true,
			db,
		});
		assert.ok(!("error" in sent), JSON.stringify(sent));
		await waitFor(() => fs.existsSync(sentinelFile), 5000);

		await disposeSessionAndWait(terminalId, db);
	});

	test("unknown terminal id returns a not-active error (no spawn)", async () => {
		const bogusId = `e2e-missing-${randomUUID().slice(0, 8)}`;

		const sent = await writeFramedInputToSession({
			terminalId: bogusId,
			workspaceId,
			text: "echo nope",
			submit: true,
			db,
		});
		assert.ok("error" in sent);
		if ("error" in sent) assert.match(sent.error, /not active/);

		const snap = await snapshotSession({
			terminalId: bogusId,
			workspaceId,
			db,
		});
		assert.ok("error" in snap);

		const daemon = await getDaemonClient();
		assert.equal(
			(await daemon.list()).find((s) => s.id === bogusId),
			undefined,
			"error path must not have spawned a PTY",
		);
	});

	test("send into an exited session fails; snapshot still serves the final screen", async () => {
		const terminalId = `e2e-exited-${randomUUID().slice(0, 8)}`;
		const id = randomUUID().slice(0, 6);

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: `echo last-words-${id}; exit 0`,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		await waitFor(() => session.exited, 5000);

		const sent = await writeFramedInputToSession({
			terminalId,
			workspaceId,
			text: "echo nope",
			submit: true,
			db,
		});
		assert.ok("error" in sent);
		if ("error" in sent) assert.match(sent.error, /exited/);

		const snap = await snapshotSession({ terminalId, workspaceId, db });
		assert.ok(!("error" in snap));
		if ("error" in snap) return;
		assert.ok(snap.text.includes(`last-words-${id}`));

		await disposeSessionAndWait(terminalId, db);
	});

	test("cross-workspace targeting is rejected", async () => {
		const terminalId = `e2e-cross-${randomUUID().slice(0, 8)}`;

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		const sent = await writeFramedInputToSession({
			terminalId,
			workspaceId: otherWorkspaceId,
			text: "echo nope",
			submit: true,
			db,
		});
		assert.ok("error" in sent);
		if ("error" in sent) assert.match(sent.error, /belong/);

		const snap = await snapshotSession({
			terminalId,
			workspaceId: otherWorkspaceId,
			db,
		});
		assert.ok("error" in snap);
		if ("error" in snap) assert.match(snap.error, /belong/);

		await disposeSessionAndWait(terminalId, db);
	});
});

// The wire surface: same scenarios through appRouter.createCaller, so the
// zod schemas, the `submit` default, and the TRPCError mapping are what's
// actually exercised — the public MCP/SDK/CLI verbs hit exactly this layer.
describe("terminal.send / terminal.snapshot tRPC procedures", () => {
	const TEST_ORG_ID = "00000000-0000-4000-8000-000000000000";

	async function makeCaller() {
		process.env.ORGANIZATION_ID = TEST_ORG_ID;
		process.env.HOST_SERVICE_SECRET = "test-secret";
		process.env.HOST_DB_PATH = path.join(TEST_HOME, "host.db");
		process.env.HOST_MIGRATIONS_FOLDER = MIGRATIONS;
		process.env.AUTH_TOKEN = "test-auth-token";
		process.env.SUPERSET_API_URL = "https://cloud.example.com";
		const { appRouter } = await import("../trpc/router/router.ts");
		return appRouter.createCaller({
			isAuthenticated: true,
			organizationId: TEST_ORG_ID,
			db,
		} as unknown as Parameters<typeof appRouter.createCaller>[0]);
	}

	test("send defaults submit to true and snapshot round-trips", async () => {
		const caller = await makeCaller();
		const terminalId = `e2e-rpc-${randomUUID().slice(0, 8)}`;
		const id = randomUUID().slice(0, 6);
		const sentinelFile = path.join(TEST_HOME, `rpc-${terminalId}`);

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		const sent = await caller.terminal.send({
			terminalId,
			workspaceId,
			text: `echo rpc-${id} > "${sentinelFile}"`,
		});
		assert.deepEqual(sent, { terminalId, submitted: true });
		await waitFor(() => fs.existsSync(sentinelFile), 5000);

		await waitForSnapshotText(terminalId, `rpc-${id}`, 5000);
		const snap = await caller.terminal.snapshot({ terminalId, workspaceId });
		assert.equal(snap.terminalId, terminalId);
		assert.ok(snap.cols > 0 && snap.rows > 0);
		assert.ok(snap.text.includes(`rpc-${id}`));

		await disposeSessionAndWait(terminalId, db);
	});

	test("maps errors to TRPC codes: NOT_FOUND, FORBIDDEN, BAD_REQUEST", async () => {
		const caller = await makeCaller();
		const terminalId = `e2e-rpc-err-${randomUUID().slice(0, 8)}`;

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		await assert.rejects(
			caller.terminal.send({
				terminalId: `missing-${terminalId}`,
				workspaceId,
				text: "echo nope",
			}),
			(err: { code?: string }) => err.code === "NOT_FOUND",
		);

		await assert.rejects(
			caller.terminal.send({
				terminalId,
				workspaceId: otherWorkspaceId,
				text: "echo nope",
			}),
			(err: { code?: string }) => err.code === "FORBIDDEN",
		);

		await assert.rejects(
			caller.terminal.snapshot({
				terminalId,
				workspaceId: otherWorkspaceId,
			}),
			(err: { code?: string }) => err.code === "FORBIDDEN",
		);

		await assert.rejects(
			caller.terminal.send({ terminalId, workspaceId, text: "" }),
			(err: { code?: string }) => err.code === "BAD_REQUEST",
		);

		await disposeSessionAndWait(terminalId, db);
	});

	test("rejects unauthenticated callers", async () => {
		await makeCaller();
		const { appRouter } = await import("../trpc/router/router.ts");
		const anonymous = appRouter.createCaller({
			isAuthenticated: false,
			organizationId: TEST_ORG_ID,
			db,
		} as unknown as Parameters<typeof appRouter.createCaller>[0]);

		await assert.rejects(
			anonymous.terminal.send({
				terminalId: "any",
				workspaceId,
				text: "echo nope",
			}),
			(err: { code?: string }) => err.code === "UNAUTHORIZED",
		);
	});
});

async function waitFor(predicate: () => boolean, ms: number): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > ms) throw new Error("waitFor timed out");
		await new Promise((r) => setTimeout(r, 25));
	}
}

async function waitForSnapshotText(
	terminalId: string,
	needle: string,
	ms: number,
): Promise<void> {
	const start = Date.now();
	for (;;) {
		const snap = await snapshotSession({ terminalId, workspaceId, db });
		if (!("error" in snap) && snap.text.includes(needle)) return;
		if (Date.now() - start > ms) {
			throw new Error(
				`waitForSnapshotText timed out waiting for ${JSON.stringify(needle)}; last: ${JSON.stringify(snap)}`,
			);
		}
		await new Promise((r) => setTimeout(r, 25));
	}
}
