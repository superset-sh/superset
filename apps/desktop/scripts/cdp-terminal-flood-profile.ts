/**
 * Profiles terminal relay coupling against this workspace's running desktop.
 *
 * Launch the app with an unused CDP port, then run:
 *
 *   RENDERER_REMOTE_DEBUG_PORT=19322 bun --env-file=.env \
 *     apps/desktop/scripts/cdp-terminal-flood-profile.ts --repair-local-auth
 *
 * The harness verifies the renderer URL and resolves its authenticated org
 * through CDP. It never prints bearer or host tokens. It attaches real
 * WebSocket consumers to two PTYs, floods one, and measures echo/health latency
 * on the other while sampling host-service and pty-daemon resources.
 */

import { Database } from "bun:sqlite";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { DEV_EMAIL, DEV_PASSWORD } from "@superset/shared/dev-credentials";

const execFileAsync = promisify(execFile);

interface Options {
	cdpPort: number;
	apiUrl: string;
	desktopVitePort: number;
	homeDir: string;
	samples: number;
	intervalMs: number;
	repairLocalAuth: boolean;
	workspacePath: string;
	outDir: string;
}

interface CdpTarget {
	type: string;
	url: string;
	webSocketDebuggerUrl?: string;
}

interface SessionProbe {
	status: number;
	organizationId: string | null;
}

interface HostManifest {
	endpoint: string;
	authToken: string;
	organizationId: string;
	pid: number;
}

interface PtyDaemonManifest {
	pid: number;
}

interface ProcessSample {
	cpu: number;
	rssKb: number;
}

interface PhaseResult {
	echoRttMs: MetricSummary;
	healthRttMs: MetricSummary;
	hostCpuPercent: MetricSummary;
	daemonCpuPercent: MetricSummary;
	hostRssKb: MetricSummary;
	daemonRssKb: MetricSummary;
	floodBytesReceived: number;
	probeSocketStayedOpen: boolean;
	floodSocketStayedOpen: boolean;
}

interface MetricSummary {
	count: number;
	p50: number;
	p95: number;
	p99: number;
	max: number;
}

interface TerminalStream {
	readonly socket: WebSocket;
	readonly stayedOpen: () => boolean;
	readonly bytesReceived: () => number;
	sendInput(data: string): void;
	waitForText(marker: string, timeoutMs?: number): Promise<void>;
	close(): void;
}

interface TextWaiter {
	resolve: () => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

function parseArgs(argv: string[]): Options {
	const options: Options = {
		cdpPort: Number(process.env.RENDERER_REMOTE_DEBUG_PORT ?? 9222),
		apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
		desktopVitePort: Number(process.env.DESKTOP_VITE_PORT ?? 5173),
		homeDir: process.env.SUPERSET_HOME_DIR ?? resolve("superset-dev-data"),
		samples: 60,
		intervalMs: 150,
		repairLocalAuth: false,
		workspacePath: process.cwd(),
		outDir: ".cache/terminal-flood-profiles",
	};

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		const next = () => {
			const value = argv[++index];
			if (!value) throw new Error(`Missing value after ${arg}`);
			return value;
		};
		switch (arg) {
			case "--samples":
				options.samples = Number(next());
				break;
			case "--interval-ms":
				options.intervalMs = Number(next());
				break;
			case "--out-dir":
				options.outDir = next();
				break;
			case "--repair-local-auth":
				options.repairLocalAuth = true;
				break;
			case "--workspace-path":
				options.workspacePath = resolve(next());
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	for (const [name, value] of Object.entries({
		cdpPort: options.cdpPort,
		desktopVitePort: options.desktopVitePort,
		samples: options.samples,
		intervalMs: options.intervalMs,
	})) {
		if (!Number.isFinite(value) || value < 1) {
			throw new Error(`${name} must be a positive number`);
		}
	}
	return options;
}

async function findRendererTarget(options: Options): Promise<CdpTarget> {
	const response = await fetch(`http://127.0.0.1:${options.cdpPort}/json/list`);
	if (!response.ok)
		throw new Error(`CDP target list returned ${response.status}`);
	const targets = (await response.json()) as CdpTarget[];
	const expectedOrigin = `http://localhost:${options.desktopVitePort}`;
	const target = targets.find(
		(candidate) =>
			candidate.type === "page" &&
			candidate.webSocketDebuggerUrl &&
			candidate.url.startsWith(`${expectedOrigin}/`),
	);
	if (!target?.webSocketDebuggerUrl) {
		throw new Error(
			`No renderer for ${expectedOrigin} on CDP port ${options.cdpPort}`,
		);
	}
	return target;
}

async function evaluateCdp<T>(
	target: CdpTarget,
	expression: string,
): Promise<T> {
	if (!target.webSocketDebuggerUrl) throw new Error("CDP target has no socket");
	return new Promise<T>((resolveValue, rejectValue) => {
		const socket = new WebSocket(target.webSocketDebuggerUrl as string);
		const timer = setTimeout(() => {
			socket.close();
			rejectValue(new Error("CDP evaluation timed out"));
		}, 15_000);
		const settle = (callback: () => void) => {
			clearTimeout(timer);
			socket.close();
			callback();
		};
		socket.addEventListener("open", () => {
			socket.send(
				JSON.stringify({
					id: 1,
					method: "Runtime.evaluate",
					params: { expression, awaitPromise: true, returnByValue: true },
				}),
			);
		});
		socket.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data)) as {
				id?: number;
				result?: {
					exceptionDetails?: {
						text?: string;
						exception?: { description?: string };
					};
					result?: { value?: T };
				};
			};
			if (message.id !== 1) return;
			const exception = message.result?.exceptionDetails;
			if (exception) {
				settle(() =>
					rejectValue(
						new Error(
							exception.exception?.description ??
								exception.text ??
								"Renderer evaluation failed",
						),
					),
				);
				return;
			}
			settle(() => resolveValue(message.result?.result?.value as T));
		});
		socket.addEventListener("error", () => {
			settle(() => rejectValue(new Error("CDP WebSocket failed")));
		});
	});
}

function sessionProbeExpression(apiUrl: string): string {
	return `(async () => {
		const response = await fetch(${JSON.stringify(`${apiUrl}/api/auth/get-session`)}, { credentials: "include" });
		const body = await response.json().catch(() => null);
		return { status: response.status, organizationId: body?.session?.activeOrganizationId ?? null };
	})()`;
}

function bearerSessionProbeExpression(): string {
	return `(async () => {
		const { authClient } = await import("/lib/auth-client.ts");
		const result = await authClient.getSession({ fetchOptions: { throw: false } });
		return {
			status: result.data ? 200 : 401,
			organizationId: result.data?.session?.activeOrganizationId ?? null,
		};
	})()`;
}

async function resolveAuthenticatedOrg(
	options: Options,
	target: CdpTarget,
): Promise<string> {
	let probe = await evaluateCdp<SessionProbe>(
		target,
		sessionProbeExpression(options.apiUrl),
	);
	// Non-local desktop auth intentionally uses an in-memory bearer token rather
	// than browser cookies. Exercise the renderer's real auth client so the CDP
	// probe verifies /api/auth/get-session without exposing that token.
	if (!probe.organizationId) {
		probe = await evaluateCdp<SessionProbe>(
			target,
			bearerSessionProbeExpression(),
		);
	}
	if (!probe.organizationId && options.repairLocalAuth) {
		const api = new URL(options.apiUrl);
		if (
			api.protocol !== "http:" ||
			!["localhost", "127.0.0.1"].includes(api.hostname)
		) {
			throw new Error("Local auth repair requires a localhost HTTP API");
		}
		const signIn = await evaluateCdp<{ status: number }>(
			target,
			`(async () => {
				const response = await fetch(${JSON.stringify(`${options.apiUrl}/api/auth/sign-in/email`)}, {
					method: "POST",
					headers: { "content-type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ email: ${JSON.stringify(DEV_EMAIL)}, password: ${JSON.stringify(DEV_PASSWORD)} }),
				});
				return { status: response.status };
			})()`,
		);
		if (signIn.status < 200 || signIn.status >= 300) {
			throw new Error(`Local sign-in returned ${signIn.status}`);
		}
		probe = await evaluateCdp<SessionProbe>(
			target,
			sessionProbeExpression(options.apiUrl),
		);
	}
	if (probe.status !== 200 || !probe.organizationId) {
		throw new Error(`Renderer session is unavailable (status ${probe.status})`);
	}
	return probe.organizationId;
}

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf8")) as T;
}

function resolveWorkspaceId(hostDbPath: string, workspacePath: string): string {
	const db = new Database(hostDbPath, { readonly: true });
	try {
		const rows = db
			.query<{ id: string; worktreePath: string }, []>(
				"select id, worktree_path as worktreePath from workspaces order by case when type = 'main' then 0 else 1 end, created_at",
			)
			.all();
		const workspace = rows.find(
			(row) => resolve(row.worktreePath) === workspacePath,
		);
		if (!workspace) {
			throw new Error(`Selected org has no workspace at ${workspacePath}`);
		}
		return workspace.id;
	} finally {
		db.close();
	}
}

function authHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		"content-type": "application/json",
	};
}

async function createTerminal(
	manifest: HostManifest,
	workspaceId: string,
): Promise<string> {
	const terminalId = `profile-${randomUUID()}`;
	const response = await fetch(`${manifest.endpoint}/terminal/sessions`, {
		method: "POST",
		headers: authHeaders(manifest.authToken),
		body: JSON.stringify({ terminalId, workspaceId, cols: 120, rows: 32 }),
	});
	if (!response.ok) {
		throw new Error(`Terminal create returned ${response.status}`);
	}
	return terminalId;
}

async function disposeTerminal(
	manifest: HostManifest,
	terminalId: string,
): Promise<void> {
	await fetch(`${manifest.endpoint}/terminal/sessions/${terminalId}`, {
		method: "DELETE",
		headers: authHeaders(manifest.authToken),
	}).catch(() => undefined);
}

async function openTerminalStream(
	manifest: HostManifest,
	workspaceId: string,
	terminalId: string,
): Promise<TerminalStream> {
	const endpoint = new URL(manifest.endpoint);
	const socketUrl = new URL(
		`${endpoint.protocol === "https:" ? "wss:" : "ws:"}//${endpoint.host}/terminal/${terminalId}`,
	);
	socketUrl.searchParams.set("workspaceId", workspaceId);
	socketUrl.searchParams.set("token", manifest.authToken);
	const socket = new WebSocket(socketUrl);
	socket.binaryType = "arraybuffer";
	const decoder = new TextDecoder();
	const waiters = new Map<string, TextWaiter>();
	let textTail = "";
	let receivedBytes = 0;
	let opened = false;
	let unexpectedClose = false;

	const attached = new Promise<void>((resolveAttached, rejectAttached) => {
		const timer = setTimeout(
			() => rejectAttached(new Error("Terminal attach timed out")),
			10_000,
		);
		socket.addEventListener("message", (event) => {
			if (typeof event.data === "string") {
				const message = JSON.parse(event.data) as {
					type?: string;
					message?: string;
				};
				if (message.type === "attached") {
					opened = true;
					clearTimeout(timer);
					resolveAttached();
				} else if (message.type === "error") {
					clearTimeout(timer);
					rejectAttached(
						new Error(message.message ?? "Terminal attach failed"),
					);
				}
				return;
			}
			const bytes =
				event.data instanceof ArrayBuffer
					? new Uint8Array(event.data)
					: new Uint8Array(event.data as ArrayBuffer);
			receivedBytes += bytes.byteLength;
			textTail = `${textTail}${decoder.decode(bytes, { stream: true })}`.slice(
				-8_192,
			);
			for (const [marker, waiter] of waiters) {
				if (!textTail.includes(marker)) continue;
				clearTimeout(waiter.timer);
				waiters.delete(marker);
				waiter.resolve();
			}
		});
		socket.addEventListener("close", () => {
			unexpectedClose = opened;
			clearTimeout(timer);
			for (const waiter of waiters.values()) {
				clearTimeout(waiter.timer);
				waiter.reject(new Error("Terminal socket closed"));
			}
			waiters.clear();
			if (!opened)
				rejectAttached(new Error("Terminal socket closed on attach"));
		});
		socket.addEventListener("error", () => {
			clearTimeout(timer);
			if (!opened)
				rejectAttached(new Error("Terminal socket failed on attach"));
		});
	});

	await attached;
	return {
		socket,
		stayedOpen: () => !unexpectedClose && socket.readyState === WebSocket.OPEN,
		bytesReceived: () => receivedBytes,
		sendInput(data) {
			if (socket.readyState !== WebSocket.OPEN) {
				throw new Error("Terminal socket is not open");
			}
			socket.send(JSON.stringify({ type: "input", data }));
		},
		waitForText(marker, timeoutMs = 5_000) {
			if (textTail.includes(marker)) return Promise.resolve();
			return new Promise<void>((resolveMarker, rejectMarker) => {
				const timer = setTimeout(() => {
					waiters.delete(marker);
					rejectMarker(new Error(`Timed out waiting for terminal marker`));
				}, timeoutMs);
				waiters.set(marker, {
					resolve: resolveMarker,
					reject: rejectMarker,
					timer,
				});
			});
		},
		close() {
			socket.close();
		},
	};
}

async function healthRtt(manifest: HostManifest): Promise<number> {
	const startedAt = performance.now();
	const response = await fetch(`${manifest.endpoint}/trpc/health.check`, {
		headers: authHeaders(manifest.authToken),
	});
	if (!response.ok) throw new Error(`Host health returned ${response.status}`);
	await response.arrayBuffer();
	return performance.now() - startedAt;
}

async function sampleProcesses(
	hostPid: number,
	daemonPid: number,
): Promise<Map<number, ProcessSample>> {
	const { stdout } = await execFileAsync("ps", [
		"-p",
		`${hostPid},${daemonPid}`,
		"-o",
		"pid=,%cpu=,rss=",
	]);
	const samples = new Map<number, ProcessSample>();
	for (const line of stdout.trim().split("\n")) {
		const [pidRaw, cpuRaw, rssRaw] = line.trim().split(/\s+/);
		const pid = Number(pidRaw);
		const cpu = Number(cpuRaw);
		const rssKb = Number(rssRaw);
		if ([pid, cpu, rssKb].every(Number.isFinite)) {
			samples.set(pid, { cpu, rssKb });
		}
	}
	return samples;
}

async function runPhase({
	label,
	options,
	manifest,
	daemonPid,
	probe,
	flood,
}: {
	label: string;
	options: Options;
	manifest: HostManifest;
	daemonPid: number;
	probe: TerminalStream;
	flood: TerminalStream;
}): Promise<PhaseResult> {
	const echoRtts: number[] = [];
	const healthRtts: number[] = [];
	const hostCpu: number[] = [];
	const daemonCpu: number[] = [];
	const hostRss: number[] = [];
	const daemonRss: number[] = [];
	const floodBytesBefore = flood.bytesReceived();

	for (let index = 0; index < options.samples; index++) {
		const iterationStartedAt = performance.now();
		const marker = `__superset_${label}_${index}_${randomUUID().slice(0, 8)}__`;
		const markerPromise = probe.waitForText(marker);
		const echoStartedAt = performance.now();
		probe.sendInput(`printf '${marker}\\n'\n`);
		const echoRttPromise = markerPromise.then(
			() => performance.now() - echoStartedAt,
		);
		const [echo, health] = await Promise.all([
			echoRttPromise,
			healthRtt(manifest),
		]);
		echoRtts.push(echo);
		healthRtts.push(health);

		if (index % Math.max(1, Math.round(500 / options.intervalMs)) === 0) {
			const processes = await sampleProcesses(manifest.pid, daemonPid);
			const host = processes.get(manifest.pid);
			const daemon = processes.get(daemonPid);
			if (host) {
				hostCpu.push(host.cpu);
				hostRss.push(host.rssKb);
			}
			if (daemon) {
				daemonCpu.push(daemon.cpu);
				daemonRss.push(daemon.rssKb);
			}
		}

		const remaining =
			options.intervalMs - (performance.now() - iterationStartedAt);
		if (remaining > 0) await sleep(remaining);
	}

	return {
		echoRttMs: summarize(echoRtts),
		healthRttMs: summarize(healthRtts),
		hostCpuPercent: summarize(hostCpu),
		daemonCpuPercent: summarize(daemonCpu),
		hostRssKb: summarize(hostRss),
		daemonRssKb: summarize(daemonRss),
		floodBytesReceived: flood.bytesReceived() - floodBytesBefore,
		probeSocketStayedOpen: probe.stayedOpen(),
		floodSocketStayedOpen: flood.stayedOpen(),
	};
}

function summarize(values: number[]): MetricSummary {
	const sorted = [...values].sort((a, b) => a - b);
	const valueAt = (percentile: number) => {
		if (sorted.length === 0) return 0;
		const index = Math.min(
			sorted.length - 1,
			Math.max(0, Math.ceil(percentile * sorted.length) - 1),
		);
		return sorted[index] ?? 0;
	};
	const round = (value: number) => Math.round(value * 10) / 10;
	return {
		count: sorted.length,
		p50: round(valueAt(0.5)),
		p95: round(valueAt(0.95)),
		p99: round(valueAt(0.99)),
		max: round(sorted.at(-1) ?? 0),
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const target = await findRendererTarget(options);
	const organizationId = await resolveAuthenticatedOrg(options, target);
	const organizationDir = join(options.homeDir, "host", organizationId);
	const manifest = await readJson<HostManifest>(
		join(organizationDir, "manifest.json"),
	);
	const daemonManifest = await readJson<PtyDaemonManifest>(
		join(organizationDir, "pty-daemon-manifest.json"),
	);
	if (manifest.organizationId !== organizationId) {
		throw new Error("Host manifest organization does not match selected org");
	}
	const workspaceId = resolveWorkspaceId(
		join(organizationDir, "host.db"),
		options.workspacePath,
	);

	let probeId: string | null = null;
	let floodId: string | null = null;
	let probe: TerminalStream | null = null;
	let flood: TerminalStream | null = null;
	try {
		probeId = await createTerminal(manifest, workspaceId);
		floodId = await createTerminal(manifest, workspaceId);
		[probe, flood] = await Promise.all([
			openTerminalStream(manifest, workspaceId, probeId),
			openTerminalStream(manifest, workspaceId, floodId),
		]);
		probe.sendInput("\n");
		flood.sendInput("\n");
		await sleep(1_000);

		const baseline = await runPhase({
			label: "baseline",
			options,
			manifest,
			daemonPid: daemonManifest.pid,
			probe,
			flood,
		});

		flood.sendInput(
			"while :; do printf '\\033[31m0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\\033[0m\\r'; done\n",
		);
		await sleep(750);
		const underFlood = await runPhase({
			label: "flood",
			options,
			manifest,
			daemonPid: daemonManifest.pid,
			probe,
			flood,
		});
		flood.sendInput("\u0003");
		await sleep(500);

		const summary = {
			measuredAt: new Date().toISOString(),
			rendererUrl: target.url,
			options: { samples: options.samples, intervalMs: options.intervalMs },
			baseline,
			underFlood,
		};
		await mkdir(options.outDir, { recursive: true });
		const summaryPath = join(options.outDir, `summary-${Date.now()}.json`);
		await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
		console.log(JSON.stringify(summary, null, 2));
		console.log(`Wrote summary: ${summaryPath}`);
	} finally {
		if (flood?.socket.readyState === WebSocket.OPEN) {
			try {
				flood.sendInput("\u0003");
			} catch {}
		}
		probe?.close();
		flood?.close();
		if (probeId) await disposeTerminal(manifest, probeId);
		if (floodId) await disposeTerminal(manifest, floodId);
	}
}

await main();
