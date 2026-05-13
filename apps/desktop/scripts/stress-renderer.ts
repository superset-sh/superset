#!/usr/bin/env bun

interface Args {
	host: string;
	port: number;
	scenario: StressScenario;
	iterations: number;
	routeIterations: number;
	heavyIterations: number;
	terminalIterations: number;
	terminalTabCount: number;
	terminalPanesPerTab: number;
	terminalLines: number;
	terminalPayloadBytes: number;
	forceTerminalWebglLoss: boolean;
	includeTerminalAction: boolean;
	profileCpu: boolean;
	reactProbe: boolean;
	progressEvery: number;
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

type StressScenario =
	| "all"
	| "route-sweep"
	| "terminal-heavy"
	| "workspace-heavy"
	| "workspace-switch"
	| "workspace-switch-heavy";

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

interface RuntimeConsoleApiCalledEvent {
	type?: string;
	args?: Array<{
		type?: string;
		value?: unknown;
		description?: string;
	}>;
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

interface CpuProfile {
	nodes: Array<{
		id: number;
		parent?: number;
		children?: number[];
		callFrame: {
			functionName?: string;
			url?: string;
			lineNumber?: number;
			columnNumber?: number;
		};
		hitCount?: number;
	}>;
	samples?: number[];
	timeDeltas?: number[];
}

interface CpuProfileResult {
	profile?: CpuProfile;
}

interface CpuProfileFrameSummary {
	functionName: string;
	url: string;
	lineNumber: number;
	columnNumber: number;
	selfTimeMs: number;
	sampleCount: number;
	parentFunctionName?: string;
	parentUrl?: string;
	parentLineNumber?: number;
	parentColumnNumber?: number;
}

interface RendererStressResult {
	scenario: StressScenario;
	iterations: number;
	operationCount: number;
	targetCount: number;
	activationModeCounts: Record<string, number>;
	routeCount: number;
	routeIterations: number;
	routesVisited: string[];
	heavyIterations: number;
	heavyActionCounts: Record<string, number>;
	heavyActionErrors: string[];
	heavyActionCatalogue: string[];
	terminalIterations: number;
	terminalActionCounts: Record<string, number>;
	terminalActionErrors: string[];
	terminalStressSummary: unknown;
	terminalWebglContextLosses: unknown[];
	workspaceSummary: unknown;
	reactProbeSummary: unknown;
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
	slowOperations: Array<{
		phase: string;
		label: string;
		durationMs: number;
		index: number;
	}>;
	errorCount: number;
	errors: string[];
	startMemory: unknown;
	endMemory: unknown;
	finalLocation: string;
}

const DEFAULT_SELECTOR = "[data-renderer-stress-workspace-id]";

interface TerminalWebglContextLossRecord {
	index: number;
	terminalCount: number;
	canvasCount: number;
	webglContextCount: number;
	lostContextCount: number;
	unsupportedContextCount: number;
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		host: "127.0.0.1",
		port: Number(process.env.SUPERSET_RENDERER_STRESS_CDP_PORT ?? 9333),
		scenario: "workspace-switch",
		iterations: 500,
		routeIterations: 0,
		heavyIterations: 0,
		terminalIterations: 0,
		terminalTabCount: 24,
		terminalPanesPerTab: 4,
		terminalLines: 40,
		terminalPayloadBytes: 1024,
		forceTerminalWebglLoss: true,
		includeTerminalAction: false,
		profileCpu: false,
		reactProbe: false,
		progressEvery: 100,
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
			case "--scenario": {
				const scenario = readValue();
				if (
					scenario !== "all" &&
					scenario !== "route-sweep" &&
					scenario !== "terminal-heavy" &&
					scenario !== "workspace-heavy" &&
					scenario !== "workspace-switch" &&
					scenario !== "workspace-switch-heavy"
				) {
					throw new Error(`Invalid scenario for ${arg}: ${scenario}`);
				}
				args.scenario = scenario;
				break;
			}
			case "--iterations":
				args.iterations = readNumber();
				break;
			case "--route-iterations":
				args.routeIterations = readNumber();
				break;
			case "--heavy-iterations":
				args.heavyIterations = readNumber();
				break;
			case "--terminal-iterations":
				args.terminalIterations = readNumber();
				break;
			case "--terminal-tab-count":
				args.terminalTabCount = readNumber();
				break;
			case "--terminal-panes-per-tab":
				args.terminalPanesPerTab = readNumber();
				break;
			case "--terminal-lines":
				args.terminalLines = readNumber();
				break;
			case "--terminal-payload-bytes":
				args.terminalPayloadBytes = readNumber();
				break;
			case "--no-terminal-webgl-loss":
				args.forceTerminalWebglLoss = false;
				break;
			case "--include-terminal-action":
				args.includeTerminalAction = true;
				break;
			case "--profile-cpu":
				args.profileCpu = true;
				break;
			case "--react-probe":
				args.reactProbe = true;
				break;
			case "--progress-every":
				args.progressEvery = readNumber();
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

Run route and workspace action stress:
  bun --cwd apps/desktop stress:renderer -- --port 9333 --scenario all --iterations 1000 --route-iterations 200 --heavy-iterations 300

Options:
  --port <n>                       CDP port. Default: env SUPERSET_RENDERER_STRESS_CDP_PORT or 9333
  --host <host>                    CDP host. Default: 127.0.0.1
  --scenario <name>                workspace-switch, workspace-switch-heavy, route-sweep, workspace-heavy, terminal-heavy, or all. Default: workspace-switch
  --iterations <n>                 Workspace activations. Default: 500
  --route-iterations <n>           Route navigations. Default: --iterations
  --heavy-iterations <n>           Mixed pane/tab/browser/diff actions. Default: min(--iterations, 300)
  --terminal-iterations <n>        Terminal tab switch/write/context-loss cycles. Default: min(--iterations, 200)
  --terminal-tab-count <n>         Synthetic terminal tabs. Default: 24
  --terminal-panes-per-tab <n>     Terminal panes per synthetic tab. Default: 4
                                   Also controls generated tabs/panes for workspace-switch-heavy.
  --terminal-lines <n>             ANSI output lines per terminal write. Default: 40
  --terminal-payload-bytes <n>     Repeated payload bytes per line. Default: 1024
  --no-terminal-webgl-loss         Do not force WEBGL_lose_context during terminal stress
  --include-terminal-action        Include one real backend terminal launch in heavy stress. Default: false
  --profile-cpu                    Capture a CDP CPU profile and print hottest JS frames
  --react-probe                    Capture React commit/component counts via React DevTools hook when available
  --progress-every <n>             Emit progress every n operations. Set 0 to disable. Default: 100
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

function summarizeCpuProfile(
	profile: CpuProfile,
	limit = 30,
): CpuProfileFrameSummary[] {
	const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
	const parentByNodeId = new Map<number, number>();
	for (const node of profile.nodes) {
		if (node.parent != null) parentByNodeId.set(node.id, node.parent);
		for (const childId of node.children ?? []) {
			parentByNodeId.set(childId, node.id);
		}
	}
	const selfTimeByNodeId = new Map<number, number>();
	const sampleCountByNodeId = new Map<number, number>();
	const samples = profile.samples ?? [];
	const timeDeltas = profile.timeDeltas ?? [];

	for (let index = 0; index < samples.length; index += 1) {
		const nodeId = samples[index];
		sampleCountByNodeId.set(nodeId, (sampleCountByNodeId.get(nodeId) ?? 0) + 1);
		selfTimeByNodeId.set(
			nodeId,
			(selfTimeByNodeId.get(nodeId) ?? 0) + (timeDeltas[index] ?? 0) / 1000,
		);
	}

	return Array.from(nodesById.entries())
		.map(([nodeId, node]) => {
			const callFrame = node.callFrame;
			const parent = nodesById.get(parentByNodeId.get(nodeId) ?? -1);
			const parentCallFrame = parent?.callFrame;
			return {
				functionName: callFrame.functionName || "(anonymous)",
				url: callFrame.url || "",
				lineNumber: callFrame.lineNumber ?? 0,
				columnNumber: callFrame.columnNumber ?? 0,
				selfTimeMs: selfTimeByNodeId.get(nodeId) ?? 0,
				sampleCount: sampleCountByNodeId.get(nodeId) ?? node.hitCount ?? 0,
				parentFunctionName: parentCallFrame?.functionName || undefined,
				parentUrl: parentCallFrame?.url || undefined,
				parentLineNumber: parentCallFrame?.lineNumber,
				parentColumnNumber: parentCallFrame?.columnNumber,
			};
		})
		.filter((frame) => frame.selfTimeMs > 0 || frame.sampleCount > 0)
		.sort((left, right) => right.selfTimeMs - left.selfTimeMs)
		.slice(0, limit);
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
	private listeners = new Map<string, Set<(params: unknown) => void>>();

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

	on(method: string, listener: (params: unknown) => void): () => void {
		const listeners = this.listeners.get(method) ?? new Set();
		listeners.add(listener);
		this.listeners.set(method, listeners);
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) {
				this.listeners.delete(method);
			}
		};
	}

	private onMessage(raw: string): void {
		const message = JSON.parse(raw) as CdpResponse;
		if (typeof message.method === "string") {
			const listeners = this.listeners.get(message.method);
			if (listeners) {
				for (const listener of listeners) {
					listener(message.params);
				}
			}
			if (typeof message.id !== "number") return;
		}
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
	scenario: StressScenario;
	iterations: number;
	routeIterations: number;
	heavyIterations: number;
	terminalIterations: number;
	terminalTabCount: number;
	terminalPanesPerTab: number;
	terminalLines: number;
	terminalPayloadBytes: number;
	forceTerminalWebglLoss: boolean;
	includeTerminalAction: boolean;
	reactProbe: boolean;
	progressEvery: number;
	intervalMs: number;
	settleMs: number;
	selector: string;
	workspaceIds: string[];
}): Promise<RendererStressResult> {
	const webglContextRecoverySettleMs = 3500;
	type StressWindow = Window & {
		performance: Performance & {
			memory?: unknown;
		};
	};

	const stressWindow = window as StressWindow;
	const sleep = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));
	const nextFrame = () =>
		new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	const cssEscape =
		stressWindow.CSS?.escape ??
		((value: string) => value.replace(/["\\]/g, "\\$&"));
	const errors: string[] = [];
	const longTasks: RendererStressResult["longTasks"] = [];
	const heartbeatDelaySamples: number[] = [];
	let maxHeartbeatDelayMs = 0;
	let expectedHeartbeat = performance.now() + 50;

	const describeError = (error: unknown): string => {
		if (error instanceof Error) {
			return error.stack ?? error.message;
		}
		if (typeof error === "string") return error;
		return String(error);
	};

	const onError = (event: ErrorEvent) => {
		errors.push(
			event.error
				? describeError(event.error)
				: event.message || "unknown error",
		);
	};
	const onUnhandledRejection = (event: PromiseRejectionEvent) => {
		errors.push(`Unhandled rejection: ${describeError(event.reason)}`);
	};
	const installReactProbe = () => {
		if (!options.reactProbe) {
			return {
				getSummary: () => null,
				cleanup: () => {},
			};
		}

		type ReactFiber = {
			actualDuration?: number;
			child?: ReactFiber | null;
			elementType?: unknown;
			flags?: number;
			sibling?: ReactFiber | null;
			type?: unknown;
		};
		type ReactFiberRoot = { current?: ReactFiber | null };
		type ReactDevToolsHook = {
			onCommitFiberRoot?: (
				rendererId: number,
				root: ReactFiberRoot,
				priorityLevel?: unknown,
				didError?: boolean,
			) => unknown;
		};
		type ReactProbeWindow = Window & {
			__REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHook;
		};

		const hook = (window as ReactProbeWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__;
		if (!hook || typeof hook.onCommitFiberRoot !== "function") {
			return {
				getSummary: () => ({
					available: false,
					reason: "React DevTools global hook is not installed",
				}),
				cleanup: () => {},
			};
		}

		const previousOnCommitFiberRoot = hook.onCommitFiberRoot;
		const componentStats = new Map<
			string,
			{
				commitCount: number;
				maxActualDurationMs: number;
				totalActualDurationMs: number;
			}
		>();
		const recentCommits: Array<{
			componentCount: number;
			durationMs: number;
			fiberCount: number;
			index: number;
			totalActualDurationMs: number;
		}> = [];
		let commitCount = 0;
		let maxCommitDurationMs = 0;

		const getDisplayName = (fiber: ReactFiber): string | null => {
			const candidate = fiber.type ?? fiber.elementType;
			if (typeof candidate === "string") return candidate;
			if (typeof candidate === "function") {
				const named = candidate as { displayName?: string; name?: string };
				return named.displayName ?? named.name ?? null;
			}
			if (candidate && typeof candidate === "object") {
				const named = candidate as {
					displayName?: string;
					name?: string;
					render?: { displayName?: string; name?: string };
				};
				return (
					named.displayName ??
					named.name ??
					named.render?.displayName ??
					named.render?.name ??
					null
				);
			}
			return null;
		};

		const visitFibers = (
			root: ReactFiber | null | undefined,
			visit: (fiber: ReactFiber) => void,
		) => {
			const stack: ReactFiber[] = [];
			const seen = new Set<ReactFiber>();
			if (root) stack.push(root);
			while (stack.length > 0 && seen.size < 20_000) {
				const fiber = stack.pop();
				if (!fiber || seen.has(fiber)) continue;
				seen.add(fiber);
				visit(fiber);
				if (fiber.sibling) stack.push(fiber.sibling);
				if (fiber.child) stack.push(fiber.child);
			}
			return seen.size;
		};

		function onCommitFiberRoot(
			this: unknown,
			rendererId: number,
			root: ReactFiberRoot,
			priorityLevel?: unknown,
			didError?: boolean,
		) {
			const result = previousOnCommitFiberRoot.apply(this, [
				rendererId,
				root,
				priorityLevel,
				didError,
			]);
			const startedAt = performance.now();
			const committedComponents = new Set<string>();
			let totalActualDurationMs = 0;
			const fiberCount = visitFibers(root.current, (fiber) => {
				const name = getDisplayName(fiber);
				if (!name) return;
				const actualDuration =
					typeof fiber.actualDuration === "number" ? fiber.actualDuration : 0;
				const flags = typeof fiber.flags === "number" ? fiber.flags : 0;
				if (actualDuration <= 0 && flags === 0) return;

				committedComponents.add(name);
				totalActualDurationMs += actualDuration;
				const current = componentStats.get(name) ?? {
					commitCount: 0,
					maxActualDurationMs: 0,
					totalActualDurationMs: 0,
				};
				current.commitCount += 1;
				current.totalActualDurationMs += actualDuration;
				current.maxActualDurationMs = Math.max(
					current.maxActualDurationMs,
					actualDuration,
				);
				componentStats.set(name, current);
			});

			commitCount += 1;
			const durationMs = performance.now() - startedAt;
			maxCommitDurationMs = Math.max(maxCommitDurationMs, durationMs);
			recentCommits.push({
				componentCount: committedComponents.size,
				durationMs,
				fiberCount,
				index: commitCount,
				totalActualDurationMs,
			});
			if (recentCommits.length > 50) recentCommits.shift();
			return result;
		}

		hook.onCommitFiberRoot = onCommitFiberRoot;

		return {
			getSummary: () => ({
				available: true,
				commitCount,
				maxCommitDurationMs,
				recentCommits: recentCommits.slice(-10),
				topComponents: Array.from(componentStats.entries())
					.map(([name, stats]) => ({ name, ...stats }))
					.sort((left, right) => {
						const durationDelta =
							right.totalActualDurationMs - left.totalActualDurationMs;
						if (durationDelta !== 0) return durationDelta;
						return right.commitCount - left.commitCount;
					})
					.slice(0, 30),
			}),
			cleanup: () => {
				if (hook.onCommitFiberRoot === onCommitFiberRoot) {
					hook.onCommitFiberRoot = previousOnCommitFiberRoot;
				}
			},
		};
	};

	window.addEventListener("error", onError);
	window.addEventListener("unhandledrejection", onUnhandledRejection);
	const reactProbe = installReactProbe();

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
		if (options.workspaceIds.length > 0) return options.workspaceIds;
		const ids = Array.from(document.querySelectorAll(options.selector))
			.map((element) =>
				element.getAttribute("data-renderer-stress-workspace-id"),
			)
			.filter((value): value is string => !!value);
		return Array.from(new Set(ids));
	};

	const activateWorkspace = async (workspaceId: string) => {
		const target = document.querySelector<HTMLElement>(
			`${options.selector}[data-renderer-stress-workspace-id="${cssEscape(
				workspaceId,
			)}"]`,
		);
		if (target) {
			target.click();
			return "click";
		}
		await navigateTo(`/v2-workspace/${encodeURIComponent(workspaceId)}/`);
		return "navigate";
	};

	type RendererStressBridge = {
		workspaceId: string;
		projectId: string;
		captureBaseline: () => void;
		restoreBaseline: () => void;
		getSummary: () => unknown;
		addTab: (kind: string, index: number, paneCount?: number) => void;
		openPane: (kind: string, index: number) => void;
		splitActivePane: (kind: string, index: number) => void;
		switchTab: (index: number) => void;
		closeActivePane: () => void;
		closeOldestTab: (keepCount?: number) => void;
		churnActivePaneData: (index: number) => void;
		replaceWithGeneratedLayout: (tabCount: number, panesPerTab: number) => void;
		replaceWithGeneratedTerminalLayout: (
			tabCount: number,
			panesPerTab: number,
		) => void;
		replaceWithGeneratedMixedLayout: (
			tabCount: number,
			panesPerTab: number,
		) => void;
		writeTerminalStressOutput: (
			index: number,
			lines: number,
			payloadBytes: number,
		) => Promise<{
			terminalCount: number;
			writtenCount: number;
			failedCount: number;
			byteLength: number;
		}>;
		forceTerminalWebglContextLoss: () => {
			terminalCount: number;
			canvasCount: number;
			webglContextCount: number;
			lostContextCount: number;
			unsupportedContextCount: number;
		};
		getTerminalStressSummary: () => unknown;
		releaseStressTerminalRuntimes: () => void;
		addRealTerminalTab: () => Promise<void>;
		showChangesSidebar: () => void;
	};

	type RendererStressWindow = Window & {
		__SUPERSET_RENDERER_STRESS__?: RendererStressBridge;
		__SUPERSET_RENDERER_STRESS_NAVIGATE__?: (path: string) => Promise<void>;
	};

	const getBridge = () =>
		(window as RendererStressWindow).__SUPERSET_RENDERER_STRESS__ ?? null;

	const waitForBridge = async (workspaceId?: string, attempts = 250) => {
		for (let attempt = 0; attempt < attempts; attempt += 1) {
			const bridge = getBridge();
			if (bridge && (!workspaceId || bridge.workspaceId === workspaceId)) {
				return bridge;
			}
			await sleep(20);
		}
		throw new Error(
			workspaceId
				? `Renderer stress workspace bridge did not mount for ${workspaceId}`
				: "Renderer stress workspace bridge did not mount",
		);
	};

	const navigateTo = async (path: string) => {
		const stressNavigate = (window as RendererStressWindow)
			.__SUPERSET_RENDERER_STRESS_NAVIGATE__;
		if (stressNavigate) {
			await stressNavigate(path);
		} else {
			window.location.hash = path;
		}
		await sleep(options.intervalMs);
	};

	const withTimeout = async <T>(
		promise: Promise<T>,
		timeoutMs: number,
		label: string,
	): Promise<T> => {
		let timer: ReturnType<typeof setTimeout> | null = null;
		try {
			return await Promise.race([
				promise,
				new Promise<T>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
						timeoutMs,
					);
				}),
			]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	};

	const findWorkspaceBridge = async (workspaceIds: string[]) => {
		const failures: string[] = [];
		for (const candidateWorkspaceId of workspaceIds) {
			await navigateTo(
				`/v2-workspace/${encodeURIComponent(candidateWorkspaceId)}/`,
			);
			try {
				const bridge = await waitForBridge(candidateWorkspaceId, 500);
				return { workspaceId: candidateWorkspaceId, bridge };
			} catch (error) {
				failures.push(
					`${candidateWorkspaceId}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		}
		throw new Error(
			`No V2 workspace stress bridge mounted. Tried ${workspaceIds.length} workspace route(s): ${failures.join(
				"; ",
			)}`,
		);
	};

	const buildRoutePaths = (
		targets: string[],
		metadata: { projectId?: string; workspaceId?: string },
	) => {
		const staticPaths = [
			"/",
			"/v2-workspaces/",
			"/workspaces/",
			"/workspace/",
			"/tasks/",
			"/automations/",
			"/settings/",
			"/settings/account/",
			"/settings/agents/",
			"/settings/api-keys/",
			"/settings/appearance/",
			"/settings/behavior/",
			"/settings/billing/",
			"/settings/billing/plans/",
			"/settings/experimental/",
			"/settings/git/",
			"/settings/hosts/",
			"/settings/integrations/",
			"/settings/keyboard/",
			"/settings/links/",
			"/settings/models/",
			"/settings/organization/",
			"/settings/permissions/",
			"/settings/presets/",
			"/settings/projects/",
			"/settings/ringtones/",
			"/settings/security/",
			"/settings/teams/",
			"/settings/terminal/",
			"/setup/adopt-worktrees/",
			"/setup/gh-cli/",
			"/setup/permissions/",
			"/setup/project/",
			"/setup/providers/",
			"/setup/providers/claude-code/",
			"/setup/providers/claude-code/api-key/",
			"/setup/providers/claude-code/custom/",
			"/setup/providers/codex/",
			"/setup/providers/codex/api-key/",
			"/setup/providers/codex/custom/",
			"/welcome/",
			"/new-project/",
		];
		const dynamicPaths = targets.flatMap((workspaceId) => [
			`/v2-workspace/${encodeURIComponent(workspaceId)}/`,
			`/workspace/${encodeURIComponent(workspaceId)}/`,
		]);
		if (metadata.projectId) {
			const projectId = encodeURIComponent(metadata.projectId);
			dynamicPaths.push(
				`/project/${projectId}/`,
				`/settings/projects/${projectId}/`,
				`/settings/project/${projectId}/cloud/`,
				`/settings/project/${projectId}/cloud/secrets/`,
				`/tasks/issue/1/?project=${projectId}`,
				`/tasks/pr/1/?project=${projectId}`,
			);
		}
		return Array.from(new Set([...staticPaths, ...dynamicPaths]));
	};

	const heavyActionCatalogue = [
		"replace generated multi-tab/multi-pane workspace layout",
		"open changes sidebar",
		"create file tabs",
		"create diff tabs",
		"create browser tabs/webviews",
		"create chat tabs",
		"create comment tabs",
		"split active pane with file/diff/browser/chat/comment panes",
		"open panes through same-kind replacement path",
		"rapid tab switching",
		"active pane data churn",
		"close active panes",
		"close old tabs while preserving a warm set",
		...(options.includeTerminalAction
			? ["single real terminal tab launch"]
			: []),
		"synthetic terminal layout with parked xterm runtimes",
		"high-volume terminal ANSI output",
		"forced terminal WebGL context loss and fallback recovery",
		"restore original pane layout",
	];

	const shouldRunWorkspaceSwitch =
		options.scenario === "workspace-switch" ||
		options.scenario === "workspace-switch-heavy" ||
		options.scenario === "all";
	const shouldPrepareHeavyWorkspaceSwitch =
		options.scenario === "workspace-switch-heavy";
	const shouldRunRouteSweep =
		options.scenario === "route-sweep" || options.scenario === "all";
	const shouldRunWorkspaceHeavy =
		options.scenario === "workspace-heavy" || options.scenario === "all";
	const shouldRunTerminalHeavy =
		options.scenario === "terminal-heavy" || options.scenario === "all";

	return (async () => {
		const startedAt = performance.now();
		const startMemory = stressWindow.performance.memory ?? null;
		const targets = getTargets();
		const requiredTargetCount = shouldRunWorkspaceSwitch ? 2 : 1;
		if (targets.length < requiredTargetCount) {
			throw new Error(
				`Need at least ${requiredTargetCount} workspace target(s), found ${targets.length}. Open a workspace list/sidebar or pass --workspace-ids.`,
			);
		}

		const activationModeCounts: Record<string, number> = {};
		const routesVisited: string[] = [];
		const heavyActionCounts: Record<string, number> = {};
		const heavyActionErrors: string[] = [];
		const terminalActionCounts: Record<string, number> = {};
		const terminalActionErrors: string[] = [];
		const terminalWebglContextLosses: TerminalWebglContextLossRecord[] = [];
		const slowOperations: RendererStressResult["slowOperations"] = [];
		const heavyWorkspaceSwitchWorkspaceIds: string[] = [];
		const heavyWorkspaceSwitchSummaries: unknown[] = [];
		let operationCount = 0;
		let workspaceSummary: unknown = null;
		let terminalStressSummary: unknown = null;
		let routeCount = 0;
		const routeIterations =
			options.routeIterations > 0
				? options.routeIterations
				: options.iterations;
		const heavyIterations =
			options.heavyIterations > 0
				? options.heavyIterations
				: Math.min(options.iterations, 300);
		const terminalIterations =
			options.terminalIterations > 0
				? options.terminalIterations
				: Math.min(options.iterations, 200);
		const reportProgress = (
			phase: string,
			index: number,
			total: number,
			force = false,
		) => {
			if (options.progressEvery <= 0 && !force) return;
			if (!force && index % options.progressEvery !== 0) return;
			console.info(
				"[stress:renderer:progress]",
				JSON.stringify({
					phase,
					index,
					total,
					operationCount,
					elapsedMs: Math.round(performance.now() - startedAt),
				}),
			);
		};
		const recordOperationDuration = (
			phase: string,
			label: string,
			index: number,
			startedAt: number,
		) => {
			const durationMs = performance.now() - startedAt;
			if (durationMs < 100) return;
			slowOperations.push({ phase, label, index, durationMs });
		};
		const prepareHeavyWorkspaceSwitchTargets = async () => {
			const tabCount = Math.max(
				1,
				Math.min(40, Math.floor(options.terminalTabCount)),
			);
			const panesPerTab = Math.max(
				1,
				Math.min(8, Math.floor(options.terminalPanesPerTab)),
			);

			reportProgress("workspace-switch-heavy-prepare", 0, targets.length, true);
			for (let index = 0; index < targets.length; index += 1) {
				const target = targets[index];
				await navigateTo(`/v2-workspace/${encodeURIComponent(target)}/`);
				const bridge = await waitForBridge(target, 500);

				let operationStartedAt = performance.now();
				bridge.captureBaseline();
				bridge.replaceWithGeneratedMixedLayout(tabCount, panesPerTab);
				bridge.showChangesSidebar();
				recordOperationDuration(
					"workspace-switch-heavy-prepare",
					`replace-generated-mixed-layout:${target}`,
					index,
					operationStartedAt,
				);
				heavyActionCounts["replace-generated-mixed-layout"] =
					(heavyActionCounts["replace-generated-mixed-layout"] ?? 0) + 1;
				operationCount += 1;

				operationStartedAt = performance.now();
				for (let tabIndex = 0; tabIndex < tabCount; tabIndex += 1) {
					bridge.switchTab(tabIndex);
					await nextFrame();
				}
				recordOperationDuration(
					"workspace-switch-heavy-prepare",
					`warm-generated-tabs:${target}`,
					index,
					operationStartedAt,
				);
				heavyActionCounts["warm-generated-tabs"] =
					(heavyActionCounts["warm-generated-tabs"] ?? 0) + tabCount;
				operationCount += tabCount;

				heavyWorkspaceSwitchWorkspaceIds.push(target);
				heavyWorkspaceSwitchSummaries.push(bridge.getSummary());
				reportProgress(
					"workspace-switch-heavy-prepare",
					index + 1,
					targets.length,
				);
			}
		};
		const restoreHeavyWorkspaceSwitchTargets = async () => {
			for (
				let index = heavyWorkspaceSwitchWorkspaceIds.length - 1;
				index >= 0;
				index -= 1
			) {
				const target = heavyWorkspaceSwitchWorkspaceIds[index];
				const operationStartedAt = performance.now();
				await navigateTo(`/v2-workspace/${encodeURIComponent(target)}/`);
				const bridge = await waitForBridge(target, 500);
				bridge.restoreBaseline();
				recordOperationDuration(
					"workspace-switch-heavy-restore",
					target,
					index,
					operationStartedAt,
				);
			}
		};

		if (shouldPrepareHeavyWorkspaceSwitch) {
			await prepareHeavyWorkspaceSwitchTargets();
			workspaceSummary = {
				preparedWorkspaceSummaries: heavyWorkspaceSwitchSummaries,
			};
		}

		if (shouldRunWorkspaceSwitch) {
			reportProgress("workspace-switch", 0, options.iterations, true);
			for (let index = 0; index < options.iterations; index += 1) {
				const target = targets[index % targets.length];
				const operationStartedAt = performance.now();
				const mode = await activateWorkspace(target);
				recordOperationDuration(
					"workspace-switch",
					`${mode}:${target}`,
					index,
					operationStartedAt,
				);
				activationModeCounts[mode] = (activationModeCounts[mode] ?? 0) + 1;
				operationCount += 1;
				reportProgress("workspace-switch", index + 1, options.iterations);
				await sleep(options.intervalMs);
			}
		}

		if (shouldPrepareHeavyWorkspaceSwitch) {
			await restoreHeavyWorkspaceSwitchTargets();
		}

		let workspaceId = targets[0];
		let metadata: { projectId?: string; workspaceId?: string } = {};
		if (
			shouldRunRouteSweep ||
			shouldRunWorkspaceHeavy ||
			shouldRunTerminalHeavy
		) {
			const mounted = await findWorkspaceBridge(targets);
			workspaceId = mounted.workspaceId;
			const bridge = mounted.bridge;
			metadata = {
				projectId: bridge.projectId,
				workspaceId: bridge.workspaceId,
			};
		}

		if (shouldRunRouteSweep) {
			const routePaths = buildRoutePaths(targets, metadata);
			routeCount = routePaths.length;
			reportProgress("route-sweep", 0, routeIterations, true);
			for (let index = 0; index < routeIterations; index += 1) {
				const routePath = routePaths[index % routePaths.length];
				routesVisited.push(routePath);
				const operationStartedAt = performance.now();
				await navigateTo(routePath);
				recordOperationDuration(
					"route-sweep",
					routePath,
					index,
					operationStartedAt,
				);
				operationCount += 1;
				reportProgress("route-sweep", index + 1, routeIterations);
			}
			await navigateTo(`/v2-workspace/${encodeURIComponent(workspaceId)}/`);
			await waitForBridge(workspaceId);
		}

		if (shouldRunWorkspaceHeavy) {
			const activeBridge = await waitForBridge(workspaceId);
			activeBridge.captureBaseline();
			let operationStartedAt = performance.now();
			activeBridge.replaceWithGeneratedLayout(12, 3);
			recordOperationDuration(
				"workspace-heavy",
				"replace-generated-layout",
				-2,
				operationStartedAt,
			);
			heavyActionCounts["replace-generated-layout"] = 1;
			operationCount += 1;
			operationStartedAt = performance.now();
			activeBridge.showChangesSidebar();
			recordOperationDuration(
				"workspace-heavy",
				"show-changes-sidebar",
				-1,
				operationStartedAt,
			);
			heavyActionCounts["show-changes-sidebar"] = 1;
			operationCount += 1;
			reportProgress("workspace-heavy", 0, heavyIterations, true);

			const paneKinds = ["file", "diff", "browser", "chat", "comment"];
			for (let index = 0; index < heavyIterations; index += 1) {
				const kind = paneKinds[index % paneKinds.length];
				const action = index % 12;
				const operationStartedAt = performance.now();
				let actionLabel = "unknown";
				try {
					if (options.includeTerminalAction && index === 0) {
						actionLabel = "add-real-terminal-tab";
						await withTimeout(
							activeBridge.addRealTerminalTab(),
							3000,
							"add-real-terminal-tab",
						);
						heavyActionCounts["add-real-terminal-tab"] =
							(heavyActionCounts["add-real-terminal-tab"] ?? 0) + 1;
					} else if (action === 0) {
						actionLabel = `add-tab:${kind}`;
						activeBridge.addTab(kind, index, (index % 4) + 1);
						heavyActionCounts["add-tab"] =
							(heavyActionCounts["add-tab"] ?? 0) + 1;
					} else if (action === 1 || action === 2) {
						actionLabel = `split-active-pane:${kind}`;
						activeBridge.splitActivePane(kind, index);
						heavyActionCounts["split-active-pane"] =
							(heavyActionCounts["split-active-pane"] ?? 0) + 1;
					} else if (action === 3) {
						actionLabel = `open-pane:${kind}`;
						activeBridge.openPane(kind, index);
						heavyActionCounts["open-pane"] =
							(heavyActionCounts["open-pane"] ?? 0) + 1;
					} else if (action === 4 || action === 5) {
						actionLabel = "switch-tab";
						activeBridge.switchTab(index);
						heavyActionCounts["switch-tab"] =
							(heavyActionCounts["switch-tab"] ?? 0) + 1;
					} else if (action === 6 || action === 7) {
						actionLabel = "churn-active-pane-data";
						activeBridge.churnActivePaneData(index);
						heavyActionCounts["churn-active-pane-data"] =
							(heavyActionCounts["churn-active-pane-data"] ?? 0) + 1;
					} else if (action === 8) {
						actionLabel = "close-active-pane";
						activeBridge.closeActivePane();
						heavyActionCounts["close-active-pane"] =
							(heavyActionCounts["close-active-pane"] ?? 0) + 1;
					} else if (action === 9) {
						actionLabel = "close-oldest-tab";
						activeBridge.closeOldestTab(10);
						heavyActionCounts["close-oldest-tab"] =
							(heavyActionCounts["close-oldest-tab"] ?? 0) + 1;
					} else {
						actionLabel = `add-single-pane-tab:${kind}`;
						activeBridge.addTab(kind, index);
						heavyActionCounts["add-single-pane-tab"] =
							(heavyActionCounts["add-single-pane-tab"] ?? 0) + 1;
					}
				} catch (error) {
					heavyActionErrors.push(
						`heavy action ${index} failed: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
				}
				recordOperationDuration(
					"workspace-heavy",
					actionLabel,
					index,
					operationStartedAt,
				);
				operationCount += 1;
				reportProgress("workspace-heavy", index + 1, heavyIterations);
				await sleep(options.intervalMs);
			}
			workspaceSummary = activeBridge.getSummary();
			activeBridge.restoreBaseline();
			heavyActionCounts["restore-baseline"] = 1;
			operationCount += 1;
		}

		if (shouldRunTerminalHeavy) {
			const activeBridge = await waitForBridge(workspaceId);
			const terminalTabCount = Math.max(
				1,
				Math.min(80, Math.floor(options.terminalTabCount)),
			);
			const terminalPanesPerTab = Math.max(
				1,
				Math.min(8, Math.floor(options.terminalPanesPerTab)),
			);
			const webglLossCadence = Math.max(4, Math.floor(terminalTabCount / 2));

			activeBridge.captureBaseline();
			try {
				let operationStartedAt = performance.now();
				activeBridge.replaceWithGeneratedTerminalLayout(
					terminalTabCount,
					terminalPanesPerTab,
				);
				await nextFrame();
				recordOperationDuration(
					"terminal-heavy",
					"replace-generated-terminal-layout",
					-1,
					operationStartedAt,
				);
				terminalActionCounts["replace-generated-terminal-layout"] = 1;
				operationCount += 1;
				reportProgress("terminal-heavy", 0, terminalIterations, true);

				for (let index = 0; index < terminalIterations; index += 1) {
					operationStartedAt = performance.now();
					let actionLabel = "switch-write-terminal-output";
					try {
						activeBridge.switchTab(index % terminalTabCount);
						terminalActionCounts["switch-tab"] =
							(terminalActionCounts["switch-tab"] ?? 0) + 1;
						await nextFrame();
						if (options.intervalMs > 0) {
							await sleep(options.intervalMs);
						}

						const writeResult = await withTimeout(
							activeBridge.writeTerminalStressOutput(
								index,
								options.terminalLines,
								options.terminalPayloadBytes,
							),
							15_000,
							"write-terminal-stress-output",
						);
						terminalActionCounts["write-output"] =
							(terminalActionCounts["write-output"] ?? 0) + 1;
						if (
							index >= terminalTabCount &&
							writeResult.failedCount > 0 &&
							terminalActionErrors.length < 20
						) {
							terminalActionErrors.push(
								`terminal write ${index} reached ${writeResult.writtenCount}/${writeResult.terminalCount} runtimes (${writeResult.byteLength} bytes)`,
							);
						}

						if (
							options.forceTerminalWebglLoss &&
							index > 0 &&
							index % webglLossCadence === 0
						) {
							actionLabel = "switch-write-force-webgl-context-loss";
							const lossResult = activeBridge.forceTerminalWebglContextLoss();
							terminalWebglContextLosses.push({
								index,
								...lossResult,
							});
							terminalActionCounts["force-webgl-context-loss"] =
								(terminalActionCounts["force-webgl-context-loss"] ?? 0) + 1;
							operationCount += 1;
						}
					} catch (error) {
						terminalActionErrors.push(
							`terminal action ${index} failed: ${
								error instanceof Error ? error.message : String(error)
							}`,
						);
					}
					recordOperationDuration(
						"terminal-heavy",
						actionLabel,
						index,
						operationStartedAt,
					);
					operationCount += 1;
					reportProgress("terminal-heavy", index + 1, terminalIterations);
				}

				if (
					options.forceTerminalWebglLoss &&
					terminalWebglContextLosses.some(
						(result) => result.lostContextCount > 0,
					)
				) {
					await sleep(webglContextRecoverySettleMs);
				}

				terminalStressSummary = activeBridge.getTerminalStressSummary();
			} finally {
				activeBridge.restoreBaseline();
				terminalActionCounts["restore-baseline"] = 1;
				operationCount += 1;
			}
		}
		await sleep(options.settleMs);

		const durationMs = performance.now() - startedAt;
		const maxLongTaskDurationMs = longTasks.reduce(
			(max, task) => Math.max(max, task.duration),
			0,
		);
		return {
			scenario: options.scenario,
			iterations: options.iterations,
			operationCount,
			targetCount: targets.length,
			activationModeCounts,
			routeCount,
			routeIterations: shouldRunRouteSweep ? routeIterations : 0,
			routesVisited: Array.from(new Set(routesVisited)),
			heavyIterations: shouldRunWorkspaceHeavy ? heavyIterations : 0,
			heavyActionCounts,
			heavyActionErrors: heavyActionErrors.slice(0, 20),
			heavyActionCatalogue,
			terminalIterations: shouldRunTerminalHeavy ? terminalIterations : 0,
			terminalActionCounts,
			terminalActionErrors: terminalActionErrors.slice(0, 20),
			terminalStressSummary,
			terminalWebglContextLosses: terminalWebglContextLosses.slice(-20),
			workspaceSummary,
			reactProbeSummary: reactProbe.getSummary(),
			durationMs,
			maxHeartbeatDelayMs,
			heartbeatDelaySamples: heartbeatDelaySamples.slice(-20),
			maxLongTaskDurationMs,
			longTaskCount: longTasks.length,
			longTasks: longTasks
				.slice()
				.sort((left, right) => right.duration - left.duration)
				.slice(0, 10),
			slowOperations: slowOperations
				.slice()
				.sort((left, right) => right.durationMs - left.durationMs)
				.slice(0, 20),
			errorCount: errors.length,
			errors: errors.slice(0, 20),
			startMemory,
			endMemory: stressWindow.performance.memory ?? null,
			finalLocation: window.location.href,
		};
	})().finally(() => {
		clearInterval(heartbeat);
		reactProbe.cleanup();
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
		const startDomCounters = await cdp
			.send("Memory.getDOMCounters", {}, args.timeoutMs)
			.catch((error) => ({ error: String(error) }));
		if (args.profileCpu) {
			await cdp.send("Profiler.enable", {}, args.timeoutMs);
			await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
			await cdp.send("Profiler.start", {}, args.timeoutMs);
		}
		const removeConsoleListener = cdp.on(
			"Runtime.consoleAPICalled",
			(params) => {
				if (args.json) return;
				const event = params as RuntimeConsoleApiCalledEvent;
				const firstArg = event.args?.[0];
				if (firstArg?.value !== "[stress:renderer:progress]") return;
				const payload = event.args?.[1]?.value;
				if (typeof payload !== "string") return;
				try {
					const progress = JSON.parse(payload) as {
						phase?: string;
						index?: number;
						total?: number;
						operationCount?: number;
						elapsedMs?: number;
					};
					console.log(
						`[stress:renderer] ${progress.phase}: ${progress.index}/${progress.total} operations=${progress.operationCount} elapsed=${progress.elapsedMs}ms`,
					);
				} catch {
					console.log(`[stress:renderer] ${payload}`);
				}
			},
		);
		const evaluation = await cdp.send<RuntimeEvaluateResult>(
			"Runtime.evaluate",
			{
				expression: `(${rendererStress.toString()})(${JSON.stringify({
					scenario: args.scenario,
					iterations: args.iterations,
					routeIterations: args.routeIterations,
					heavyIterations: args.heavyIterations,
					terminalIterations: args.terminalIterations,
					terminalTabCount: args.terminalTabCount,
					terminalPanesPerTab: args.terminalPanesPerTab,
					terminalLines: args.terminalLines,
					terminalPayloadBytes: args.terminalPayloadBytes,
					forceTerminalWebglLoss: args.forceTerminalWebglLoss,
					includeTerminalAction: args.includeTerminalAction,
					reactProbe: args.reactProbe,
					progressEvery: args.progressEvery,
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
		removeConsoleListener();
		const cpuProfileTopFrames = args.profileCpu
			? await cdp
					.send<CpuProfileResult>("Profiler.stop", {}, args.timeoutMs)
					.then((result) =>
						result.profile ? summarizeCpuProfile(result.profile) : [],
					)
					.catch((error) => [{ error: String(error) }])
			: null;

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
		const endDomCounters = await cdp
			.send("Memory.getDOMCounters", {}, args.timeoutMs)
			.catch((error) => ({ error: String(error) }));
		const output = {
			...summary,
			cdpMetrics,
			cdpDomCounters: {
				start: startDomCounters,
				end: endDomCounters,
			},
			cpuProfileTopFrames,
			thresholds: {
				maxHeartbeatDelayMs: args.maxHeartbeatDelayMs,
				maxLongTaskMs: args.maxLongTaskMs,
			},
		};

		const failures: string[] = [];
		if (summary.errorCount > 0) {
			failures.push(`${summary.errorCount} renderer error(s) observed`);
		}
		if (summary.terminalActionErrors.length > 0) {
			failures.push(
				`${summary.terminalActionErrors.length} terminal stress error(s) observed`,
			);
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
