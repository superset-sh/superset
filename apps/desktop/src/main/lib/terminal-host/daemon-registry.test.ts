import { afterEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TerminalDaemonRegistry } from "./daemon-registry";

const tempDirs: string[] = [];

function createTestPaths(): { dir: string; registryPath: string } {
	const dir = mkdtempSync(join(tmpdir(), "terminal-daemon-registry-"));
	tempDirs.push(dir);
	return {
		dir,
		registryPath: join(dir, "terminal-daemons.json"),
	};
}

afterEach(() => {
	for (const dir of tempDirs.splice(0, tempDirs.length)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("TerminalDaemonRegistry", () => {
	it("writes registry atomically and can read entries back", () => {
		const { registryPath } = createTestPaths();
		const registry = new TerminalDaemonRegistry(registryPath);

		const socketPath = join(tmpdir(), `terminal-host.${Date.now()}.sock`);
		registry.upsert({
			generationId: "gen-a",
			socketPath,
			pid: process.pid,
			appVersion: "1.2.3",
			state: "preferred",
		});

		const entries = registry.read();
		expect(entries.length).toBe(1);
		expect(entries[0]?.generationId).toBe("gen-a");
		expect(entries[0]?.state).toBe("preferred");

		const fileContents = readFileSync(registryPath, "utf-8");
		const parsed = JSON.parse(fileContents) as {
			version: number;
			daemons: Array<{ generationId: string }>;
		};
		expect(parsed.version).toBe(1);
		expect(parsed.daemons[0]?.generationId).toBe("gen-a");
		expect(existsSync(`${registryPath}.tmp`)).toBe(false);
	});

	it("recovers from registry corruption by resetting and backing up the file", () => {
		const { dir, registryPath } = createTestPaths();
		const registry = new TerminalDaemonRegistry(registryPath);

		writeFileSync(registryPath, "{this is not valid json", "utf-8");

		const entries = registry.read();
		expect(entries).toEqual([]);

		const files = readdirSync(dir);
		expect(
			files.some((file) => file.startsWith("terminal-daemons.json.corrupt.")),
		).toBe(true);
	});

	it("cleans stale daemon entries and stale sockets for dead processes", () => {
		const { dir, registryPath } = createTestPaths();
		const registry = new TerminalDaemonRegistry(registryPath);

		const staleSocket = join(dir, "terminal-host.dead.sock");
		mkdirSync(dir, { recursive: true });
		writeFileSync(staleSocket, "");

		registry.upsert({
			generationId: "dead-gen",
			socketPath: staleSocket,
			pid: 999_999_999,
			appVersion: "1.0.0",
			state: "draining",
		});
		registry.upsert({
			generationId: "live-gen",
			socketPath: join(dir, "terminal-host.live.sock"),
			pid: process.pid,
			appVersion: "1.0.0",
			state: "preferred",
		});

		const result = registry.cleanupStaleDaemons();
		expect(result.removedGenerations).toContain("dead-gen");
		expect(result.removedSockets).toContain(staleSocket);
		expect(existsSync(staleSocket)).toBe(false);

		const remaining = registry.read();
		expect(remaining.map((entry) => entry.generationId)).toEqual(["live-gen"]);
	});

	it("does not mutate updatedAt when only marking liveness", () => {
		const { registryPath } = createTestPaths();
		const registry = new TerminalDaemonRegistry(registryPath);

		const fixedUpdatedAt = "2026-01-01T00:00:00.000Z";
		registry.write([
			{
				generationId: "gen-a",
				socketPath: join(tmpdir(), "terminal-host.gen-a.sock"),
				pid: process.pid,
				appVersion: "1.0.0",
				state: "draining",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: fixedUpdatedAt,
				lastSeenAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		registry.markLastSeen("gen-a");

		const updated = registry.get("gen-a");
		expect(updated).not.toBeNull();
		expect(updated?.updatedAt).toBe(fixedUpdatedAt);
		expect(updated?.lastSeenAt).not.toBe("2026-01-01T00:00:00.000Z");
	});
});
