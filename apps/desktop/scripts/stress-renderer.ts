#!/usr/bin/env bun

interface Args {
	host: string;
	port: number;
	scenario: StressScenario;
	iterations: number;
	routeIterations: number;
	heavyIterations: number;
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
	| "workspace-heavy"
	| "workspace-switch";

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
	workspaceSummary: unknown;
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
		scenario: "workspace-switch",
		iterations: 500,
		routeIterations: 0,
		heavyIterations: 0,
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
					scenario !== "workspace-heavy" &&
					scenario !== "workspace-switch"
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
  --scenario <name>                workspace-switch, route-sweep, workspace-heavy, or all. Default: workspace-switch
  --iterations <n>                 Workspace activations. Default: 500
  --route-iterations <n>           Route navigations. Default: --iterations
  --heavy-iterations <n>           Mixed pane/tab/browser/diff actions. Default: min(--iterations, 300)
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
	scenario: StressScenario;
	iterations: number;
	routeIterations: number;
	heavyIterations: number;
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
		addRealTerminalTab: () => Promise<void>;
	};

	const getBridge = () =>
		(
			window as Window & {
				__SUPERSET_RENDERER_STRESS__?: RendererStressBridge;
			}
		).__SUPERSET_RENDERER_STRESS__ ?? null;

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
		window.location.hash = path;
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
				const bridge = await waitForBridge(candidateWorkspaceId, 75);
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
		"single real terminal tab launch",
		"restore original pane layout",
	];

	const shouldRunWorkspaceSwitch =
		options.scenario === "workspace-switch" || options.scenario === "all";
	const shouldRunRouteSweep =
		options.scenario === "route-sweep" || options.scenario === "all";
	const shouldRunWorkspaceHeavy =
		options.scenario === "workspace-heavy" || options.scenario === "all";

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
		let operationCount = 0;
		let workspaceSummary: unknown = null;
		let routeCount = 0;
		const routeIterations =
			options.routeIterations > 0
				? options.routeIterations
				: options.iterations;
		const heavyIterations =
			options.heavyIterations > 0
				? options.heavyIterations
				: Math.min(options.iterations, 300);

		if (shouldRunWorkspaceSwitch) {
			for (let index = 0; index < options.iterations; index += 1) {
				const target = targets[index % targets.length];
				const mode = activateWorkspace(target);
				activationModeCounts[mode] = (activationModeCounts[mode] ?? 0) + 1;
				operationCount += 1;
				await sleep(options.intervalMs);
			}
		}

		let workspaceId = targets[0];
		let metadata: { projectId?: string; workspaceId?: string } = {};
		if (shouldRunRouteSweep || shouldRunWorkspaceHeavy) {
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
			for (let index = 0; index < routeIterations; index += 1) {
				const routePath = routePaths[index % routePaths.length];
				routesVisited.push(routePath);
				await navigateTo(routePath);
				operationCount += 1;
			}
			await navigateTo(`/v2-workspace/${encodeURIComponent(workspaceId)}/`);
			await waitForBridge(workspaceId);
		}

		if (shouldRunWorkspaceHeavy) {
			const activeBridge = await waitForBridge(workspaceId);
			activeBridge.captureBaseline();
			activeBridge.replaceWithGeneratedLayout(12, 3);
			heavyActionCounts["replace-generated-layout"] = 1;
			operationCount += 1;

			const paneKinds = ["file", "diff", "browser", "chat", "comment"];
			for (let index = 0; index < heavyIterations; index += 1) {
				const kind = paneKinds[index % paneKinds.length];
				const action = index % 12;
				try {
					if (index === 0) {
						await withTimeout(
							activeBridge.addRealTerminalTab(),
							3000,
							"add-real-terminal-tab",
						);
						heavyActionCounts["add-real-terminal-tab"] =
							(heavyActionCounts["add-real-terminal-tab"] ?? 0) + 1;
					} else if (action === 0) {
						activeBridge.addTab(kind, index, (index % 4) + 1);
						heavyActionCounts["add-tab"] =
							(heavyActionCounts["add-tab"] ?? 0) + 1;
					} else if (action === 1 || action === 2) {
						activeBridge.splitActivePane(kind, index);
						heavyActionCounts["split-active-pane"] =
							(heavyActionCounts["split-active-pane"] ?? 0) + 1;
					} else if (action === 3) {
						activeBridge.openPane(kind, index);
						heavyActionCounts["open-pane"] =
							(heavyActionCounts["open-pane"] ?? 0) + 1;
					} else if (action === 4 || action === 5) {
						activeBridge.switchTab(index);
						heavyActionCounts["switch-tab"] =
							(heavyActionCounts["switch-tab"] ?? 0) + 1;
					} else if (action === 6 || action === 7) {
						activeBridge.churnActivePaneData(index);
						heavyActionCounts["churn-active-pane-data"] =
							(heavyActionCounts["churn-active-pane-data"] ?? 0) + 1;
					} else if (action === 8) {
						activeBridge.closeActivePane();
						heavyActionCounts["close-active-pane"] =
							(heavyActionCounts["close-active-pane"] ?? 0) + 1;
					} else if (action === 9) {
						activeBridge.closeOldestTab(10);
						heavyActionCounts["close-oldest-tab"] =
							(heavyActionCounts["close-oldest-tab"] ?? 0) + 1;
					} else {
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
				operationCount += 1;
				await sleep(options.intervalMs);
			}
			workspaceSummary = activeBridge.getSummary();
			activeBridge.restoreBaseline();
			heavyActionCounts["restore-baseline"] = 1;
			operationCount += 1;
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
			workspaceSummary,
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
					scenario: args.scenario,
					iterations: args.iterations,
					routeIterations: args.routeIterations,
					heavyIterations: args.heavyIterations,
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
