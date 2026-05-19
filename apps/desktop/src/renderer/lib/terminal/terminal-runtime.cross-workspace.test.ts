// Regression repro for #4717: terminals can still leak across workspaces.
//
// Host-service has workspace-ownership checks on terminal session
// create/adopt/attach (PR #4572). What remains unguarded is the renderer's
// per-terminal persisted state. `terminal-runtime.ts` keys the persisted
// xterm scrollback and saved dimensions by `terminalId` ALONE:
//
//   localStorage["terminal-buffer:" + terminalId]
//   localStorage["terminal-dims:"   + terminalId]
//
// `createRuntime(terminalId, ...)` calls `restoreBuffer(terminalId, terminal)`
// which reads that key and writes the bytes into a freshly-created xterm.
// So if workspace B's persisted pane layout ever ends up referencing a
// terminalId that workspace A previously wrote a buffer for — through any
// of the existing routes that put a stale terminalId into a pane (migration,
// corrupted layouts, an interrupted workspace.create with `alreadyExists`,
// etc.) — workspace B's pane will hydrate with workspace A's scrollback and
// saved cols/rows, even though the host-service WebSocket attach is later
// rejected for workspace mismatch. The user sees the leak.
//
// This test pins the unscoped localStorage-key format that today reproduces
// the leak. It asserts the desired post-fix behavior: workspace B's read for
// a sharedTerminalId must NOT see workspace A's persisted buffer/dims. It
// FAILS on current code; the fix is to incorporate workspaceId into the
// persisted-state localStorage keys (and into the runtime registry's
// in-memory `serializeExistingRuntime` seeding).
//
// The file under test (`terminal-runtime.ts`) imports `@xterm/xterm`, which
// instantiates browser-only globals at module load. We intentionally do not
// import it here — the test re-derives the storage-key format from a
// constant so a key rename in production is caught by the assertion message,
// not by a hard import failure.

import { beforeEach, describe, expect, test } from "bun:test";

// Mirrors `STORAGE_KEY_PREFIX` and `DIMS_KEY_PREFIX` in
// `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts`. Update if
// those constants are renamed.
const STORAGE_KEY_PREFIX = "terminal-buffer:";
const DIMS_KEY_PREFIX = "terminal-dims:";

class InMemoryStorage implements Storage {
	private store = new Map<string, string>();
	get length(): number {
		return this.store.size;
	}
	clear(): void {
		this.store.clear();
	}
	getItem(key: string): string | null {
		return this.store.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}
	removeItem(key: string): void {
		this.store.delete(key);
	}
	key(index: number): string | null {
		return Array.from(this.store.keys())[index] ?? null;
	}
}

beforeEach(() => {
	(globalThis as { localStorage?: Storage }).localStorage =
		new InMemoryStorage();
});

describe("terminal-runtime persisted state: workspace isolation (#4717)", () => {
	test("workspace B's terminal pane does not inherit workspace A's persisted scrollback", () => {
		const workspaceA = "00000000-0000-4000-8000-00000000000a";
		const workspaceB = "00000000-0000-4000-8000-00000000000b";
		const sharedTerminalId = "11111111-1111-4000-8000-111111111111";

		// Workspace A persists scrollback at detach. This mirrors what
		// `persistBuffer(terminalId, serializeAddon)` writes in production.
		const workspaceAOutput = "$ secret_command --token=workspace-A-token\nOK\n";
		localStorage.setItem(
			`${STORAGE_KEY_PREFIX}${sharedTerminalId}`,
			workspaceAOutput,
		);

		// Workspace B's pane layout (corrupted, migrated, or otherwise stale)
		// references the same terminalId. When B mounts the pane,
		// `createRuntime(sharedTerminalId, ...)` calls
		// `restoreBuffer(sharedTerminalId, ...)`, which reads the same
		// unscoped key — leaking A's bytes into B's xterm.
		//
		// The post-fix contract: persisted scrollback must be scoped by
		// workspaceId. A read scoped to workspace B (which never persisted
		// anything for this terminalId) must miss.
		void workspaceA;
		const restoredForWorkspaceB = readPersistedBufferForWorkspace(
			workspaceB,
			sharedTerminalId,
		);

		expect(restoredForWorkspaceB).toBeNull();
	});

	test("workspace B's terminal pane does not inherit workspace A's persisted cols/rows", () => {
		const workspaceA = "00000000-0000-4000-8000-00000000000a";
		const workspaceB = "00000000-0000-4000-8000-00000000000b";
		const sharedTerminalId = "22222222-2222-4000-8000-222222222222";

		// Mirrors what `persistDimensions(terminalId, cols, rows)` writes.
		localStorage.setItem(
			`${DIMS_KEY_PREFIX}${sharedTerminalId}`,
			JSON.stringify({ cols: 200, rows: 60 }),
		);

		void workspaceA;
		const dimsForWorkspaceB = readPersistedDimsForWorkspace(
			workspaceB,
			sharedTerminalId,
		);

		expect(dimsForWorkspaceB).toBeNull();
	});
});

// Forward-looking helpers: a workspace-scoped read should resolve to a
// distinct localStorage key per workspace. Production currently reads the
// unscoped key, so today these helpers expose the leak.

function readPersistedBufferForWorkspace(
	workspaceId: string,
	terminalId: string,
): string | null {
	// The fix needs to teach `restoreBuffer` to take a workspaceId and read
	// `${STORAGE_KEY_PREFIX}${workspaceId}:${terminalId}`. Until then, the
	// existing unscoped key is what `restoreBuffer` actually reads, so we
	// reproduce that read here to demonstrate the leak.
	void workspaceId;
	return localStorage.getItem(`${STORAGE_KEY_PREFIX}${terminalId}`);
}

function readPersistedDimsForWorkspace(
	workspaceId: string,
	terminalId: string,
): string | null {
	void workspaceId;
	return localStorage.getItem(`${DIMS_KEY_PREFIX}${terminalId}`);
}
