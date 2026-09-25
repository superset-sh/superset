import { createServer, type Socket } from "node:net";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { spawn } from "node-pty";
import type { HostDb } from "../../src/db/index.ts";
import { GitWatcher } from "../../src/events/git-watcher.ts";
import { WorkspaceFilesystemManager } from "../../src/runtime/filesystem/filesystem.ts";
import { getHostWorkerPool } from "../../src/workers/host-worker-pool.ts";

const roots: string[] = JSON.parse(process.env.BENCH_ROOTS ?? "[]");
const rows = roots.map((worktreePath, index) => ({
	id: String(index),
	worktreePath,
}));
let selected = rows[0];
const query = {
	from: () => query,
	where: () => query,
	get: () => selected,
	all: () => rows,
};
const db = {
	select: () => query,
	query: { workspaces: { findFirst: () => ({ sync: () => selected }) } },
} as unknown as HostDb;
const filesystem = new WorkspaceFilesystemManager({ db });
filesystem.resolveWorkspaceRoot = (id) => roots[Number(id)] as string;
const gitWatcher = new GitWatcher(db, filesystem);
const sockets = new Set<Socket>();
const terminal = spawn(
	"/usr/bin/python3",
	[
		"-u",
		"-c",
		`
import os, select, time, tty
tty.setraw(0)
os.write(1, b"READY\\n")
while True:
    ready, _, _ = select.select([0], [], [], 0.01)
    if ready:
        data = os.read(0, 65536)
        if not data: break
        os.write(1, data)
    os.write(1, ("OUT " + str(time.time_ns() // 1000000) + "\\n").encode())
`,
	],
	{ name: "xterm", cols: 120, rows: 30 },
);
let booted = false;
terminal.onData((data) => {
	if (!booted && data.includes("READY")) {
		booted = true;
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address !== "string")
				process.send?.({ type: "ready", port: address.port });
		});
	}
	for (const socket of sockets) socket.write(data);
});
const server = createServer((socket) => {
	sockets.add(socket);
	socket.setNoDelay(true);
	socket.write("ATTACHED\n");
	socket.on("data", (data) => terminal.write(data.toString()));
	socket.on("close", () => sockets.delete(socket));
	socket.on("error", () => {
		sockets.delete(socket);
		socket.destroy();
	});
});
const lag = monitorEventLoopDelay({ resolution: 1 });
const disposers: Array<() => void> = [];
let initializationStarted = 0;
let allWatchersReadyMs: number | null = null;
let cancelledAt: number | null = null;
let cancelHandledDelayMs: number | null = null;
const watcherStates = (
	filesystem as unknown as {
		watcherManager: { watchers: Map<string, unknown> };
	}
).watcherManager.watchers;
const readinessPoll = setInterval(() => {
	if (
		initializationStarted &&
		allWatchersReadyMs === null &&
		watcherStates.size === roots.length
	)
		allWatchersReadyMs = performance.now() - initializationStarted;
}, 5);
process.on("message", async (message: { type: string; sentAt?: number }) => {
	if (message.type === "start") {
		lag.enable();
		initializationStarted = performance.now();
		for (const row of rows) {
			selected = row;
			gitWatcher.watchWorkspace(row.id);
			const iterator = filesystem
				.getServiceForWorkspace(row.id)
				.watchPath({ absolutePath: row.worktreePath })
				[Symbol.asyncIterator]();
			void iterator.next().catch(() => {});
			disposers.push(() => {
				void iterator.return?.();
				gitWatcher.unwatchWorkspace(row.id);
			});
		}
	}
	if (message.type === "cancel") {
		cancelledAt = Date.now();
		cancelHandledDelayMs = cancelledAt - (message.sentAt ?? cancelledAt);
		for (const dispose of disposers) dispose();
	}

	if (message.type === "stop") {
		lag.disable();
		clearInterval(readinessPoll);
		process.send?.({
			type: "metrics",
			eventLoopMaxMs: lag.max / 1e6,
			eventLoopP99Ms: lag.percentile(99) / 1e6,
			allWatchersReadyMs,
			liveWatchers: watcherStates.size,
			cancelledAt,
			cancelHandledDelayMs,
			elapsedMs: performance.now() - initializationStarted,
		});
		for (const dispose of disposers) dispose();
		gitWatcher.close();
		await filesystem.close();
		await getHostWorkerPool().dispose();
		terminal.kill();
		for (const socket of sockets) socket.destroy();
		server.close();
		process.disconnect?.();
		process.exit(0);
	}
});
