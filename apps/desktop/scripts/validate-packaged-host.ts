/**
 * Executes the packaged host-service exactly like HostServiceCoordinator,
 * proves its protected RPC authentication boundary, and guards against
 * collecting the bundled Claude SDK (or its optional CLI) as a second runtime
 * copy.
 */

import { randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	rmSync,
	statSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const STARTUP_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 3_000;

interface AsarNode {
	files?: Record<string, AsarNode>;
}

type PackagedHostProcess = Bun.Subprocess<"ignore", "pipe", "pipe">;

function fail(message: string): never {
	throw new Error(`[validate:packaged-host] ${message}`);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function readAsarTree(archivePath: string): AsarNode {
	const fd = openSync(archivePath, "r");
	try {
		const sizePickle = Buffer.alloc(8);
		if (readSync(fd, sizePickle, 0, sizePickle.length, 0) !== 8) {
			fail(`Unable to read ASAR size header: ${archivePath}`);
		}

		const headerSize = sizePickle.readUInt32LE(4);
		if (
			sizePickle.readUInt32LE(0) !== 4 ||
			headerSize < 8 ||
			headerSize > statSync(archivePath).size - 8
		) {
			fail(`Invalid ASAR size header: ${archivePath}`);
		}

		const headerPickle = Buffer.alloc(headerSize);
		if (readSync(fd, headerPickle, 0, headerSize, 8) !== headerSize) {
			fail(`Unable to read complete ASAR header: ${archivePath}`);
		}

		const jsonSize = headerPickle.readUInt32LE(4);
		if (
			jsonSize > headerPickle.readUInt32LE(0) - 4 ||
			jsonSize > headerSize - 8
		) {
			fail(`Invalid ASAR JSON header length: ${archivePath}`);
		}

		const parsed: unknown = JSON.parse(
			headerPickle.subarray(8, 8 + jsonSize).toString("utf8"),
		);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("files" in parsed) ||
			typeof parsed.files !== "object" ||
			parsed.files === null
		) {
			fail(`ASAR header has no file tree: ${archivePath}`);
		}
		return parsed as AsarNode;
	} finally {
		closeSync(fd);
	}
}

function isClaudeSdkPackagePath(path: string): boolean {
	const segments = path.split("/");
	for (let index = 0; index < segments.length - 1; index++) {
		if (segments[index] !== "@anthropic-ai") continue;
		const packageName = segments[index + 1];
		if (
			packageName === "claude-agent-sdk" ||
			packageName?.startsWith("claude-agent-sdk-")
		) {
			return true;
		}
	}
	return false;
}

function findClaudeSdkPaths(
	node: AsarNode,
	path = "",
	result: string[] = [],
): string[] {
	for (const [name, child] of Object.entries(node.files ?? {})) {
		const childPath = path ? `${path}/${name}` : name;
		if (isClaudeSdkPackagePath(childPath)) {
			result.push(childPath);
			continue;
		}
		findClaudeSdkPaths(child, childPath, result);
	}
	return result;
}

function assertClaudeSdkNotPackaged(resourcesDir: string): void {
	const archivePath = join(resourcesDir, "app.asar");
	if (!existsSync(archivePath)) fail(`Missing app.asar at ${archivePath}`);

	const forbiddenPaths = findClaudeSdkPaths(readAsarTree(archivePath));
	const unpackedAnthropicDir = join(
		resourcesDir,
		"app.asar.unpacked",
		"node_modules",
		"@anthropic-ai",
	);
	if (existsSync(unpackedAnthropicDir)) {
		for (const name of readdirSync(unpackedAnthropicDir)) {
			const path = `app.asar.unpacked/node_modules/@anthropic-ai/${name}`;
			if (isClaudeSdkPackagePath(path)) forbiddenPaths.push(path);
		}
	}

	if (forbiddenPaths.length > 0) {
		fail(
			[
				"Claude Agent SDK package or optional Claude executable was packaged.",
				"The SDK source must stay bundled in host-service.js and use the user's system Claude installation.",
				...forbiddenPaths,
			].join("\n"),
		);
	}
}

function findPackagedExecutable(appBundlePath: string): string {
	const executableDir = join(appBundlePath, "Contents", "MacOS");
	const candidates = readdirSync(executableDir)
		.map((entry) => join(executableDir, entry))
		.filter((entry) => statSync(entry).isFile());
	if (candidates.length !== 1 || !candidates[0]) {
		fail(
			`Expected one packaged executable in ${executableDir}; found ${candidates.length}`,
		);
	}
	return candidates[0];
}

async function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close((error) => {
				if (error) reject(error);
				else if (!address || typeof address === "string") {
					reject(new Error("Unable to allocate smoke port"));
				} else resolve(address.port);
			});
		});
	});
}

async function stopPid(pid: number): Promise<void> {
	if (!Number.isInteger(pid) || pid <= 1) return;
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		return;
	}

	const deadline = Date.now() + STOP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			process.kill(pid, 0);
		} catch {
			return;
		}
		await delay(50);
	}
	try {
		process.kill(pid, "SIGKILL");
	} catch {
		// Process exited between the liveness check and the signal.
	}
}

async function cleanupPtyDaemon(
	testHome: string,
	organizationId: string,
): Promise<void> {
	const manifestPath = join(
		testHome,
		"host",
		organizationId,
		"pty-daemon-manifest.json",
	);
	const deadline = Date.now() + STOP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (existsSync(manifestPath)) {
			try {
				const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
					pid?: unknown;
					socketPath?: unknown;
				};
				if (typeof manifest.pid === "number") await stopPid(manifest.pid);
				if (typeof manifest.socketPath === "string") {
					rmSync(manifest.socketPath, { force: true });
				}
				return;
			} catch {
				// The daemon may still be writing its manifest; retry briefly.
			}
		}
		await delay(50);
	}
}

async function stopChild(child: PackagedHostProcess): Promise<void> {
	if (child.exitCode !== null) return;
	child.kill("SIGTERM");
	const stopped = await Promise.race([
		child.exited.then(() => true),
		delay(STOP_TIMEOUT_MS).then(() => false),
	]);
	if (!stopped) {
		child.kill("SIGKILL");
		await child.exited;
	}
}

async function smokePackagedHost(appBundlePath: string): Promise<void> {
	const resourcesDir = join(appBundlePath, "Contents", "Resources");
	assertClaudeSdkNotPackaged(resourcesDir);

	const executable = findPackagedExecutable(appBundlePath);
	const hostScript = join(
		resourcesDir,
		"app.asar",
		"dist/main/host-service.js",
	);
	const migrations = join(resourcesDir, "resources", "host-migrations");
	if (!existsSync(migrations)) fail(`Missing host migrations at ${migrations}`);

	const testDir = await mkdtemp(join(tmpdir(), "superset-packaged-host-"));
	const testHome = join(testDir, "home");
	const organizationId = randomUUID();
	const secret = randomUUID();
	const port = await findFreePort();
	let child: PackagedHostProcess | null = null;
	let healthy = false;
	let logs = "";

	try {
		const childEnv: NodeJS.ProcessEnv = {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			NODE_ENV: "production",
			AUTH_TOKEN: "packaged-host-smoke-token",
			SUPERSET_API_URL: "http://127.0.0.1:9",
			HOST_DB_PATH: join(testDir, "host.db"),
			HOST_MIGRATIONS_FOLDER: migrations,
			HOST_SERVICE_SECRET: secret,
			HOST_SERVICE_PORT: String(port),
			ORGANIZATION_ID: organizationId,
			DESKTOP_VITE_PORT: String(port),
			SUPERSET_HOME_DIR: testHome,
			HOST_MANIFEST_DIR: join(testDir, "manifest"),
			HOST_PARENT_PID: String(process.pid),
		};
		delete childEnv.RELAY_URL;

		child = Bun.spawn([executable, hostScript], {
			env: childEnv,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = new Response(child.stdout).text();
		const stderr = new Response(child.stderr).text();

		const deadline = Date.now() + STARTUP_TIMEOUT_MS;
		while (Date.now() < deadline && child.exitCode === null) {
			try {
				const response = await fetch(
					`http://127.0.0.1:${port}/trpc/health.check`,
					{ headers: { Authorization: `Bearer ${secret}` } },
				);
				if (response.ok) {
					healthy = true;
					break;
				}
			} catch {
				// Child is still starting.
			}
			await delay(100);
		}

		if (healthy) {
			const protectedRpcUrl = `http://127.0.0.1:${port}/trpc/workspace.list`;
			const [missingAuth, wrongAuth, validAuth] = await Promise.all([
				fetch(protectedRpcUrl),
				fetch(protectedRpcUrl, {
					headers: { Authorization: "Bearer definitely-not-the-secret" },
				}),
				fetch(protectedRpcUrl, {
					headers: { Authorization: `Bearer ${secret}` },
				}),
			]);
			if (missingAuth.status !== 401 || wrongAuth.status !== 401) {
				fail(
					`Packaged protected RPC auth boundary failed (missing=${missingAuth.status}, wrong=${wrongAuth.status})`,
				);
			}
			if (!validAuth.ok) {
				fail(
					`Packaged protected RPC rejected its generated secret (${validAuth.status})`,
				);
			}
		}

		await stopChild(child);
		logs = `${await stdout}${await stderr}`.slice(-16_000);
	} finally {
		if (child) await stopChild(child);
		await cleanupPtyDaemon(testHome, organizationId);
		rmSync(testDir, { recursive: true, force: true });
	}

	if (!healthy) {
		fail(
			[
				`Packaged host-service did not become healthy within ${STARTUP_TIMEOUT_MS}ms.`,
				`Executable: ${executable}`,
				`Script: ${hostScript}`,
				"Child log tail:",
				logs || "(no output)",
			].join("\n"),
		);
	}

	console.log(
		`[validate:packaged-host] OK: ${basename(appBundlePath)} host-service reached health.check and enforced protected RPC authentication`,
	);
	console.log(
		"[validate:packaged-host] OK: no Claude Agent SDK package or optional Claude executable is packaged",
	);
}

const appBundleArgument = process.argv[2];
if (!appBundleArgument) {
	fail("Usage: bun run validate:packaged-host <path-to-Superset.app>");
}
if (process.platform !== "darwin" || !appBundleArgument.endsWith(".app")) {
	fail("This packaged child smoke currently requires a macOS .app bundle");
}

await smokePackagedHost(appBundleArgument);
