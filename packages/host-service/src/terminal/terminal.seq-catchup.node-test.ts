// Regression tests for sequence-numbered exactly-once terminal output
// delivery (the re-fix for #6269 after the #6279 grid-resync revert, #6290).
//
// Protocol under test: every session tags its output stream with a per-object
// `epoch` and byte offset. A seq-aware client presents `?seq=<epoch>:<n>` on
// attach and receives exactly the bytes it missed from the catch-up ring
// (`synced` mode "exact"), the ring tail when it attaches empty ("tail"), or
// nothing at all plus a repaint nudge when its position is unknowable
// ("reanchor": epoch mismatch after a host restart, gap beyond the ring).
//
// The two invariants that killed #6279 are asserted directly:
//   1. The host must NEVER reset or overwrite a client's existing screen —
//      no `\x1bc` (RIS) may ever appear on the wire, and a reanchor attach
//      must deliver zero content bytes.
//   2. A reattach spanning a host-service restart (tracker knows LESS than
//      the renderer) must leave the renderer's grid intact and converge via
//      a PTY SIGWINCH repaint, not host-synthesized content.
//
// Harness: real in-process pty-daemon, real /bin/sh PTY running a scripted
// incremental-repaint TUI (Ink-style), the real host-service WS route, and
// @xterm/headless renderer stand-ins. A continuously-attached "witness"
// records the authoritative byte stream so catch-up payloads can be compared
// byte-for-byte, not just by final grid state.
//
// Run: `bun run test:e2e` from packages/host-service (Electron-as-Node with
// the tsx loader — see scripts/test-e2e.ts for why neither plain node nor
// strip-types works here).

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Server } from "@superset/pty-daemon";
import { Hono } from "hono";
import { createDb, type HostDb } from "../db/index.ts";
import { projects, workspaces } from "../db/schema.ts";
import type { EventBus } from "../events/index.ts";
import {
	disposeDaemonClient,
	getDaemonClient,
} from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import { HeadlessTerminal } from "./headless-xterm.ts";
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSessionAndWait,
	registerWorkspaceTerminalRoute,
	snapshotSession,
	writeInputToSession,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

type Headless = HeadlessTerminal;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-seqcatchup-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-seqcatchup-${process.pid}.sock`);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");

const COLS = 80;
const ROWS = 24;
const RIS = "\x1bc";

let server: Server;
let db: HostDb;
let workspaceId: string;
let httpPort: number;
let httpServer: ReturnType<typeof serve>;

// Ink-style incremental-repaint TUI (same shape as the #6279 repro): a
// bottom "input box" redrawn cursor-relative; `ticks` are region-only
// spinner repaints; SIGWINCH triggers a full clear+repaint; `blob` floods
// N KiB fast to blow past the catch-up ring.
const TUI_SCRIPT = String.raw`
stty -echo
frame=0
H=3
FILLER='................................................'
draw_box() {
  bh=$1
  printf '+==================================+\n'
  i=1
  while [ "$i" -le "$((bh - 2))" ]; do
    printf '| INPUT %06d line %d              |\n' "$frame" "$i"
    i=$((i + 1))
  done
  printf '+==================================+'
}
on_winch() {
  printf '\033[2J\033[H'
  printf 'FULL-REDRAW at frame %06d\n' "$frame"
  draw_box "$H"
}
trap on_winch WINCH
frames() {
  n=$1
  k=0
  while [ "$k" -lt "$n" ]; do
    frame=$((frame + 1))
    if [ "$(((frame / 7) % 2))" -eq 0 ]; then newH=3; else newH=6; fi
    printf '\r\033[%dA\033[0J' "$((H - 1))"
    printf 'transcript %06d %s\n' "$frame" "$FILLER"
    draw_box "$newH"
    H=$newH
    k=$((k + 1))
  done
}
ticks() {
  n=$1
  k=0
  while [ "$k" -lt "$n" ]; do
    frame=$((frame + 1))
    printf '\r\033[%dA\033[0J' "$((H - 1))"
    draw_box "$H"
    k=$((k + 1))
  done
}
setH() {
  printf '\r\033[%dA\033[0J' "$((H - 1))"
  H=$1
  draw_box "$H"
}
blob() {
  kb=$1
  dd if=/dev/zero bs=1024 count="$kb" 2>/dev/null | tr '\0' 'x'
  printf '\nBLOB-DONE %06d\n' "$frame"
  draw_box "$H"
}
printf '\033[2J\033[H'
printf 'TUI READY\n'
draw_box "$H"
while :; do
  IFS= read -r cmd || { sleep 0.02; continue; }
  set -- $cmd
  case $1 in
    frames) frames "$2" ;;
    ticks) ticks "$2" ;;
    setH) setH "$2" ;;
    blob) blob "$2" ;;
    quit) exit 0 ;;
  esac
done
`;

// Echo-free line reader that reports focus escapes. Focus sequences arrive
// with no newline, so they surface glued to the front of the next input
// line — the pattern match catches them there. `$1 = on` enables mode 1004.
const FOCUS_SCRIPT = String.raw`
stty -echo
if [ "$1" = "on" ]; then printf '\033[?1004h'; fi
printf 'READY-FOCUS\n'
n=0
while IFS= read -r line; do
  n=$((n+1))
  case $line in
    *"[I"*) printf 'EVT %03d SAW-FOCUS-IN\n' "$n" ;;
    *"[O"*) printf 'EVT %03d SAW-FOCUS-OUT\n' "$n" ;;
    *) printf 'EVT %03d LINE-OK\n' "$n" ;;
  esac
  case $line in *stop*) exit 0 ;; esac
done
`;

// Reports the PTY's size on demand. `stty size` is an ioctl on the slave fd,
// so it answers with what the kernel actually holds — the host's own
// bookkeeping could agree with itself and still never have resized anything.
// SIGWINCH is ignored so the resizes under test can't interrupt `read`.
const SIZE_SCRIPT = String.raw`
trap '' WINCH
stty -echo
printf 'READY-SIZE\n'
n=0
while IFS= read -r line; do
  n=$((n+1))
  printf 'SIZE %03d %s\n' "$n" "$(stty size | tr ' ' 'x')"
  case $line in *stop*) exit 0 ;; esac
done
`;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
	fn: () => boolean | Promise<boolean>,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await fn()) return;
		await sleep(50);
	}
	throw new Error(`Timed out waiting for: ${label}`);
}

function visibleText(term: Headless): string {
	const buf = term.buffer.active;
	const start = Math.max(0, buf.length - term.rows);
	const lines: string[] = [];
	for (let y = start; y < buf.length; y++) {
		lines.push(buf.getLine(y)?.translateToString(true) ?? "");
	}
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return lines.join("\n");
}

async function trackerVisible(terminalId: string): Promise<string> {
	const snap = await snapshotSession({
		terminalId,
		workspaceId,
		maxLines: ROWS,
		db,
	});
	if ("error" in snap) throw new Error(`snapshot failed: ${snap.error}`);
	return snap.text;
}

interface SyncedMessage {
	type: "synced";
	epoch: string;
	seq: number;
	mode: "exact" | "tail" | "reanchor";
}

/**
 * Renderer stand-in speaking the seq protocol like terminal-ws-transport.ts:
 * `?seq=` on dial, counting armed by `synced`, every counted binary frame
 * recorded at its absolute stream position for byte-level comparison.
 */
class SeqRenderer {
	term: Headless;
	anchor: { epoch: string; seq: number } | null = null;
	lastSynced: SyncedMessage | null = null;
	/** Counted (post-synced) chunks at absolute positions, across all attaches. */
	recorded: Array<{ start: number; bytes: Uint8Array }> = [];
	countedThisAttach = 0;
	/** Every binary frame ever received (counted or not), for RIS scanning. */
	allBinary: Uint8Array[] = [];
	private counting = false;
	private ws: WebSocket | null = null;
	private writeChain: Promise<void> = Promise.resolve();

	constructor(
		dims: { cols: number; rows: number } = { cols: COLS, rows: ROWS },
	) {
		this.term = new HeadlessTerminal({
			cols: dims.cols,
			rows: dims.rows,
			scrollback: 1000,
			allowProposedApi: true,
		});
	}

	/**
	 * `seqOverride` forces the dial-time `?seq=` value (e.g. "new"/"none").
	 * `autoResize: false` suppresses the on-attach resize so the pre-nudge
	 * attach state is observable (the host's forced repaint nudge waits for
	 * the client resize, or a 2s fallback).
	 */
	connect(
		terminalId: string,
		options: { seqOverride?: string; autoResize?: boolean } = {},
	): Promise<void> {
		const seqValue =
			options.seqOverride ??
			(this.anchor ? `${this.anchor.epoch}:${this.anchor.seq}` : "new");
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(
				`ws://127.0.0.1:${httpPort}/terminal/${terminalId}?seq=${encodeURIComponent(seqValue)}`,
			);
			ws.binaryType = "arraybuffer";
			this.ws = ws;
			this.counting = false;
			this.countedThisAttach = 0;
			this.lastSynced = null;
			const timer = setTimeout(
				() => reject(new Error("attach timeout")),
				10_000,
			);
			ws.addEventListener("message", (event) => {
				const data = (event as MessageEvent).data;
				if (data instanceof ArrayBuffer) {
					const bytes = new Uint8Array(data);
					this.allBinary.push(bytes);
					if (this.counting && this.anchor) {
						this.recorded.push({ start: this.anchor.seq, bytes });
						this.anchor.seq += bytes.byteLength;
						this.countedThisAttach += bytes.byteLength;
					}
					this.writeChain = this.writeChain.then(
						() => new Promise<void>((r) => this.term.write(bytes, r)),
					);
					return;
				}
				const message = JSON.parse(String(data)) as
					| SyncedMessage
					| { type: string };
				if (message.type === "attached") {
					if (options.autoResize !== false) {
						this.sendResize(this.term.cols, this.term.rows);
					}
					clearTimeout(timer);
					resolve();
					return;
				}
				if (message.type === "synced") {
					const synced = message as SyncedMessage;
					this.lastSynced = synced;
					this.anchor = { epoch: synced.epoch, seq: synced.seq };
					this.counting = true;
				}
			});
			ws.addEventListener("error", () => {
				clearTimeout(timer);
				reject(new Error("ws error during connect"));
			});
		});
	}

	sendResize(cols: number, rows: number): void {
		this.ws?.send(JSON.stringify({ type: "resize", cols, rows }));
	}

	sendVisible(visible: boolean): void {
		this.ws?.send(JSON.stringify({ type: "visible", visible }));
	}

	sendFocus(focused: boolean): void {
		this.ws?.send(JSON.stringify({ type: "focus", focused }));
	}

	sendInput(data: string): void {
		this.ws?.send(JSON.stringify({ type: "input", data }));
	}

	disconnect(): Promise<void> {
		return new Promise((resolve) => {
			const ws = this.ws;
			this.ws = null;
			this.counting = false;
			if (!ws || ws.readyState === WebSocket.CLOSED) return resolve();
			ws.addEventListener("close", () => resolve());
			ws.close();
		});
	}

	async drain(): Promise<void> {
		await this.writeChain;
	}

	/** Counted stream bytes covering [from, to), concatenated. */
	streamBytes(from: number, to: number): Buffer {
		const parts: Buffer[] = [];
		for (const { start, bytes } of this.recorded) {
			const end = start + bytes.byteLength;
			if (end <= from || start >= to) continue;
			const sliceFrom = Math.max(from, start) - start;
			const sliceTo = Math.min(to, end) - start;
			parts.push(Buffer.from(bytes.subarray(sliceFrom, sliceTo)));
		}
		return Buffer.concat(parts);
	}

	assertNoReset(label: string): void {
		for (const bytes of this.allBinary) {
			assert.ok(
				!Buffer.from(bytes).includes(RIS),
				`${label}: a full-reset (\\x1bc) must never be sent to a client`,
			);
		}
	}

	async waitSynced(timeoutMs = 5_000): Promise<SyncedMessage> {
		await waitFor(
			() => this.lastSynced !== null,
			timeoutMs,
			"synced message to arrive",
		);
		return this.lastSynced as SyncedMessage;
	}

	async waitVisible(marker: string, timeoutMs = 15_000): Promise<void> {
		await waitFor(
			async () => {
				await this.drain();
				return visibleText(this.term).includes(marker);
			},
			timeoutMs,
			`renderer to show "${marker}"`,
		);
	}

	dispose(): void {
		this.term.dispose();
	}
}

function sendCommand(terminalId: string, command: string): void {
	const result = writeInputToSession({
		terminalId,
		workspaceId,
		data: `${command}\n`,
	});
	assert.ok(!("error" in result), JSON.stringify(result));
}

async function waitForTrackerText(
	terminalId: string,
	marker: string,
	timeoutMs = 30_000,
): Promise<void> {
	await waitFor(
		async () => (await trackerVisible(terminalId)).includes(marker),
		timeoutMs,
		`tracker to show "${marker}"`,
	);
}

before(async () => {
	fs.mkdirSync(TEST_HOME, { recursive: true });
	const worktreePath = path.join(TEST_HOME, "worktree");
	fs.mkdirSync(worktreePath, { recursive: true });
	fs.writeFileSync(path.join(TEST_HOME, "tui.sh"), TUI_SCRIPT);
	fs.writeFileSync(path.join(TEST_HOME, "focus.sh"), FOCUS_SCRIPT);
	fs.writeFileSync(path.join(TEST_HOME, "size.sh"), SIZE_SCRIPT);

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-seqcatchup-e2e",
	});
	await server.listen();

	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-seqcatchup-e2e";
	process.env.NODE_ENV = "development";

	__setAccountShellForTesting("/bin/sh");
	initTerminalBaseEnv({
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		HOME: process.env.HOME ?? TEST_HOME,
		SHELL: "/bin/sh",
	});

	db = createDb(path.join(TEST_HOME, "host.db"), MIGRATIONS);

	const projectId = randomUUID();
	workspaceId = randomUUID();
	db.insert(projects).values({ id: projectId, repoPath: worktreePath }).run();
	db.insert(workspaces)
		.values({ id: workspaceId, projectId, worktreePath, branch: "main" })
		.run();

	const app = new Hono();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
	registerWorkspaceTerminalRoute({
		app,
		db,
		eventBus: undefined as unknown as EventBus,
		upgradeWebSocket,
	});
	httpPort = await new Promise<number>((resolve) => {
		httpServer = serve(
			{ fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
			(info) => resolve(info.port),
		);
	});
	injectWebSocket(httpServer);
});

after(async () => {
	__resetSessionsForTesting();
	__setAccountShellForTesting(undefined);
	await disposeDaemonClient();
	await server.close();
	await new Promise<void>((resolve) => httpServer.close(() => resolve()));
	try {
		fs.rmSync(TEST_HOME, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

test(
	"seq catch-up: gapless, in-ring, beyond-ring, and restart-spanning reattaches",
	{ timeout: 240_000 },
	async () => {
		const terminalId = `seq-e2e-${randomUUID().slice(0, 8)}`;
		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			cols: COLS,
			rows: ROWS,
			initialCommand: `exec bash '${path.join(TEST_HOME, "tui.sh")}'`,
		});
		if ("error" in session) assert.fail(session.error);

		// Ground truth: a direct daemon subscription, bypassing host-service
		// entirely. Comparisons are window-based (quiescent point to quiescent
		// point), so no absolute alignment with the recorder is needed —
		// client-vs-client comparison alone is blind to a systematic
		// off-by-one that shifts every client identically.
		const daemon = await getDaemonClient();
		const truthChunks: Uint8Array[] = [];
		let truthLen = 0;
		const unsubTruth = daemon.subscribe(
			terminalId,
			{ replay: false },
			{
				onOutput(chunk) {
					truthChunks.push(Uint8Array.from(chunk));
					truthLen += chunk.byteLength;
				},
				onExit() {},
			},
		);
		const truthBytes = (from: number, to: number): Buffer => {
			const parts: Buffer[] = [];
			let pos = 0;
			for (const chunk of truthChunks) {
				const end = pos + chunk.byteLength;
				if (end > from && pos < to) {
					parts.push(
						Buffer.from(
							chunk.subarray(
								Math.max(from, pos) - pos,
								Math.min(to, end) - pos,
							),
						),
					);
				}
				pos = end;
			}
			return Buffer.concat(parts);
		};
		const truthQuiesced = async (): Promise<number> => {
			let seen = -1;
			await waitFor(
				() => {
					if (truthLen === seen) return true;
					seen = truthLen;
					return false;
				},
				15_000,
				"daemon truth stream to quiesce",
			);
			return truthLen;
		};

		const witness = new SeqRenderer();
		const renderer = new SeqRenderer();
		try {
			// ── Phase 1: two virgin clients attach (tail), streaming keeps them in step
			await witness.connect(terminalId);
			await renderer.connect(terminalId);
			assert.equal((await witness.waitSynced()).mode, "tail");
			assert.equal((await renderer.waitSynced()).mode, "tail");
			await waitForTrackerText(terminalId, "TUI READY");
			sendCommand(terminalId, "frames 20");
			sendCommand(terminalId, "setH 6");
			await renderer.waitVisible("INPUT 000020");
			await witness.waitVisible("INPUT 000020");
			await sleep(200);
			await Promise.all([renderer.drain(), witness.drain()]);
			assert.equal(
				visibleText(renderer.term),
				await trackerVisible(terminalId),
				"phase 1: attached streaming must keep the grid in step with the tracker",
			);
			assert.equal(
				renderer.anchor?.seq,
				witness.anchor?.seq,
				"phase 1: both clients must agree on the stream position",
			);
			// Window check: a quiescent stretch of live output must land in the
			// client byte-for-byte and count-for-count against the daemon truth.
			const w1t0 = await truthQuiesced();
			const w1a0 = witness.anchor?.seq ?? 0;
			sendCommand(terminalId, "ticks 5");
			await witness.waitVisible("INPUT 000025");
			const w1t1 = await truthQuiesced();
			await witness.drain();
			const w1a1 = witness.anchor?.seq ?? 0;
			assert.equal(
				w1a1 - w1a0,
				w1t1 - w1t0,
				"phase 1: the client must count exactly the daemon's true bytes",
			);
			assert.equal(
				Buffer.compare(witness.streamBytes(w1a0, w1a1), truthBytes(w1t0, w1t1)),
				0,
				"phase 1: live window must be byte-identical to the daemon truth",
			);
			console.log("PHASE 1 attached streaming ✓");

			// ── Phase 2: gapless reattach delivers ZERO content bytes ────────────
			const gridBeforeGapless = visibleText(renderer.term);
			await renderer.disconnect();
			await sleep(300);
			await renderer.connect(terminalId);
			assert.equal(
				(await renderer.waitSynced()).mode,
				"exact",
				"phase 2: a gapless anchored reattach must be an exact sync",
			);
			await sleep(300);
			await renderer.drain();
			assert.equal(
				renderer.countedThisAttach,
				0,
				"phase 2: no output was missed, so no bytes may be re-delivered",
			);
			assert.equal(
				visibleText(renderer.term),
				gridBeforeGapless,
				"phase 2: the grid must be untouched by a gapless reattach",
			);
			console.log("PHASE 2 gapless reattach: zero bytes ✓");

			// ── Phase 3: gap within the ring → exactly the missed bytes ──────────
			await renderer.disconnect();
			await sleep(300);
			const gapStart = renderer.anchor?.seq ?? 0;
			const w3t0 = await truthQuiesced();
			sendCommand(terminalId, "ticks 60");
			await waitForTrackerText(terminalId, "INPUT 000085");
			await witness.waitVisible("INPUT 000085");
			const w3t1 = await truthQuiesced();
			await renderer.connect(terminalId);
			const synced3 = await renderer.waitSynced();
			assert.equal(synced3.mode, "exact");
			assert.equal(
				synced3.seq,
				gapStart,
				"phase 3: exact sync must anchor at the client's position",
			);
			await renderer.waitVisible("INPUT 000085");
			await sleep(200);
			await Promise.all([renderer.drain(), witness.drain()]);
			const gapEnd = witness.anchor?.seq ?? 0;
			assert.ok(gapEnd > gapStart, "phase 3: the gap must be non-empty");
			assert.equal(
				Buffer.compare(
					renderer.streamBytes(gapStart, gapEnd),
					witness.streamBytes(gapStart, gapEnd),
				),
				0,
				"phase 3: catch-up must deliver byte-for-byte what the witness saw live",
			);
			const catchup3 = renderer.streamBytes(gapStart, gapStart + (w3t1 - w3t0));
			assert.equal(
				catchup3.length,
				w3t1 - w3t0,
				"phase 3: the catch-up must cover exactly the daemon's true gap length",
			);
			assert.equal(
				Buffer.compare(catchup3, truthBytes(w3t0, w3t1)),
				0,
				"phase 3: catch-up must match the daemon's true stream",
			);
			assert.equal(
				visibleText(renderer.term),
				await trackerVisible(terminalId),
				"phase 3: grids must converge after catch-up",
			);
			console.log("PHASE 3 in-ring gap: exact byte catch-up ✓");

			// ── Phase 4: the #6269 repro shape (~105 KB gap), healed by catch-up ─
			await renderer.disconnect();
			await sleep(300);
			const bigGapStart = renderer.anchor?.seq ?? 0;
			const w4t0 = await truthQuiesced();
			sendCommand(terminalId, "frames 200");
			sendCommand(terminalId, "setH 3");
			sendCommand(terminalId, "ticks 1500");
			await waitForTrackerText(terminalId, "INPUT 001785", 60_000);
			await witness.waitVisible("INPUT 001785", 60_000);
			const w4t1 = await truthQuiesced();
			await renderer.connect(terminalId);
			assert.equal(
				(await renderer.waitSynced()).mode,
				"exact",
				"phase 4: a ~105KB gap fits the 2MiB ring and must catch up exactly",
			);
			await renderer.waitVisible("INPUT 001785");
			await sleep(200);
			await Promise.all([renderer.drain(), witness.drain()]);
			const bigGapEnd = witness.anchor?.seq ?? 0;
			assert.equal(
				Buffer.compare(
					renderer.streamBytes(bigGapStart, bigGapEnd),
					witness.streamBytes(bigGapStart, bigGapEnd),
				),
				0,
				"phase 4: the large catch-up must be byte-identical to the live stream",
			);
			const catchup4 = renderer.streamBytes(
				bigGapStart,
				bigGapStart + (w4t1 - w4t0),
			);
			assert.equal(
				catchup4.length,
				w4t1 - w4t0,
				"phase 4: the catch-up must cover exactly the daemon's true gap length",
			);
			assert.equal(
				Buffer.compare(catchup4, truthBytes(w4t0, w4t1)),
				0,
				"phase 4: the large catch-up must match the daemon's true stream",
			);
			const grid4 = visibleText(renderer.term);
			assert.equal(
				grid4,
				await trackerVisible(terminalId),
				"phase 4: grids must converge after the large catch-up",
			);
			assert.ok(
				!grid4.includes("INPUT 000085"),
				"phase 4: no ghost of the pre-gap input box may survive",
			);
			console.log("PHASE 4 #6269 repro gap: healed by exact catch-up ✓");

			// The witness has served its purpose; the blob would take it seconds
			// to parse and its own gap handling isn't under test here.
			await witness.disconnect();

			// ── Phase 5: gap beyond the ring → reanchor, screen preserved, nudge heals
			await renderer.disconnect();
			await sleep(300);
			const gridBeforeBlob = visibleText(renderer.term);
			sendCommand(terminalId, "blob 3072"); // 3 MiB > 2 MiB ring
			await waitForTrackerText(terminalId, "BLOB-DONE", 60_000);
			// Suppress the on-attach resize so the host's forced nudge (which
			// waits for it) can't repaint before the attach state is asserted.
			await renderer.connect(terminalId, { autoResize: false });
			const synced5 = await renderer.waitSynced();
			assert.equal(
				synced5.mode,
				"reanchor",
				"phase 5: a gap beyond the ring must reanchor, not guess",
			);
			await sleep(400);
			await renderer.drain();
			assert.ok(
				!renderer
					.streamBytes(synced5.seq, renderer.anchor?.seq ?? synced5.seq)
					.includes("x".repeat(64)),
				"phase 5: reanchor must not deliver the missed blob content",
			);
			assert.equal(
				visibleText(renderer.term),
				gridBeforeBlob,
				"phase 5: the client's stale-but-real screen must be preserved (the #6290 regression)",
			);
			// The client resize matches the PTY dims, so the host must force the
			// repaint nudge; the TUI's WINCH handler then repaints everything.
			renderer.sendResize(COLS, ROWS);
			await renderer.waitVisible("FULL-REDRAW", 15_000);
			await sleep(300);
			await renderer.drain();
			assert.equal(
				visibleText(renderer.term),
				await trackerVisible(terminalId),
				"phase 5: the nudge-triggered repaint must converge the visible grid",
			);
			console.log("PHASE 5 beyond-ring gap: reanchor + nudge ✓");

			// ── Phase 6: host-service restart (epoch loss) — the #6290 case ──────
			const preRestartEpoch = renderer.anchor?.epoch;
			await renderer.disconnect();
			__resetSessionsForTesting();
			const gridBeforeRestart = visibleText(renderer.term);
			// Adoption path: the daemon still owns the PTY, the fresh session's
			// tracker knows almost nothing — exactly the state that made #6279
			// blank panes. The old-epoch anchor must reanchor.
			await renderer.connect(terminalId, { autoResize: false });
			const synced6 = await renderer.waitSynced();
			assert.equal(
				synced6.mode,
				"reanchor",
				"phase 6: an old-epoch anchor after a host restart must reanchor",
			);
			assert.notEqual(
				synced6.epoch,
				preRestartEpoch,
				"phase 6: the adopted session must mint a fresh epoch",
			);
			await sleep(400);
			await renderer.drain();
			assert.equal(
				visibleText(renderer.term),
				gridBeforeRestart,
				"phase 6: a restart-spanning reattach must NEVER blank or overwrite the grid (the #6290 regression)",
			);
			renderer.sendResize(COLS, ROWS);
			await renderer.waitVisible("FULL-REDRAW", 15_000);
			await sleep(300);
			await renderer.drain();
			assert.equal(
				visibleText(renderer.term),
				await trackerVisible(terminalId),
				"phase 6: post-restart nudge repaint must converge the visible grid",
			);
			console.log("PHASE 6 restart-spanning reattach: preserved + healed ✓");

			renderer.assertNoReset("whole run");
			witness.assertNoReset("whole run");
		} finally {
			try {
				unsubTruth();
			} catch {}
			await renderer.disconnect().catch(() => {});
			await witness.disconnect().catch(() => {});
			renderer.dispose();
			witness.dispose();
			await disposeSessionAndWait(terminalId, db).catch(() => {});
		}
	},
);

test(
	"legacy clients (no ?seq=) keep the pre-seq contract",
	{ timeout: 60_000 },
	async () => {
		const terminalId = `seq-legacy-${randomUUID().slice(0, 8)}`;
		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			cols: COLS,
			rows: ROWS,
			initialCommand: `exec bash '${path.join(TEST_HOME, "tui.sh")}'`,
		});
		if ("error" in session) assert.fail(session.error);

		const term = new HeadlessTerminal({
			cols: COLS,
			rows: ROWS,
			scrollback: 1000,
			allowProposedApi: true,
		});
		let sawSynced = false;
		let writeChain: Promise<void> = Promise.resolve();
		let ws: WebSocket | null = null;

		const connectLegacy = () =>
			new Promise<void>((resolve, reject) => {
				const socket = new WebSocket(
					`ws://127.0.0.1:${httpPort}/terminal/${terminalId}`,
				);
				socket.binaryType = "arraybuffer";
				ws = socket;
				const timer = setTimeout(
					() => reject(new Error("attach timeout")),
					10_000,
				);
				socket.addEventListener("message", (event) => {
					const data = (event as MessageEvent).data;
					if (data instanceof ArrayBuffer) {
						const bytes = new Uint8Array(data);
						writeChain = writeChain.then(
							() => new Promise<void>((r) => term.write(bytes, r)),
						);
						return;
					}
					const message = JSON.parse(String(data)) as { type: string };
					if (message.type === "synced") sawSynced = true;
					if (message.type === "attached") {
						clearTimeout(timer);
						resolve();
					}
				});
				socket.addEventListener("error", () => {
					clearTimeout(timer);
					reject(new Error("ws error during connect"));
				});
			});
		const disconnectLegacy = () =>
			new Promise<void>((resolve) => {
				const socket = ws as WebSocket | null;
				ws = null;
				if (!socket || socket.readyState === WebSocket.CLOSED) {
					return resolve();
				}
				socket.addEventListener("close", () => resolve());
				socket.close();
			});

		try {
			await connectLegacy();
			await waitForTrackerText(terminalId, "TUI READY");
			await waitFor(
				async () => {
					await writeChain;
					return visibleText(term).includes("TUI READY");
				},
				15_000,
				"legacy client to render the TUI",
			);

			// Zero-socket output lands in the legacy FIFO and replays on reattach.
			await disconnectLegacy();
			await sleep(300);
			sendCommand(terminalId, "ticks 10");
			await waitForTrackerText(terminalId, "INPUT 000010");
			await connectLegacy();
			await waitFor(
				async () => {
					await writeChain;
					return visibleText(term).includes("INPUT 000010");
				},
				15_000,
				"legacy FIFO replay to arrive",
			);
			assert.equal(
				sawSynced,
				false,
				"legacy clients must never receive seq-protocol messages",
			);
		} finally {
			await disconnectLegacy().catch(() => {});
			term.dispose();
			await disposeSessionAndWait(terminalId, db).catch(() => {});
		}
	},
);

test(
	"attach-time focus state reaches the PTY only when the program enabled mode 1004",
	{ timeout: 90_000 },
	async () => {
		const run = async (mode: "on" | "off") => {
			const terminalId = `seq-focus-${mode}-${randomUUID().slice(0, 8)}`;
			const session = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
				cols: COLS,
				rows: ROWS,
				initialCommand: `exec bash '${path.join(TEST_HOME, "focus.sh")}' ${mode}`,
			});
			if ("error" in session) assert.fail(session.error);
			const renderer = new SeqRenderer();
			try {
				await renderer.connect(terminalId);
				await renderer.waitVisible("READY-FOCUS");
				// The transport sends the client focus state on every attach;
				// the host must forward it iff the program asked for it.
				renderer.sendFocus(true);
				renderer.sendInput("ping\n");
				if (mode === "on") {
					await renderer.waitVisible("EVT 001 SAW-FOCUS-IN");
					// An unfocused duplicate pane must not clobber the focused
					// pane's state: the program sees the aggregate (still
					// focused), never a bare focus-out.
					const second = new SeqRenderer();
					try {
						await second.connect(terminalId, { autoResize: false });
						await second.waitSynced();
						second.sendFocus(false);
						// Separate sockets: give the focus write time to land in the
						// PTY input queue before the probe line flushes it.
						await sleep(400);
						renderer.sendInput("ping\n");
						await renderer.waitVisible("EVT 002");
						await renderer.drain();
						assert.ok(
							visibleText(renderer.term).includes("EVT 002 SAW-FOCUS-IN"),
							"an unfocused duplicate pane must not report focus-out while the focused pane is attached",
						);
						// Once the focused pane blurs too, focus-out flows.
						renderer.sendFocus(false);
						await sleep(400);
						renderer.sendInput("ping\n");
						await renderer.waitVisible("EVT 003 SAW-FOCUS-OUT");
					} finally {
						await second.disconnect().catch(() => {});
						second.dispose();
					}
				} else {
					await renderer.waitVisible("EVT 001 LINE-OK");
					await renderer.drain();
					assert.ok(
						!visibleText(renderer.term).includes("SAW-FOCUS-IN"),
						"focus escapes must not reach a program that never enabled mode 1004",
					);
				}
			} finally {
				await renderer.disconnect().catch(() => {});
				renderer.dispose();
				await disposeSessionAndWait(terminalId, db).catch(() => {});
			}
		};
		await run("on");
		await run("off");
	},
);

test(
	"the PTY runs at the smallest visible client, not whoever resized last",
	{ timeout: 90_000 },
	async () => {
		const terminalId = `seq-dims-${randomUUID().slice(0, 8)}`;
		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			cols: COLS,
			rows: ROWS,
			initialCommand: `exec bash '${path.join(TEST_HOME, "size.sh")}'`,
		});
		if ("error" in session) assert.fail(session.error);

		// A desktop pane and a phone on the same session. Neither sends
		// `visible` until asked to, which is also the back-compat case: a client
		// that never speaks the message has to keep constraining the size.
		const desktop = new SeqRenderer({ cols: 120, rows: 30 });
		const phone = new SeqRenderer({ cols: 45, rows: 20 });
		let probes = 0;
		const probeSize = async (): Promise<string> => {
			probes += 1;
			const marker = `SIZE ${String(probes).padStart(3, "0")} `;
			desktop.sendInput("size\n");
			await desktop.waitVisible(marker);
			await desktop.drain();
			const line = visibleText(desktop.term)
				.split("\n")
				.find((text) => text.includes(marker));
			assert.ok(line, `no size report for probe ${probes}`);
			return line.slice(line.indexOf(marker) + marker.length).trim();
		};

		try {
			await desktop.connect(terminalId);
			await desktop.waitVisible("READY-SIZE");
			assert.equal(
				await probeSize(),
				"30x120",
				"the only attached client owns the size",
			);

			// The phone attaching used to stomp the PTY for the desktop too, and
			// the desktop's next resize stomped it back — the ping-pong behind
			// the smushed mobile terminal. Now the phone sets the floor.
			await phone.connect(terminalId);
			await phone.waitSynced();
			assert.equal(
				await probeSize(),
				"20x45",
				"the smallest visible client sets the size",
			);

			// Backgrounding is not detaching: the socket stays, the constraint
			// goes. This is what stops a phone in a pocket holding every desktop
			// pane at phone width.
			phone.sendVisible(false);
			// Separate sockets have no ordering between them; let the visibility
			// write land before the probe rides the desktop's socket.
			await sleep(400);
			assert.equal(
				await probeSize(),
				"30x120",
				"a hidden client must not constrain the size",
			);

			phone.sendVisible(true);
			await sleep(400);
			assert.equal(
				await probeSize(),
				"20x45",
				"coming back on screen re-imposes the constraint",
			);

			// Closing the phone hands the desktop its width back with nobody
			// touching a pane.
			await phone.disconnect();
			await sleep(400);
			assert.equal(
				await probeSize(),
				"30x120",
				"a departing client releases its size constraint",
			);
		} finally {
			await phone.disconnect().catch(() => {});
			phone.dispose();
			await desktop.disconnect().catch(() => {});
			desktop.dispose();
			await disposeSessionAndWait(terminalId, db).catch(() => {});
		}
	},
);
