import { afterAll, beforeAll, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Issue #7223: a host started without RELAY_URL (what the desktop does when
 * Remote Access is off) must still register itself with the cloud, or it is
 * invisible to `hosts list` and automations while every local check passes.
 *
 * Black-box on purpose: it boots the real `serve.ts` entry the way the
 * desktop coordinator's child env does, against a fake cloud that records
 * `host.ensure` calls. Runs under Electron-as-Node because better-sqlite3 is
 * compiled against the Electron ABI (same reason as scripts/test-e2e.ts).
 */

const repoRoot = path.resolve(import.meta.dir, "../../../..");
const hostServiceRoot = path.resolve(import.meta.dir, "../..");
const desktopRequire = createRequire(
	path.join(repoRoot, "apps/desktop/package.json"),
);
const electronBin = desktopRequire("electron") as string;
// tsx's main export is its ESM loader (dist/loader.mjs).
const tsxLoader = desktopRequire.resolve("tsx");

const ORG_ID = "11111111-2222-4333-8444-555555555555";
const HOST_SECRET = "test-host-secret";

type EnsureCall = { organizationId: string; machineId: string; name: string };
const ensureCalls: EnsureCall[] = [];

function trpcOk(json: unknown) {
	return { result: { data: { json } } };
}

function handleProcedure(procedure: string, input: unknown): unknown {
	switch (procedure) {
		case "host.ensure": {
			const host = input as EnsureCall;
			ensureCalls.push(host);
			return trpcOk({ ...host, createdByUserId: "user-1", wakeCommand: null });
		}
		case "host.relayEndpoint":
			return trpcOk({ url: "wss://relay.invalid" });
		default:
			return {
				error: {
					json: {
						message: `fake cloud: unhandled ${procedure}`,
						code: -32004,
						data: { code: "NOT_FOUND", httpStatus: 404 },
					},
				},
			};
	}
}

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			server.close(() => resolve(port));
		});
	});
}

async function waitFor(
	predicate: () => Promise<boolean> | boolean,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await predicate()) return true;
		await Bun.sleep(250);
	}
	return false;
}

let cloud: ReturnType<typeof Bun.serve>;
let child: ChildProcess | null = null;
let tempHome = "";
let hostPort = 0;
let childOutput = "";

async function healthCheck(): Promise<{
	status: string;
	cloudRegistered: boolean;
	registrationError: string | null;
} | null> {
	try {
		const res = await fetch(`http://127.0.0.1:${hostPort}/trpc/health.check`, {
			headers: { Authorization: `Bearer ${HOST_SECRET}` },
		});
		if (!res.ok) return null;
		const body = (await res.json()) as {
			result?: { data?: { json?: never } };
		};
		return body.result?.data?.json ?? null;
	} catch {
		return null;
	}
}

beforeAll(async () => {
	cloud = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		async fetch(req) {
			const url = new URL(req.url);
			if (!url.pathname.startsWith("/api/trpc/")) {
				return new Response("not found", { status: 404 });
			}
			const procedures = url.pathname.slice("/api/trpc/".length).split(",");
			const rawInputs =
				req.method === "GET"
					? (url.searchParams.get("input") ?? "{}")
					: (await req.text()) || "{}";
			const inputs = JSON.parse(rawInputs) as Record<
				string,
				{ json?: unknown }
			>;
			return Response.json(
				procedures.map((procedure, index) =>
					handleProcedure(procedure, inputs[String(index)]?.json),
				),
			);
		},
	});

	// HOME is redirected too: serve.ts provisions agent hooks into the
	// user's real agent config dirs, which a test must never touch.
	tempHome = mkdtempSync(path.join(tmpdir(), "hs-registration-"));
	const supersetHome = path.join(tempHome, ".superset");
	const orgDir = path.join(supersetHome, "host", ORG_ID);
	hostPort = await freePort();

	// Mirrors apps/desktop/src/main/lib/host-service-coordinator.ts buildEnv
	// with exposeHostServiceViaRelay=false: every var the child reads, and
	// RELAY_URL deleted.
	const env: Record<string, string> = {
		...(process.env as Record<string, string>),
		HOME: tempHome,
		NODE_ENV: "development",
		ELECTRON_RUN_AS_NODE: "1",
		ORGANIZATION_ID: ORG_ID,
		HOST_SERVICE_SECRET: HOST_SECRET,
		HOST_SERVICE_PORT: String(hostPort),
		PORT: String(hostPort),
		HOST_MANIFEST_DIR: orgDir,
		HOST_DB_PATH: path.join(orgDir, "host.db"),
		HOST_MIGRATIONS_FOLDER: path.join(hostServiceRoot, "drizzle"),
		SUPERSET_HOME_DIR: supersetHome,
		// JWT-shaped so JwtApiAuthProvider passes it through untouched.
		AUTH_TOKEN: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2ln",
		SUPERSET_API_URL: `http://127.0.0.1:${cloud.port}`,
		HOST_PARENT_PID: String(process.pid),
	};
	delete env.RELAY_URL;
	delete env.SUPERSET_AUTH_CONFIG_PATH;

	child = spawn(
		electronBin,
		["--import", tsxLoader, path.join(hostServiceRoot, "src/serve.ts")],
		{ cwd: hostServiceRoot, env, stdio: ["ignore", "pipe", "pipe"] },
	);
	child.stdout?.on("data", (chunk) => {
		childOutput += String(chunk);
	});
	child.stderr?.on("data", (chunk) => {
		childOutput += String(chunk);
	});

	const listening = await waitFor(
		async () => (await healthCheck()) !== null,
		30_000,
	);
	if (!listening) {
		throw new Error(
			`host-service never answered health.check:\n${childOutput}`,
		);
	}
});

afterAll(async () => {
	if (child && child.exitCode === null) {
		const exited = new Promise<void>((resolve) =>
			child?.once("exit", () => resolve()),
		);
		child.kill("SIGTERM");
		await Promise.race([exited, Bun.sleep(5_000)]);
		if (child.exitCode === null) child.kill("SIGKILL");
	}
	cloud?.stop(true);
	if (tempHome) rmSync(tempHome, { recursive: true, force: true });
});

test(
	"registers with the cloud when started without RELAY_URL (Remote Access off)",
	async () => {
		const registered = await waitFor(() => ensureCalls.length > 0, 10_000);
		expect(
			registered,
			`host.ensure was never called. host-service output:\n${childOutput}`,
		).toBe(true);
		expect(ensureCalls[0]?.organizationId).toBe(ORG_ID);

		await waitFor(
			async () => (await healthCheck())?.cloudRegistered === true,
			5_000,
		);
		expect(await healthCheck()).toMatchObject({
			status: "ok",
			cloudRegistered: true,
			registrationError: null,
		});
		expect(childOutput).toContain("[host-service] registered as host");
	},
	{ timeout: 60_000 },
);
