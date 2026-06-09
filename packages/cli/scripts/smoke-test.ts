import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

type Target =
	| "darwin-arm64"
	| "darwin-x64"
	| "linux-x64"
	| "linux-arm64"
	| "win32-x64";

const VALID_TARGETS = new Set<Target>([
	"darwin-arm64",
	"darwin-x64",
	"linux-x64",
	"linux-arm64",
	"win32-x64",
]);

const [distArg, targetArg] = process.argv.slice(2);

if (!distArg || !targetArg || !VALID_TARGETS.has(targetArg as Target)) {
	console.error(
		"Usage: bun run scripts/smoke-test.ts <dist-dir> <darwin-arm64|darwin-x64|linux-x64|linux-arm64|win32-x64>",
	);
	process.exit(1);
}

const target = targetArg as Target;
const dist = resolve(distArg);
const isWindowsTarget = target.startsWith("win32-");
const nodeBinary = join(dist, "lib", isWindowsTarget ? "node.exe" : "node");
const cliBinary = join(
	dist,
	"bin",
	isWindowsTarget ? "superset.exe" : "superset",
);
const hostWrapper = join(
	dist,
	"bin",
	isWindowsTarget ? "superset-host.cmd" : "superset-host",
);

function assertFile(path: string): void {
	if (!existsSync(path) || !statSync(path).isFile()) {
		throw new Error(`[smoke] missing file: ${path}`);
	}
}

function formatCommand(command: string, args: string[]): string {
	return [basename(command), ...args].join(" ");
}

function run(
	command: string,
	args: string[],
	options: {
		cwd?: string;
		env?: NodeJS.ProcessEnv;
		timeoutMs?: number;
		shell?: boolean;
	} = {},
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
			shell: options.shell,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const timer =
			options.timeoutMs === undefined
				? null
				: setTimeout(() => {
						child.kill("SIGKILL");
						rejectRun(
							new Error(
								`[smoke] timeout after ${options.timeoutMs}ms: ${formatCommand(command, args)}`,
							),
						);
					}, options.timeoutMs);

		child.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			if (timer) clearTimeout(timer);
			rejectRun(error);
		});
		child.on("exit", (code) => {
			if (timer) clearTimeout(timer);
			if (code === 0) {
				resolveRun({ stdout, stderr });
				return;
			}
			rejectRun(
				new Error(
					`[smoke] ${formatCommand(command, args)} exited with ${code}\n${stderr || stdout}`,
				),
			);
		});
	});
}

async function getFreePort(): Promise<number> {
	const net = await import("node:net");
	return await new Promise((resolvePort, rejectPort) => {
		const server = net.createServer();
		server.once("error", rejectPort);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() => {
				if (address && typeof address === "object") {
					resolvePort(address.port);
				} else {
					rejectPort(new Error("[smoke] failed to allocate a port"));
				}
			});
		});
	});
}

function killProcessTree(pid: number): void {
	if (process.platform === "win32") {
		spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
			stdio: "ignore",
		});
		return;
	}
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		// best-effort cleanup
	}
}

async function rmDirWithRetry(dir: string): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 20; attempt++) {
		try {
			rmSync(dir, { recursive: true, force: true });
			return;
		} catch (error) {
			lastError = error;
			await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
		}
	}
	throw lastError;
}

async function waitForHealth(port: number, child: ReturnType<typeof spawn>) {
	const url = `http://127.0.0.1:${port}/trpc/health.check`;
	for (let attempt = 0; attempt < 120; attempt++) {
		if (child.exitCode !== null || child.signalCode !== null) return false;
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
			if (response.ok) return true;
		} catch {
			// not listening yet
		}
		await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
	}
	return false;
}

console.log(`[smoke] dist=${dist} target=${target}`);

assertFile(cliBinary);
assertFile(nodeBinary);
assertFile(hostWrapper);
assertFile(join(dist, "lib", "host-service.js"));
assertFile(join(dist, "lib", "pty-daemon.js"));

await run(cliBinary, ["--version"], { timeoutMs: 10_000 });
const help = await run(cliBinary, ["--help"], { timeoutMs: 10_000 });
console.log(help.stdout.split(/\r?\n/).slice(0, 5).join("\n"));

const nodeVersion = await run(nodeBinary, ["--version"], { timeoutMs: 10_000 });
console.log(`[smoke] node ${nodeVersion.stdout.trim()}`);

if (target.startsWith("darwin-")) {
	const arch = target.slice("darwin-".length);
	assertFile(
		join(
			dist,
			"lib",
			"node_modules",
			"node-pty",
			"prebuilds",
			`darwin-${arch}`,
			"spawn-helper",
		),
	);
}

const smokeEnv = {
	...process.env,
	NODE_PATH: join(dist, "lib", "node_modules"),
	DIST: dist,
};
const smokeCwd = tmpdir();

await run(
	nodeBinary,
	[
		"-e",
		`
const path = require("node:path");
const { createRequire } = require("node:module");
const requireFromBundle = createRequire(path.join(process.env.DIST, "lib", "node_modules", ".smoke.cjs"));
for (const m of ["better-sqlite3", "node-pty", "@parcel/watcher", "libsql"]) {
  requireFromBundle(m);
  console.log("[smoke]", m, "OK");
}
`,
	],
	{ cwd: smokeCwd, env: smokeEnv, timeoutMs: 20_000 },
);

await run(
	nodeBinary,
	[
		"-e",
		`
const path = require("node:path");
const { createRequire } = require("node:module");
const isWin = process.platform === "win32";
const requireFromBundle = createRequire(path.join(process.env.DIST, "lib", "node_modules", ".smoke.cjs"));
const terminalModule = isWin ? "node-pty/lib/windowsTerminal" : "node-pty/lib/unixTerminal";
const resolved = requireFromBundle.resolve(terminalModule);
const dist = path.resolve(process.env.DIST).toLowerCase();
if (!path.resolve(resolved).toLowerCase().startsWith(dist)) {
  console.error("[smoke] node-pty leaked from non-bundled tree:", resolved);
  process.exit(1);
}
const pty = requireFromBundle("node-pty");
const shell = isWin ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
const args = isWin ? ["/d", "/s", "/c", "echo SPAWN_OK"] : ["-c", "echo SPAWN_OK"];
const term = pty.spawn(shell, args, { name: "xterm", cols: 80, rows: 24, cwd: process.cwd(), env: process.env });
let got = "";
let exited = null;
const check = () => {
  if (got.includes("SPAWN_OK") && exited && exited.exitCode === 0) {
    console.log("[smoke] pty spawn OK");
    process.exit(0);
  }
  console.error("[smoke] pty spawn FAIL exit=" + (exited && exited.exitCode) + " got=" + JSON.stringify(got));
  process.exit(1);
};
term.onData((d) => { got += d.toString(); });
term.onExit((e) => { exited = e; setTimeout(check, 100); });
setTimeout(() => { console.error("[smoke] pty spawn timeout"); process.exit(1); }, 5000);
`,
	],
	{ cwd: smokeCwd, env: smokeEnv, timeoutMs: 15_000 },
);

console.log("[smoke] booting host service");
const hostDir = mkdtempSync(join(tmpdir(), "superset-cli-smoke-"));
const hostPort = await getFreePort();
const hostEnv = {
	...smokeEnv,
	ORGANIZATION_ID: "00000000-0000-4000-8000-0000000000aa",
	AUTH_TOKEN: "smoke-test-token",
	SUPERSET_API_URL: "https://api.superset.sh",
	PORT: String(hostPort),
	HOST_SERVICE_PORT: String(hostPort),
	HOST_SERVICE_SECRET: "smoke-test-secret",
	HOST_DB_PATH: join(hostDir, "host.db"),
	HOST_MIGRATIONS_FOLDER: join(dist, "share", "migrations"),
};

const hostCommand = isWindowsTarget
	? (process.env.ComSpec ?? "cmd.exe")
	: hostWrapper;
const hostArgs = isWindowsTarget
	? ["/d", "/s", "/c", basename(hostWrapper)]
	: [];
const hostChild = spawn(hostCommand, hostArgs, {
	cwd: isWindowsTarget ? dirname(hostWrapper) : hostDir,
	env: hostEnv,
	stdio: ["ignore", "ignore", "pipe"],
});
let hostStderr = "";
hostChild.stderr?.on("data", (chunk) => {
	hostStderr += chunk.toString();
});

try {
	const healthy = await waitForHealth(hostPort, hostChild);
	if (!healthy) {
		throw new Error(
			`[smoke] host service never reached health.check\n----- host stderr -----\n${hostStderr}`,
		);
	}
	console.log("[smoke] host service boot OK");
	console.log("[smoke] all checks passed");
} finally {
	if (hostChild.pid) killProcessTree(hostChild.pid);
	await rmDirWithRetry(hostDir);
}
