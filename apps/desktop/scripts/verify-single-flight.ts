/**
 * Two-instance single-flight verification for host-service-coordinator.
 *
 * Drives the REAL HostServiceCoordinator (real spawn lock, manifest, health
 * check, process-liveness code) in two separate OS processes racing to start
 * the same org against an ISOLATED temp $SUPERSET_HOME_DIR. Only Electron and
 * a couple of leaf deps are mocked; `spawn` is overridden to launch a countable
 * stand-in child + a real localhost health server + write the real manifest,
 * standing in for the (unbuilt) host-service bundle.
 *
 * Expectation: exactly one process spawns; the other adopts it over HTTP.
 *
 * Usage: bun run apps/desktop/scripts/verify-single-flight.ts
 * (spawns itself with --worker for the two instances)
 */
import { spawn as spawnProc } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import { createServer } from "node:http";
import * as os from "node:os";
import path from "node:path";

const ORG = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

async function waitForFile(p: string, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (fs.existsSync(p)) return true;
		await new Promise((r) => setTimeout(r, 50));
	}
	return false;
}

// ── Worker: one simulated app instance ─────────────────────────────────
async function runWorker(home: string, marker: string, label: string) {
	process.env.SUPERSET_HOME_DIR = home;

	const { mock } = await import("bun:test");
	mock.module("electron", () => ({
		app: {
			isPackaged: false,
			getVersion: () => "0.0.0",
			getAppPath: () => "/tmp/app",
		},
		dialog: { showErrorBox: () => {} },
	}));
	mock.module("electron-log/main", () => ({
		default: {
			info: (...a: unknown[]) => console.log(`[${label}]`, ...a),
			warn: (...a: unknown[]) => console.log(`[${label}]`, ...a),
			error: (...a: unknown[]) => console.log(`[${label}]`, ...a),
		},
	}));
	const realHostInfo = await import("@superset/shared/host-info");
	mock.module("@superset/shared/host-info", () => ({
		...realHostInfo,
		getHostId: () => `host-${label}`,
		getHostName: () => `host-${label}`,
	}));
	// Real ./local-db loads better-sqlite3 (native, unsupported in Bun); stub it.
	mock.module(
		path.resolve(import.meta.dir, "../src/main/lib/local-db"),
		() => ({
			localDb: { select: () => ({ from: () => ({ get: () => null }) }) },
		}),
	);

	const { HostServiceCoordinator } = await import(
		"../src/main/lib/host-service-coordinator"
	);
	const { writeManifest } = await import(
		"../src/main/lib/host-service-manifest"
	);
	const { findFreePort } = await import("../src/main/lib/host-service-utils");

	const coordinator = new HostServiceCoordinator();
	let didSpawn = false;
	let childPid: number | null = null;
	let healthServer: ReturnType<typeof createServer> | null = null;

	// Stand in for the real host-service bundle: pick a port, serve health,
	// launch a countable child, write the manifest exactly as the child would.
	(
		coordinator as unknown as {
			spawn: (
				org: string,
				_cfg: unknown,
				pref: Iterable<number>,
			) => Promise<unknown>;
		}
	).spawn = async (org: string, _cfg: unknown, pref: Iterable<number>) => {
		const port = await findFreePort(pref);
		const secret = randomBytes(16).toString("hex");

		healthServer = createServer((req, res) => {
			const ok = req.headers.authorization === `Bearer ${secret}`;
			res.writeHead(
				ok && req.url?.startsWith("/trpc/health.check") ? 200 : 401,
			);
			res.end(ok ? '{"result":{"data":true}}' : "");
		});
		await new Promise<void>((resolve) =>
			healthServer?.listen(port, "127.0.0.1", resolve),
		);

		// Long-lived stand-in for the host-service child; marker in argv so it's
		// countable via `pgrep -f` and killable in teardown.
		const child = spawnProc("bash", ["-c", `exec -a "${marker}" sleep 300`], {
			stdio: "ignore",
			detached: false,
		});
		child.unref();
		childPid = child.pid ?? null;
		didSpawn = true;

		writeManifest({
			pid: childPid ?? process.pid,
			endpoint: `http://127.0.0.1:${port}`,
			authToken: secret,
			startedAt: Date.now(),
			organizationId: org,
		});

		(
			coordinator as unknown as {
				instances: Map<string, unknown>;
			}
		).instances.set(org, {
			pid: childPid ?? process.pid,
			port,
			secret,
			status: "running",
			owned: true,
		});
		console.log(`[${label}] SPAWNED port=${port} childPid=${childPid}`);
		return { port, secret, machineId: `host-${label}` };
	};

	// Signal readiness, then race on the shared GO barrier.
	fs.writeFileSync(path.join(home, `ready-${label}`), "1");
	await waitForFile(path.join(home, "GO"), 10_000);

	const conn = await coordinator.start(ORG, {
		authToken: "t",
		cloudApiUrl: "https://example.invalid",
	});
	const entry = (
		coordinator as unknown as {
			instances: Map<string, { owned: boolean }>;
		}
	).instances.get(ORG);

	fs.writeFileSync(
		path.join(home, `result-${label}.json`),
		JSON.stringify({
			label,
			spawned: didSpawn,
			owned: entry?.owned ?? null,
			port: conn.port,
			secret: conn.secret,
			childPid,
		}),
	);

	// Winner keeps its health server alive so the loser can adopt; both hold
	// until told to stop, then tear down (owner SIGTERMs its child + de-manifests).
	await waitForFile(path.join(home, "STOP"), 60_000);
	coordinator.stopAll();
	healthServer?.close();
	process.exit(0);
}

// ── Orchestrator ───────────────────────────────────────────────────────
async function main() {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "hs-sf-verify-"));
	const marker = `HS_SF_STANDIN_${randomBytes(4).toString("hex")}`;
	fs.mkdirSync(path.join(home, "host", ORG), { recursive: true });
	console.log(`isolated SUPERSET_HOME_DIR=${home}`);
	console.log(`stand-in child marker=${marker}\n`);

	const self = path.resolve(import.meta.dir, "verify-single-flight.ts");
	const workers = ["A", "B"].map((label) =>
		spawnProc("bun", ["run", self, "--worker", home, marker, label], {
			stdio: "inherit",
		}),
	);

	const ready =
		(await waitForFile(path.join(home, "ready-A"), 15_000)) &&
		(await waitForFile(path.join(home, "ready-B"), 15_000));
	if (!ready) throw new Error("workers did not become ready");

	// Fire both at once → real cross-process race for the lock.
	fs.writeFileSync(path.join(home, "GO"), "1");

	const gotResults =
		(await waitForFile(path.join(home, "result-A.json"), 60_000)) &&
		(await waitForFile(path.join(home, "result-B.json"), 60_000));

	let pass = false;
	try {
		if (!gotResults) throw new Error("did not get both results in time");
		const a = JSON.parse(
			fs.readFileSync(path.join(home, "result-A.json"), "utf8"),
		);
		const b = JSON.parse(
			fs.readFileSync(path.join(home, "result-B.json"), "utf8"),
		);

		const spawners = [a, b].filter((r) => r.spawned);
		const adopters = [a, b].filter((r) => !r.spawned);
		// Count host-service children that actually exist = live recorded child
		// pids across both instances (adopter records none).
		const childPids = [a.childPid, b.childPid].filter(
			(p): p is number => typeof p === "number",
		);
		const standins = childPids.filter((pid) => {
			try {
				process.kill(pid, 0);
				return true;
			} catch {
				return false;
			}
		}).length;

		console.log("\n──────── RESULT ────────");
		console.log("A:", JSON.stringify(a));
		console.log("B:", JSON.stringify(b));
		console.log(`\nspawned count: ${spawners.length} (expect 1)`);
		console.log(`adopted count: ${adopters.length} (expect 1)`);
		console.log(`live stand-in host children: ${standins} (expect 1)`);

		const samePort = a.port === b.port;
		const sameSecret = a.secret === b.secret;
		const adopterOwnedFalse = adopters.every((r) => r.owned === false);
		console.log(
			`adopter connected to spawner's port+secret: ${samePort && sameSecret}`,
		);
		console.log(`adopter entry marked owned=false: ${adopterOwnedFalse}`);

		pass =
			spawners.length === 1 &&
			adopters.length === 1 &&
			standins === 1 &&
			samePort &&
			sameSecret &&
			adopterOwnedFalse;
		console.log(`\n${pass ? "✅ PASS" : "❌ FAIL"} single-flight verified`);
	} finally {
		// Teardown: release workers, kill stand-ins, remove temp home.
		fs.writeFileSync(path.join(home, "STOP"), "1");
		await new Promise((r) => setTimeout(r, 1_000));
		for (const w of workers) {
			try {
				w.kill("SIGTERM");
			} catch {}
		}
		spawnProc("bash", ["-c", `pkill -f "${marker}" || true`]);
		await new Promise((r) => setTimeout(r, 300));
		fs.rmSync(home, { recursive: true, force: true });
		console.log(`\ncleaned up temp home: ${home}`);
	}

	process.exit(pass ? 0 : 1);
}

const args = process.argv.slice(2);
if (args[0] === "--worker") {
	void runWorker(args[1], args[2], args[3]);
} else {
	void main();
}
