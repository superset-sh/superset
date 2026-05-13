#!/usr/bin/env bun

interface Args {
	host: string;
	port: number;
	iterations: number;
	intervalMs: number;
	settleMs: number;
	timeoutMs: number;
	maxHeartbeatDelayMs: number;
	maxLongTaskMs: number;
	selector: string;
	workspaceIds: string[];
	json: boolean;
	help: boolean;
}

interface CdpTarget {
	type?: string;
	title?: string;
	url?: string;
	webSocketDebuggerUrl?: string;
}

interface CdpResponse {
	id?: number;
	result?: unknown;
	error?: {
		code: number;
		message: string;
	};
	method?: string;
	params?: unknown;
}

interface RuntimeEvaluateResult {
	result?: {
		type?: string;
		value?: unknown;
		description?: string;
	};
	exceptionDetails?: {
		text?: string;
		exception?: {
			description?: string;
			value?: unknown;
		};
	};
}

interface RendererStressResult {
	iterations: number;
	targetCount: number;
	activationModeCounts: Record<string, number>;
	durationMs: number;
	maxHeartbeatDelayMs: number;
	heartbeatDelaySamples: number[];
	maxLongTaskDurationMs: number;
	longTaskCount: number;
	longTasks: Array<{
		duration: number;
		startTime: number;
		name: string;
	}>;
	errorCount: number;
	errors: string[];
	startMemory: unknown;
	endMemory: unknown;
	finalLocation: string;
}

const DEFAULT_SELECTOR = "[data-renderer-stress-workspace-id]";

function parseArgs(argv: string[]): Args {
	const args: Args = {
		host: "127.0.0.1",
		port: Number(process.env.SUPERSET_RENDERER_STRESS_CDP_PORT ?? 9333),
		iterations: 500,
		intervalMs: 0,
		settleMs: 1000,
		timeoutMs: 30_000,
		maxHeartbeatDelayMs: 500,
		maxLongTaskMs: 500,
		selector: DEFAULT_SELECTOR,
		workspaceIds: [],
		json: false,
		help: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const readValue = () => {
			const value = argv[index + 1];
			if (!value) throw new Error(`Missing value for ${arg}`);
			index += 1;
			return value;
		};
		const readNumber = () => {
			const value = Number(readValue());
			if (!Number.isFinite(value)) throw new Error(`Invalid number for ${arg}`);
			return value;
		};

		switch (arg) {
			case "--help":
			case "-h":
				args.help = true;
				break;
			case "--host":
				args.host = readValue();
				break;
			case "--port":
				args.port = readNumber();
				break;
			case "--iterations":
				args.iterations = readNumber();
				break;
			case "--interval-ms":
				args.intervalMs = readNumber();
				break;
			case "--settle-ms":
				args.settleMs = readNumber();
				break;
			case "--timeout-ms":
				args.timeoutMs = readNumber();
				break;
			case "--max-heartbeat-delay-ms":
				args.maxHeartbeatDelayMs = readNumber();
				break;
			case "--max-long-task-ms":
				args.maxLongTaskMs = readNumber();
				break;
			case "--selector":
				args.selector = readValue();
				break;
			case "--workspace-ids":
				args.workspaceIds = readValue()
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean);
				break;
			case "--json":
				args.json = true;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return args;
}

function usage() {
	return `Renderer stress harness

Start the desktop app with CDP enabled:
  SUPERSET_RENDERER_STRESS_CDP_PORT=9333 bun --cwd apps/desktop dev

Run the workspace switching stress test from another shell:
  bun --cwd apps/desktop stress:renderer -- --port 9333 --iterations 1000 --interval-ms 0

Options:
  --port <n>                       CDP port. Default: env SUPERSET_RENDERER_STRESS_CDP_PORT or 9333
  --host <host>                    CDP host. Default: 127.0.0.1
  --iterations <n>                 Workspace activations. Default: 500
  --interval-ms <n>                Delay between activations. Default: 0
  --settle-ms <n>                  Delay after the final activation. Default: 1000
  --timeout-ms <n>                 CDP command timeout. Default: 30000
  --max-heartbeat-delay-ms <n>     Fail if event-loop heartbeat exceeds this. Default: 500
  --max-long-task-ms <n>           Fail if a renderer long task exceeds this. Default: 500
  --selector <css>                 Workspace target selector. Default: ${DEFAULT_SELECTOR}
  --workspace-ids <a,b,c>          Optional explicit workspace ids; falls back to hash navigation if needed
  --json                           Print only JSON summary
`;
}

function messageDataToString(data: unknown): string {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
	if (ArrayBuffer.isView(data)) {
		return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
			"utf8",
		);
	}
	return String(data);
}

class CdpClient {
	private nextId = 1;
	private pending = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();

	private constructor(private readonly ws: WebSocket) {
		this.ws.addEventListener("message", (event) => {
			this.onMessage(messageDataToString(event.data));
		});
		this.ws.addEventListener("close", () => {
			this.rejectPending(new Error("CDP socket closed"));
		});
		this.ws.addEventListener("error", () => {
			this.rejectPending(new Error("CDP socket errored"));
		});
	}

	static connect(url: string, timeoutMs: number): Promise<CdpClient> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(url);
			const timer = setTimeout(() => {
				ws.close();
				reject(new Error(`Timed out connecting to ${url}`));
			}, timeoutMs);
			ws.addEventListener("open", () => {
				clearTimeout(timer);
				resolve(new CdpClient(ws));
			});
			ws.addEventListener("error", () => {
				clearTimeout(timer);
				reject(new Error(`Failed to connect to ${url}`));
			});
		});
	}

	send<T = unknown>(
		method: string,
		params: Record<string, unknown> = {},
		timeoutMs = 10_000,
	): Promise<T> {
		const id = this.nextId;
		this.nextId += 1;
		const payload = JSON.stringify({ id, method, params });
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`CDP command timed out: ${method}`));
			}, timeoutMs);
			this.pending.set(id, {
				resolve: (value) => resolve(value as T),
				reject,
				timer,
			});
			this.ws.send(payload);
		});
	}

	close(): void {
		this.ws.close();
	}

	private onMessage(raw: string): void {
		const message = JSON.parse(raw) as CdpResponse;
		if (typeof message.id !== "number") return;
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		clearTimeout(pending.timer);
		if (message.error) {
			pending.reject(
				new Error(`CDP error ${message.error.code}: ${message.error.message}`),
			);
			return;
		}
		pending.resolve(message.result);
	}

	private rejectPending(error: Error): void {
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(error);
			this.pending.delete(id);
		}
	}
}

async function getRendererTarget(args: Args): Promise<CdpTarget> {
	const response = await fetch(`http://${args.host}:${args.port}/json/list`);
	if (!response.ok) {
		throw new Error(
			`Failed to query CDP targets: ${response.status} ${response.statusText}`,
		);
	}
	const targets = (await response.json()) as CdpTarget[];
	const target = targets.find(
		(candidate) =>
			candidate.webSocketDebuggerUrl &&
			candidate.type === "page" &&
			!candidate.url?.startsWith("devtools://"),
	);
	if (!target?.webSocketDebuggerUrl) {
		throw new Error("No renderer page target with a CDP socket was found");
	}
	return target;
}

function rendererStress(options: {
	iterations: number;
	intervalMs: number;
	settleMs: number;
	selector: string;
	workspaceIds: string[];
}): Promise<RendererStressResult> {
	type StressWindow = Window & {
		performance: Performance & {
			memory?: unknown;
		};
	};

	const stressWindow = window as StressWindow;
	const sleep = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));
	const cssEscape =
		stressWindow.CSS?.escape ??
		((value: string) => value.replace(/["\\]/g, "\\$&"));
	const errors: string[] = [];
	const longTasks: RendererStressResult["longTasks"] = [];
	const heartbeatDelaySamples: number[] = [];
	let maxHeartbeatDelayMs = 0;
	let expectedHeartbeat = performance.now() + 50;

	const onError = (event: ErrorEvent) => {
		errors.push(event.message || String(event.error ?? "unknown error"));
	};
	const onUnhandledRejection = (event: PromiseRejectionEvent) => {
		errors.push(`Unhandled rejection: ${String(event.reason)}`);
	};

	window.addEventListener("error", onError);
	window.addEventListener("unhandledrejection", onUnhandledRejection);

	const heartbeat = setInterval(() => {
		const now = performance.now();
		const delay = Math.max(0, now - expectedHeartbeat);
		if (delay > maxHeartbeatDelayMs) maxHeartbeatDelayMs = delay;
		if (delay > 50) heartbeatDelaySamples.push(delay);
		expectedHeartbeat = now + 50;
	}, 50);

	let longTaskObserver: PerformanceObserver | null = null;
	try {
		longTaskObserver = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				longTasks.push({
					duration: entry.duration,
					startTime: entry.startTime,
					name: entry.name,
				});
			}
		});
		longTaskObserver.observe({ entryTypes: ["longtask"] });
	} catch {
		longTaskObserver = null;
	}

	const getTargets = () => {
		if (options.workspaceIds.length >= 2) return options.workspaceIds;
		const ids = Array.from(document.querySelectorAll(options.selector))
			.map((element) =>
				element.getAttribute("data-renderer-stress-workspace-id"),
			)
			.filter((value): value is string => !!value);
		return Array.from(new Set(ids));
	};

	const activateWorkspace = (workspaceId: string) => {
		const target = document.querySelector<HTMLElement>(
			`${options.selector}[data-renderer-stress-workspace-id="${cssEscape(
				workspaceId,
			)}"]`,
		);
		if (target) {
			target.click();
			return "click";
		}
		window.location.hash = `/v2-workspace/${encodeURIComponent(workspaceId)}`;
		return "hash";
	};

	return (async () => {
		const startedAt = performance.now();
		const startMemory = stressWindow.performance.memory ?? null;
		const targets = getTargets();
		if (targets.length < 2) {
			throw new Error(
				`Need at least two workspace targets, found ${targets.length}. Open a workspace list/sidebar or pass --workspace-ids.`,
			);
		}

		const activationModeCounts: Record<string, number> = {};
		for (let index = 0; index < options.iterations; index += 1) {
			const target = targets[index % targets.length];
			const mode = activateWorkspace(target);
			activationModeCounts[mode] = (activationModeCounts[mode] ?? 0) + 1;
			await sleep(options.intervalMs);
		}
		await sleep(options.settleMs);

		const durationMs = performance.now() - startedAt;
		const maxLongTaskDurationMs = longTasks.reduce(
			(max, task) => Math.max(max, task.duration),
			0,
		);
		return {
			iterations: options.iterations,
			targetCount: targets.length,
			activationModeCounts,
			durationMs,
			maxHeartbeatDelayMs,
			heartbeatDelaySamples: heartbeatDelaySamples.slice(-20),
			maxLongTaskDurationMs,
			longTaskCount: longTasks.length,
			longTasks: longTasks
				.slice()
				.sort((left, right) => right.duration - left.duration)
				.slice(0, 10),
			errorCount: errors.length,
			errors: errors.slice(0, 20),
			startMemory,
			endMemory: stressWindow.performance.memory ?? null,
			finalLocation: window.location.href,
		};
	})().finally(() => {
		clearInterval(heartbeat);
		longTaskObserver?.disconnect();
		window.removeEventListener("error", onError);
		window.removeEventListener("unhandledrejection", onUnhandledRejection);
	});
}

async function main() {
	const args = parseArgs(Bun.argv.slice(2));
	if (args.help) {
		console.log(usage());
		return;
	}

	const target = await getRendererTarget(args);
	if (!args.json) {
		console.log(
			`[stress:renderer] attaching to ${target.title || target.url || "renderer"}`,
		);
	}
	const cdp = await CdpClient.connect(
		target.webSocketDebuggerUrl ?? "",
		args.timeoutMs,
	);

	try {
		await cdp.send("Runtime.enable", {}, args.timeoutMs);
		await cdp.send("Performance.enable", {}, args.timeoutMs);
		const evaluation = await cdp.send<RuntimeEvaluateResult>(
			"Runtime.evaluate",
			{
				expression: `(${rendererStress.toString()})(${JSON.stringify({
					iterations: args.iterations,
					intervalMs: args.intervalMs,
					settleMs: args.settleMs,
					selector: args.selector,
					workspaceIds: args.workspaceIds,
				})})`,
				awaitPromise: true,
				returnByValue: true,
			},
			args.timeoutMs,
		);

		if (evaluation.exceptionDetails) {
			throw new Error(
				evaluation.exceptionDetails.exception?.description ??
					evaluation.exceptionDetails.text ??
					"Renderer stress script threw",
			);
		}

		const summary = evaluation.result?.value as RendererStressResult;
		const cdpMetrics = await cdp
			.send("Performance.getMetrics", {}, args.timeoutMs)
			.catch((error) => ({ error: String(error) }));
		const output = {
			...summary,
			cdpMetrics,
			thresholds: {
				maxHeartbeatDelayMs: args.maxHeartbeatDelayMs,
				maxLongTaskMs: args.maxLongTaskMs,
			},
		};

		const failures: string[] = [];
		if (summary.errorCount > 0) {
			failures.push(`${summary.errorCount} renderer error(s) observed`);
		}
		if (summary.maxHeartbeatDelayMs > args.maxHeartbeatDelayMs) {
			failures.push(
				`heartbeat delay ${summary.maxHeartbeatDelayMs.toFixed(
					1,
				)}ms exceeded ${args.maxHeartbeatDelayMs}ms`,
			);
		}
		if (summary.maxLongTaskDurationMs > args.maxLongTaskMs) {
			failures.push(
				`long task ${summary.maxLongTaskDurationMs.toFixed(
					1,
				)}ms exceeded ${args.maxLongTaskMs}ms`,
			);
		}

		if (args.json) {
			console.log(JSON.stringify({ ...output, failures }, null, 2));
		} else {
			console.log(JSON.stringify(output, null, 2));
			if (failures.length > 0) {
				console.error(`[stress:renderer] failed: ${failures.join("; ")}`);
			} else {
				console.log("[stress:renderer] passed");
			}
		}

		if (failures.length > 0) process.exitCode = 1;
	} finally {
		cdp.close();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	console.error("");
	console.error(usage());
	process.exit(1);
});
