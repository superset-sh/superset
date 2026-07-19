import {
	type ChildProcessWithoutNullStreams,
	spawn,
	spawnSync,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface CommandEvidence {
	name: string;
	command: string;
	exitCode: number;
	durationMs: number;
	stdout: string;
	stderr: string;
}

export interface AssertionEvidence {
	name: string;
	passed: boolean;
	detail: string;
}

interface ManagedProcess {
	child: ChildProcessWithoutNullStreams;
	stdout: string;
	stderr: string;
}

interface RunCommandOptions {
	name: string;
	command: string;
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin?: string;
	displayArgs?: string[];
	signalAfterMs?: number;
}

const PROCESS_TIMEOUT_MS = 15_000;

export function sha256(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function quote(value: string): string {
	if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
	return JSON.stringify(value);
}

function renderCommand(command: string, args: string[]): string {
	return [command, ...args].map(quote).join(" ");
}

function startProcess(
	command: string,
	args: string[],
	options: { cwd: string; env: NodeJS.ProcessEnv },
): ManagedProcess {
	const child = spawn(command, args, {
		cwd: options.cwd,
		env: options.env,
		stdio: ["pipe", "pipe", "pipe"],
	});
	const managed: ManagedProcess = { child, stdout: "", stderr: "" };
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		managed.stdout += chunk;
	});
	child.stderr.on("data", (chunk: string) => {
		managed.stderr += chunk;
	});
	return managed;
}

async function waitFor(
	predicate: () => boolean,
	describe: string,
	process?: ManagedProcess,
	timeoutMs = PROCESS_TIMEOUT_MS,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		if (process && process.child.exitCode !== null) {
			throw new Error(
				`${describe} exited early (${process.child.exitCode})\n${process.stderr}`,
			);
		}
		await Bun.sleep(25);
	}
	throw new Error(`Timed out waiting for ${describe}`);
}

async function stopProcess(process: ManagedProcess | undefined): Promise<void> {
	if (!process || process.child.exitCode !== null) return;
	process.child.kill("SIGTERM");
	const deadline = Date.now() + 5_000;
	while (process.child.exitCode === null && Date.now() < deadline) {
		await Bun.sleep(25);
	}
	if (process.child.exitCode === null) process.child.kill("SIGKILL");
}

async function runCommand(
	options: RunCommandOptions,
): Promise<CommandEvidence> {
	const startedAt = Date.now();
	const process = startProcess(options.command, options.args, options);
	if (options.stdin !== undefined) process.child.stdin.end(options.stdin);
	else process.child.stdin.end();
	if (options.signalAfterMs !== undefined) {
		setTimeout(() => process.child.kill("SIGINT"), options.signalAfterMs);
	}
	const exitCode = await new Promise<number>((resolveExit, reject) => {
		process.child.once("error", reject);
		process.child.once("exit", (code) => resolveExit(code ?? 1));
	});
	return {
		name: options.name,
		command: renderCommand(
			basename(options.command),
			options.displayArgs ?? options.args,
		),
		exitCode,
		durationMs: Date.now() - startedAt,
		stdout: process.stdout.trim(),
		stderr: process.stderr.trim(),
	};
}

function findElectronBinary(repoRoot: string): string {
	const bunModules = join(repoRoot, "node_modules", ".bun");
	if (!existsSync(bunModules)) {
		throw new Error("node_modules/.bun is missing; run `bun install` first");
	}
	const packages = readdirSync(bunModules).filter((entry) =>
		entry.startsWith("electron@"),
	);
	for (const packageDir of packages) {
		const distDir = join(
			bunModules,
			packageDir,
			"node_modules",
			"electron",
			"dist",
		);
		const candidates = [
			join(distDir, "Electron.app", "Contents", "MacOS", "Electron"),
			join(distDir, "electron"),
			join(distDir, "electron.exe"),
		];
		const candidate = candidates.find(existsSync);
		if (candidate) return candidate;
	}
	throw new Error("Electron binary not found; run `bun install` first");
}

function findChromeBinary(): string | null {
	const candidates = [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
	];
	return candidates.find(existsSync) ?? null;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function excerpt(value: string, max = 900): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max)}\n… (${value.length - max} more characters)`;
}

function renderReport(
	assertions: AssertionEvidence[],
	commands: CommandEvidence[],
	metadata: Record<string, string>,
): string {
	const passed = assertions.filter((assertion) => assertion.passed).length;
	const assertionCards = assertions
		.map(
			(
				assertion,
			) => `<article class="assertion ${assertion.passed ? "pass" : "fail"}">
<strong>${assertion.passed ? "PASS" : "FAIL"} · ${escapeHtml(assertion.name)}</strong>
<span>${escapeHtml(assertion.detail)}</span>
</article>`,
		)
		.join("\n");
	const commandCards = commands
		.map(
			(command) => `<details ${command.exitCode === 0 ? "" : "open"}>
<summary><span class="exit ${command.exitCode === 0 ? "ok" : "bad"}">exit ${command.exitCode}</span> ${escapeHtml(command.name)} <small>${command.durationMs} ms</small></summary>
<pre class="command">$ ${escapeHtml(command.command)}</pre>
${command.stdout ? `<h4>stdout</h4><pre>${escapeHtml(excerpt(command.stdout))}</pre>` : ""}
${command.stderr ? `<h4>stderr</h4><pre>${escapeHtml(excerpt(command.stderr))}</pre>` : ""}
</details>`,
		)
		.join("\n");
	const metadataRows = Object.entries(metadata)
		.map(
			([key, value]) =>
				`<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`,
		)
		.join("\n");
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Superset CLI E2E evidence</title>
<style>
:root{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#e7e9ee;background:#0b0d12}body{margin:0;padding:40px}main{max-width:1320px;margin:auto}h1{font:700 30px system-ui;margin:0 0 8px}.subtitle{color:#9ba3b4;margin-bottom:24px}.summary{display:flex;gap:16px;margin:20px 0}.metric{background:#151923;border:1px solid #293040;border-radius:10px;padding:16px 20px}.metric strong{font-size:28px;display:block}.metric span,small{color:#9ba3b4}dl{display:grid;grid-template-columns:max-content 1fr;gap:7px 16px;background:#11151d;padding:16px;border-radius:10px}dt{color:#8e98aa}dd{margin:0}.assertions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.assertion{display:flex;flex-direction:column;gap:6px;border:1px solid #293040;border-left-width:5px;background:#11151d;padding:12px 14px;border-radius:8px}.assertion.pass{border-left-color:#41d17d}.assertion.fail{border-left-color:#ff667a}.assertion span{color:#b6bdca;font-size:12px}details{background:#11151d;border:1px solid #293040;border-radius:8px;margin:10px 0;padding:12px}summary{cursor:pointer;font-weight:700}.exit{display:inline-block;padding:3px 7px;border-radius:5px;margin-right:6px}.exit.ok{background:#163c29;color:#64e69b}.exit.bad{background:#461c26;color:#ff8c9b}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#090b10;border-radius:6px;padding:12px;color:#cdd3df}.command{color:#82b6ff}h2{font:700 20px system-ui;margin-top:30px}h4{margin-bottom:-4px;color:#9ba3b4}@media(max-width:800px){.assertions{grid-template-columns:1fr}body{padding:20px}}
</style></head><body><main>
<h1>Superset CLI agent-session E2E</h1><div class="subtitle">Generated from real CLI subprocesses, host HTTP calls, and a production-ABI PTY daemon.</div>
<div class="summary"><div class="metric"><strong>${passed}/${assertions.length}</strong><span>assertions passed</span></div><div class="metric"><strong>${commands.length}</strong><span>CLI commands recorded</span></div></div>
<dl>${metadataRows}</dl><h2>Assertions</h2><section class="assertions">${assertionCards}</section>
<h2>Command transcript</h2>${commandCards}</main></body></html>`;
}

function renderMarkdown(
	assertions: AssertionEvidence[],
	commands: CommandEvidence[],
	metadata: Record<string, string>,
): string {
	const lines = [
		"# Superset CLI agent-session E2E transcript",
		"",
		...Object.entries(metadata).map(([key, value]) => `- ${key}: ${value}`),
		"",
		"## Assertions",
		"",
		...assertions.map(
			(assertion) =>
				`- [${assertion.passed ? "x" : " "}] ${assertion.name} — ${assertion.detail}`,
		),
		"",
		"## Commands",
	];
	for (const command of commands) {
		lines.push(
			"",
			`### ${command.name} (exit ${command.exitCode}, ${command.durationMs} ms)`,
			"",
			"```console",
			`$ ${command.command}`,
		);
		if (command.stdout) lines.push(command.stdout);
		if (command.stderr) lines.push("[stderr]", command.stderr);
		lines.push("```");
	}
	return `${lines.join("\n")}\n`;
}

export class CliE2EHarness {
	readonly repoRoot: string;
	readonly cliRoot: string;
	readonly tempRoot: string;
	readonly artifactsDir: string;
	readonly commands: CommandEvidence[] = [];
	readonly assertions: AssertionEvidence[] = [];
	readonly organizationId = "10000000-0000-4000-8000-000000000001";
	readonly workspaceId = "30000000-0000-4000-8000-000000000001";
	readonly secret = "e2e-host-secret";
	readonly capturePath: string;
	readonly dbPath: string;
	readonly homeDir: string;
	readonly workspacePath: string;
	private daemon?: ManagedProcess;
	private host?: ManagedProcess;
	private endpoint = "";
	private hostPort = 0;
	private readonly stoppedHostLogs: string[] = [];

	constructor(options: { repoRoot: string; artifactsDir: string }) {
		this.repoRoot = options.repoRoot;
		this.cliRoot = join(this.repoRoot, "packages", "cli");
		this.tempRoot = mkdtempSync(join(tmpdir(), "superset-cli-e2e-"));
		this.artifactsDir = resolve(this.repoRoot, options.artifactsDir);
		this.capturePath = join(this.tempRoot, "capture.jsonl");
		this.dbPath = join(this.tempRoot, "host.db");
		this.homeDir = join(this.tempRoot, "home");
		this.workspacePath = join(this.tempRoot, "workspace");
		mkdirSync(this.workspacePath, { recursive: true });
		mkdirSync(this.homeDir, { recursive: true, mode: 0o700 });
	}

	private commonEnv(): NodeJS.ProcessEnv {
		return {
			...process.env,
			CI: "1",
			NODE_ENV: "test",
			ORGANIZATION_ID: this.organizationId,
			SUPERSET_API_KEY: "e2e-api-key",
			SUPERSET_API_URL: "http://127.0.0.1:9",
			SUPERSET_HOME_DIR: this.homeDir,
			HOST_MANIFEST_DIR: join(this.homeDir, "host", this.organizationId),
		};
	}

	async start(): Promise<void> {
		const daemonBundle = join(
			this.repoRoot,
			"packages",
			"pty-daemon",
			"dist",
			"pty-daemon.js",
		);
		if (!existsSync(daemonBundle)) {
			const build = spawnSync(
				process.execPath,
				["run", "--cwd", "packages/pty-daemon", "build:daemon"],
				{ cwd: this.repoRoot, stdio: "inherit" },
			);
			if (build.status !== 0) throw new Error("Failed to build pty-daemon");
		}

		const socketPath = join(this.tempRoot, "pty.sock");
		this.daemon = startProcess(
			findElectronBinary(this.repoRoot),
			[daemonBundle, `--socket=${socketPath}`],
			{
				cwd: this.repoRoot,
				env: {
					...this.commonEnv(),
					ELECTRON_RUN_AS_NODE: "1",
					SUPERSET_PTY_DAEMON_VERSION: "0.2.6-e2e",
				},
			},
		);
		await waitFor(
			() => existsSync(socketPath),
			"production-ABI PTY daemon socket",
			this.daemon,
		);
		process.env.SUPERSET_PTY_DAEMON_SOCKET = socketPath;

		writeFileSync(
			join(this.homeDir, "config.json"),
			JSON.stringify({ organizationId: this.organizationId }),
			{ mode: 0o600 },
		);
		await this.startHost(socketPath);
	}

	private async startHost(socketPath: string): Promise<void> {
		const agentRuntimePath = Bun.which("node");
		if (!agentRuntimePath) {
			throw new Error("Node runtime not found for the fake terminal agent");
		}
		const fixture = join(
			this.repoRoot,
			"packages",
			"host-service",
			"test",
			"fixtures",
			"agent-sessions-cli-host.ts",
		);
		this.host = startProcess(process.execPath, [fixture], {
			cwd: this.repoRoot,
			env: {
				...this.commonEnv(),
				PORT: String(this.hostPort),
				HOST_DB_PATH: this.dbPath,
				HOST_MIGRATIONS_FOLDER: join(
					this.repoRoot,
					"packages",
					"host-service",
					"drizzle",
				),
				HOST_SERVICE_SECRET: this.secret,
				SUPERSET_E2E_WORKSPACE_PATH: this.workspacePath,
				SUPERSET_E2E_AGENT_PATH: join(
					this.repoRoot,
					"packages",
					"cli",
					"test",
					"fixtures",
					"fake-terminal-agent.mjs",
				),
				SUPERSET_E2E_CAPTURE_PATH: this.capturePath,
				SUPERSET_E2E_AGENT_RUNTIME_PATH: agentRuntimePath,
				SUPERSET_PTY_DAEMON_SOCKET: socketPath,
			},
		});
		await waitFor(
			() => this.host?.stdout.includes("E2E_HOST_READY") ?? false,
			"host-service fixture",
			this.host,
		);
		const match = /E2E_HOST_READY\s+(\S+)/.exec(this.host.stdout);
		if (!match?.[1])
			throw new Error("Host fixture did not report its endpoint");
		this.endpoint = match[1].replace(/\/$/, "");
		this.hostPort = Number(new URL(this.endpoint).port);
		this.writeManifest(this.host.child.pid ?? 0);
	}

	private writeManifest(pid: number): void {
		const manifestDir = join(this.homeDir, "host", this.organizationId);
		mkdirSync(manifestDir, { recursive: true, mode: 0o700 });
		writeFileSync(
			join(manifestDir, "manifest.json"),
			JSON.stringify({
				pid,
				endpoint: this.endpoint,
				authToken: this.secret,
				startedAt: Date.now(),
				organizationId: this.organizationId,
			}),
			{ mode: 0o600 },
		);
	}

	async restartHost(): Promise<void> {
		const socketPath = process.env.SUPERSET_PTY_DAEMON_SOCKET;
		if (!socketPath) throw new Error("PTY daemon socket was not initialized");
		await stopProcess(this.host);
		this.stoppedHostLogs.push(
			`${this.host?.stdout ?? ""}\n${this.host?.stderr ?? ""}`.trim(),
		);
		this.host = undefined;
		await this.startHost(socketPath);
	}

	async cli(options: {
		name: string;
		args: string[];
		stdin?: string;
		displayArgs?: string[];
		signalAfterMs?: number;
	}): Promise<CommandEvidence> {
		const executable = join(
			this.cliRoot,
			"node_modules",
			".bin",
			"cli-framework",
		);
		const evidence = await runCommand({
			name: options.name,
			command: process.execPath,
			args: [executable, "dev", "--json", ...options.args],
			displayArgs: [
				"superset",
				"--json",
				...(options.displayArgs ?? options.args),
			],
			cwd: this.cliRoot,
			env: this.commonEnv(),
			...(options.stdin !== undefined ? { stdin: options.stdin } : {}),
			...(options.signalAfterMs !== undefined
				? { signalAfterMs: options.signalAfterMs }
				: {}),
		});
		evidence.command = evidence.command.replace(/^bun superset /, "superset ");
		this.commands.push(this.scrubCommand(evidence));
		return evidence;
	}

	check(name: string, condition: boolean, detail: string): void {
		this.assertions.push({ name, passed: condition, detail });
		if (!condition) throw new Error(`Assertion failed: ${name} (${detail})`);
	}

	readCapture(): Array<{ kind: string; prompt: string }> {
		if (!existsSync(this.capturePath)) return [];
		return readFileSync(this.capturePath, "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const record = JSON.parse(line) as { kind: string; prompt: string };
				return {
					kind: record.kind,
					prompt: Buffer.from(record.prompt, "base64").toString("utf8"),
				};
			});
	}

	async waitForCaptureCount(count: number): Promise<void> {
		await waitFor(
			() => this.readCapture().length >= count,
			`${count} captures`,
		);
	}

	private scrub(value: string): string {
		return value
			.replaceAll(this.tempRoot, "$E2E_ROOT")
			.replaceAll(this.repoRoot, "$REPO");
	}

	private scrubCommand(evidence: CommandEvidence): CommandEvidence {
		return {
			...evidence,
			command: this.scrub(evidence.command),
			stdout: this.scrub(evidence.stdout),
			stderr: this.scrub(evidence.stderr),
		};
	}

	async finish(error?: unknown): Promise<void> {
		await stopProcess(this.host);
		await stopProcess(this.daemon);
		const hostLogs = [
			...this.stoppedHostLogs,
			`${this.host?.stdout ?? ""}\n${this.host?.stderr ?? ""}`.trim(),
		].filter(Boolean);
		rmSync(this.artifactsDir, { recursive: true, force: true });
		mkdirSync(this.artifactsDir, { recursive: true });
		if (existsSync(this.capturePath)) {
			copyFileSync(this.capturePath, join(this.artifactsDir, "capture.jsonl"));
		}
		if (existsSync(this.dbPath)) {
			copyFileSync(this.dbPath, join(this.artifactsDir, "host.db"));
		}
		writeFileSync(
			join(this.artifactsDir, "host.log"),
			this.scrub(hostLogs.join("\n\n--- host restart ---\n\n")),
		);
		writeFileSync(
			join(this.artifactsDir, "pty-daemon.log"),
			this.scrub(
				`${this.daemon?.stdout ?? ""}\n${this.daemon?.stderr ?? ""}`.trim(),
			),
		);

		const commit = spawnSync("git", ["rev-parse", "HEAD"], {
			cwd: this.repoRoot,
			encoding: "utf8",
		}).stdout.trim();
		const metadata = {
			result: error ? "FAILED" : "PASSED",
			commit,
			generatedAt: new Date().toISOString(),
			worktree: relative(resolve(this.repoRoot, ".."), this.repoRoot),
			runtime: `Bun ${Bun.version}; Electron-as-Node PTY daemon`,
		};
		const result = {
			metadata,
			assertions: this.assertions,
			commands: this.commands,
			...(error
				? { error: error instanceof Error ? error.stack : String(error) }
				: {}),
		};
		writeFileSync(
			join(this.artifactsDir, "results.json"),
			`${JSON.stringify(result, null, 2)}\n`,
		);
		writeFileSync(
			join(this.artifactsDir, "transcript.md"),
			renderMarkdown(this.assertions, this.commands, metadata),
		);
		const reportPath = join(this.artifactsDir, "report.html");
		writeFileSync(
			reportPath,
			renderReport(this.assertions, this.commands, metadata),
		);

		const chrome = findChromeBinary();
		if (chrome) {
			spawnSync(
				chrome,
				[
					"--headless=new",
					"--disable-gpu",
					"--hide-scrollbars",
					"--no-first-run",
					"--window-size=1440,1800",
					`--screenshot=${join(this.artifactsDir, "report.png")}`,
					pathToFileURL(reportPath).href,
				],
				{ stdio: "ignore" },
			);
		}
		rmSync(this.tempRoot, { recursive: true, force: true });
	}
}
