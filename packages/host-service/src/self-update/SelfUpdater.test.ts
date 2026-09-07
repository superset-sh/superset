import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	parseUpdateOutput,
	SelfUpdateError,
	SelfUpdater,
	type SelfUpdaterDeps,
	updateMarkerPath,
} from "./SelfUpdater";

const scratch: string[] = [];
afterEach(() => {
	for (const dir of scratch.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

interface Harness {
	updater: SelfUpdater;
	root: string;
	stateDir: string;
	calls: string[];
	exitCode: number | null;
	spawned: string[];
	killed: number;
	deps: SelfUpdaterDeps;
}

function harness(overrides: Partial<SelfUpdaterDeps> = {}): Harness {
	const dir = mkdtempSync(join(tmpdir(), "self-update-"));
	scratch.push(dir);
	const root = join(dir, "superset");
	mkdirSync(join(root, "bin"), { recursive: true });
	mkdirSync(join(root, "lib"), { recursive: true });
	writeFileSync(join(root, "bin", "superset"), "");
	writeFileSync(join(root, "bin", "superset-host"), "");
	writeFileSync(join(root, "lib", "version"), "old");
	const stateDir = join(dir, "state");
	mkdirSync(stateDir);
	writeFileSync(
		join(stateDir, "manifest.json"),
		JSON.stringify({
			pid: 111,
			endpoint: "http://127.0.0.1:1",
			authToken: "s",
			startedAt: 1,
			organizationId: "o",
		}),
	);
	const h = {
		calls: [] as string[],
		exitCode: null as number | null,
		spawned: [] as string[],
		killed: 0,
	};
	const deps: SelfUpdaterDeps = {
		installSource: "cli",
		currentVersion: "1.22.0",
		execPath: join(root, "lib", "node"),
		port: 4879,
		secret: "s",
		stateDir,
		runCliUpdate: async (_bin, args) => {
			h.calls.push(`cli ${args.join(" ")}`);
			// Simulate what `superset update --keep-backup` leaves behind.
			mkdirSync(join(`${root}.bak`, "lib"), { recursive: true });
			writeFileSync(join(`${root}.bak`, "lib", "version"), "old");
			writeFileSync(join(root, "lib", "version"), "new");
			return {
				ok: true,
				stdout: JSON.stringify({
					current: "1.22.0",
					target: "1.27.0",
					updated: true,
				}),
				stderr: "",
			};
		},
		spawnHost: (bin) => {
			h.spawned.push(bin);
			h.calls.push("spawn");
			return { pid: 222, kill: () => void h.killed++ };
		},
		pollHealth: async () => {
			h.calls.push("poll");
			return { version: "1.27.0" };
		},
		stopServing: async () => {
			h.calls.push("stop");
		},
		exit: (code) => {
			h.calls.push(`exit ${code}`);
			h.exitCode = code;
		},
		log: () => {},
		...overrides,
	};
	return Object.assign(h, {
		updater: new SelfUpdater(deps),
		root,
		stateDir,
		deps,
	});
}

async function settle(h: Harness): Promise<void> {
	for (
		let i = 0;
		i < 50 && h.exitCode === null && h.updater.status().phase !== "failed";
		i++
	) {
		await new Promise((r) => setTimeout(r, 5));
	}
}

describe("SelfUpdater", () => {
	test("refuses when not a standalone CLI install", () => {
		const h = harness({ installSource: "desktop" });
		expect(h.updater.status().updatable).toBe(false);
		expect(() => h.updater.start({})).toThrow(SelfUpdateError);
		try {
			h.updater.start({});
		} catch (error) {
			expect((error as SelfUpdateError).reason).toBe("not-updatable");
		}
	});

	test("refuses when the cli install root has no binaries", () => {
		const h = harness({ execPath: "/nowhere/lib/node" });
		expect(h.updater.status().updatable).toBe(false);
		expect(() => h.updater.start({})).toThrow(/No standalone install/);
	});

	test("downloads, stops serving, restarts, verifies, cleans up, exits", async () => {
		const h = harness();
		const first = h.updater.start({ version: "1.27.0" });
		expect(first.phase).toBe("downloading");
		expect(first.target).toBe("1.27.0");
		await settle(h);
		expect(h.calls).toEqual([
			"cli update --json --keep-backup --version 1.27.0",
			"stop",
			"spawn",
			"poll",
			"exit 0",
		]);
		expect(h.spawned[0]).toBe(join(h.root, "bin", "superset-host"));
		expect(existsSync(`${h.root}.bak`)).toBe(false);
		const marker = JSON.parse(
			readFileSync(updateMarkerPath(h.stateDir), "utf8"),
		);
		expect(marker).toMatchObject({
			outcome: "updated",
			from: "1.22.0",
			to: "1.27.0",
		});
		const manifest = JSON.parse(
			readFileSync(join(h.stateDir, "manifest.json"), "utf8"),
		);
		expect(manifest.pid).toBe(222);
		expect(manifest.authToken).toBe("s");
	});

	test("force is passed through to the CLI", async () => {
		const h = harness();
		h.updater.start({ version: "1.27.0", force: true });
		await settle(h);
		expect(h.calls[0]).toBe(
			"cli update --json --keep-backup --version 1.27.0 --force",
		);
	});

	test("a second start while one runs returns the running status", () => {
		const h = harness({ runCliUpdate: () => new Promise(() => {}) });
		h.updater.start({ version: "1.27.0" });
		const again = h.updater.start({ version: "1.28.0" });
		expect(again.phase).toBe("downloading");
		expect(again.target).toBe("1.27.0");
	});

	test("a failed download fails without restarting", async () => {
		const h = harness({
			runCliUpdate: async () => ({
				ok: false,
				stdout: "",
				stderr: "Download failed: 404",
			}),
		});
		h.updater.start({ version: "9.9.9" });
		await settle(h);
		const status = h.updater.status();
		expect(status.phase).toBe("failed");
		expect(status.error).toContain("404");
		expect(h.calls).toEqual([]);
		expect(h.exitCode).toBeNull();
	});

	test("restarts a stale host when the CLI has already updated the on-disk build", async () => {
		const h = harness({
			runCliUpdate: async () => ({
				ok: true,
				stdout: JSON.stringify({
					current: "1.27.0",
					target: "1.27.0",
					updated: false,
				}),
				stderr: "",
			}),
		});
		h.updater.start({ version: "1.27.0" });
		await settle(h);
		expect(h.spawned).toHaveLength(1);
		expect(h.exitCode).toBe(0);
	});

	test("rolls back to the backup when the successor never answers", async () => {
		let polls = 0;
		const h = harness({
			pollHealth: async () => {
				polls++;
				return polls === 1 ? null : { version: "1.22.0" };
			},
		});
		h.updater.start({ version: "1.27.0" });
		await settle(h);
		expect(h.killed).toBe(1);
		expect(h.spawned).toHaveLength(2);
		expect(readFileSync(join(h.root, "lib", "version"), "utf8")).toBe("old");
		expect(existsSync(`${h.root}.bak`)).toBe(false);
		expect(existsSync(`${h.root}.failed`)).toBe(false);
		const marker = JSON.parse(
			readFileSync(updateMarkerPath(h.stateDir), "utf8"),
		);
		expect(marker).toMatchObject({
			outcome: "rolled-back",
			from: "1.22.0",
			to: "1.27.0",
		});
		expect(marker.error).toMatch(/did not answer/);
		expect(h.exitCode).toBe(0);
		const manifest = JSON.parse(
			readFileSync(join(h.stateDir, "manifest.json"), "utf8"),
		);
		expect(manifest.pid).toBe(222);
	});

	test("exits non-zero when the rollback does not come up either", async () => {
		const h = harness({ pollHealth: async () => null });
		h.updater.start({ version: "1.27.0" });
		await settle(h);
		expect(h.exitCode).toBe(1);
		expect(
			JSON.parse(readFileSync(updateMarkerPath(h.stateDir), "utf8")).outcome,
		).toBe("rolled-back");
	});

	test("rolls back when a healthy successor reports the wrong version", async () => {
		let polls = 0;
		const h = harness({
			pollHealth: async () => ({
				version: ++polls === 1 ? "1.26.0" : "1.22.0",
			}),
		});
		h.updater.start({ version: "1.27.0" });
		await settle(h);
		expect(h.killed).toBe(1);
		expect(readFileSync(join(h.root, "lib", "version"), "utf8")).toBe("old");
		expect(h.updater.status().lastResult).toMatchObject({
			outcome: "rolled-back",
		});
		expect(h.updater.status().lastResult?.error).toContain("expected 1.27.0");
	});

	test("releases the install lock after a failed download", async () => {
		const h = harness({
			runCliUpdate: async () => ({ ok: false, stdout: "", stderr: "offline" }),
		});
		h.updater.start({ version: "1.27.0" });
		await settle(h);
		expect(existsSync(`${h.root}.update-lock`)).toBe(false);
	});

	test("a second host sharing the install cannot replace its backup during an update", () => {
		const h = harness({ runCliUpdate: () => new Promise(() => {}) });
		h.updater.start({ version: "1.27.0" });
		const peer = new SelfUpdater(h.deps);
		expect(() => peer.start({ version: "1.28.0" })).toThrow(
			"Install update locked",
		);
	});

	test("rolls back after a synchronous spawn failure", async () => {
		let spawns = 0;
		const h = harness({
			spawnHost: () => {
				if (++spawns === 1) throw new Error("missing executable");
				return { pid: 333, kill() {} };
			},
			pollHealth: async () => ({ version: "1.22.0" }),
		});
		h.updater.start({ version: "1.27.0" });
		await settle(h);
		expect(h.updater.status().lastResult?.outcome).toBe("rolled-back");
		expect(h.exitCode).toBe(0);
	});

	test("does not restart a process that is already on target", async () => {
		const h = harness({
			currentVersion: "1.27.0",
			runCliUpdate: async () => ({
				ok: true,
				stdout: '{"target":"1.27.0","updated":false}',
				stderr: "",
			}),
		});
		h.updater.start({ version: "1.27.0" });
		await settle(h);
		expect(h.updater.status().phase).toBe("idle");
		expect(h.spawned).toHaveLength(0);
		expect(existsSync(`${h.root}.update-lock`)).toBe(false);
	});

	test("status surfaces the marker left by the previous process", () => {
		const h = harness();
		writeFileSync(
			updateMarkerPath(h.stateDir),
			JSON.stringify({
				outcome: "updated",
				from: "1.22.0",
				to: "1.27.0",
				at: 5,
			}),
		);
		expect(h.updater.status().lastResult).toMatchObject({
			outcome: "updated",
			to: "1.27.0",
		});
	});
});

describe("parseUpdateOutput", () => {
	test("reads the data object with or without a wrapper, ignoring log noise", () => {
		expect(
			parseUpdateOutput('{"current":"1","target":"2","updated":true}'),
		).toEqual({ updated: true, target: "2" });
		expect(
			parseUpdateOutput('noise\n{"data":{"target":"2","updated":false}}'),
		).toEqual({ updated: false, target: "2" });
		expect(parseUpdateOutput("nothing")).toBeNull();
		expect(parseUpdateOutput('{"message":"x"}')).toBeNull();
	});
});
