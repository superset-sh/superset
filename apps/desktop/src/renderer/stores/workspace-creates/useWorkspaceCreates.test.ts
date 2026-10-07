import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Isolate actual React and owned transports in a test child.
import { spawnSync } from "node:child_process";
// biome-ignore lint/style/noRestrictedImports: Own and remove the fixture working directory.
import { mkdtempSync, rmSync } from "node:fs";
import type { FailedWorkspaceCreateRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

if (process.env.SUPERSET_CREATE_OUTCOME_FIXTURE !== "1") {
	test("actual workspace create callbacks retain identity and truthful outcomes", () => {
		const cwd = mkdtempSync("/tmp/superset-create-outcome-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_CREATE_OUTCOME_FIXTURE: "1",
					},
					timeout: 20000,
					stdio: "pipe",
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 25000);
} else {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Create outcome fetch denied");
		},
		{ preconnect: () => {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before application imports.
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(() => {
		throw Error("Create outcome socket denied");
	});
	const dotenv = {
		config: () => {
			throw Error("Create outcome environment file denied");
		},
	};
	mock.module("dotenv", () => dotenv);
	expect((await import("dotenv")).config).toBe(dotenv.config);
	spyOn(Bun, "spawn").mockImplementation(() => {
		throw Error("Create outcome native process denied");
	});
	spyOn(Bun, "spawnSync").mockImplementation(() => {
		throw Error("Create outcome native process denied");
	});
	const React = await import("react");
	const { renderHook, act, cleanup } = await import("@testing-library/react");
	const { createTRPCClient, TRPCClientError } = await import("@trpc/client");
	const { observable } = await import("@trpc/server/observable");
	type Row = {
		id?: string;
		workspaceId?: string;
		input?: unknown;
		error?: string;
		paneLayout?: unknown;
		sidebarState?: {
			projectId: string | null;
			sectionId: null;
			tabOrder: number;
			isHidden: boolean;
		};
	} & Pick<FailedWorkspaceCreateRow, "retryBlocked" | "recoveryWorkspaceId">;
	function collection() {
		const state = new Map<string, Row>();
		return {
			state,
			get: (id: string) => state.get(id),
			insert: (row: Row) => state.set(row.id ?? row.workspaceId ?? "", row),
			delete: (id: string) => state.delete(id),
			update: (id: string, mutate: (row: Row) => void) => {
				const row = state.get(id);
				if (row) mutate(row);
			},
		};
	}
	const collections = {
		failedWorkspaceCreates: collection(),
		v2WorkspaceLocalState: collection(),
		v2SidebarSections: collection(),
		v2TerminalPresets: collection(),
	};
	const cacheRows = new Set<string>();
	const removals: string[] = [];
	const cache = {
		upsertWorkspace: (row: { id: string }) => cacheRows.add(row.id),
		removeWorkspace: (_host: string, id: string) => {
			removals.push(id);
			cacheRows.delete(id);
		},
	};
	const HostContext = React.createContext({
		machineId: "machine",
		activeHostUrl: "http://owned-host.invalid",
		activeOrganizationId: "org",
	});
	const hostBoundary = {
		useLocalHostService: () => React.useContext(HostContext),
	};
	const collectionsBoundary = { useCollections: () => collections };
	const workspaceBoundary = { useHostWorkspaces: () => ({ cache }) };
	const orgBoundary = {
		useActiveOrganizationId: () =>
			React.useContext(HostContext).activeOrganizationId,
	};
	mock.module(
		"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
		() => hostBoundary,
	);
	mock.module(
		"renderer/routes/_authenticated/providers/CollectionsProvider",
		() => collectionsBoundary,
	);
	mock.module(
		"renderer/routes/_authenticated/providers/HostWorkspacesProvider",
		() => workspaceBoundary,
	);
	mock.module("renderer/hooks/useActiveOrganizationId", () => orgBoundary);
	mock.module("renderer/hooks/useRelayUrl", () => ({
		useRelayUrl: () => "https://relay.invalid",
	}));
	mock.module("renderer/lib/auth-client", () => ({
		authClient: { useSession: () => ({ data: { user: { id: "user" } } }) },
	}));
	let waitSetting: boolean | undefined = false;
	mock.module("renderer/lib/electron-trpc", () => ({
		electronTrpc: {
			settings: {
				getWaitForSetupBeforeAgent: { useQuery: () => ({ data: waitSetting }) },
			},
		},
	}));
	mock.module("renderer/lib/trpc-client", () => ({
		electronTrpcClient: {
			settings: { getWaitForSetupBeforeAgent: { query: async () => true } },
		},
	}));
	const i18n = new Proxy(
		{},
		{
			get: (_target, key) =>
				key === "_"
					? (value: { message?: string; id?: string }) =>
							value.message ?? value.id
					: () => {},
		},
	);
	mock.module("@superset/i18n", () => ({ i18n }));
	mock.module("@lingui/core/macro", () => ({ msg: (value: unknown) => value }));
	let eventListener:
		| ((workspaceId: string, value: unknown) => void)
		| undefined;
	let retains = 0;
	const bus = {
		retain: () => {
			retains++;
			return () => {
				retains--;
			};
		},
		on: (_event: string, _id: string, listener: typeof eventListener) => {
			eventListener = listener;
			return () => {
				eventListener = undefined;
			};
		},
	};
	const busBoundary = { getHostEventBus: () => bus };
	mock.module("renderer/lib/host-event-bus", () => busBoundary);
	let mode = "success";
	let rowProbe = "exists";
	let linkedWorkspaceId: string | null = null;
	let linkedReadStalled = false;
	let agents: Array<
		| { ok: true; kind: "terminal"; sessionId: string; label: string }
		| { ok: false; error: string }
	> = [{ ok: true, kind: "terminal", sessionId: "agent", label: "Agent" }];
	const calls: Array<{ path: string; input: unknown; url: string }> = [];
	let currentUrl = "";
	const client = createTRPCClient({
		links: [
			() =>
				({ op }) =>
					observable((observer) => {
						calls.push({ path: op.path, input: op.input, url: currentUrl });
						if (
							op.path === "pullRequests.getLinkedWorkspace" &&
							linkedReadStalled
						) {
							op.signal?.addEventListener(
								"abort",
								() =>
									observer.error(
										new TRPCClientError("Owned linkage deadline", {
											cause: op.signal?.reason,
										}),
									),
								{ once: true },
							);
							return;
						}

						if (op.path === "workspaces.createEnqueued" && mode === "missing") {
							observer.error(
								new TRPCClientError(
									"No procedure found on path workspaces.createEnqueued",
								),
							);
							return;
						}
						if (
							op.path === "workspaces.createEnqueued" &&
							mode === "accepted-reset"
						) {
							observer.error(
								new TRPCClientError("Owned response connection reset", {
									cause: new TypeError("ECONNRESET"),
								}),
							);
							return;
						}
						const input = op.input as { id: string; projectId?: string };
						let data: unknown = {};
						if (op.path === "pullRequests.getLinkedWorkspace")
							data = { workspaceId: linkedWorkspaceId };
						if (op.path === "workspace.get") {
							if (rowProbe === "unknown") {
								observer.error(new TRPCClientError("Owned row probe failed"));
								return;
							}
							data =
								rowProbe === "absent" ||
								(rowProbe === "canonical-only" && input.id !== "canonical")
									? null
									: { id: input.id };
						}
						if (
							op.path === "workspaces.create" ||
							op.path === "workspaces.createSession"
						)
							data = {
								workspace: { id: input.id, projectId: input.projectId ?? null },
								terminals: [],
								agents: [],
								alreadyExists: false,
							};
						observer.next({ result: { data } });
						observer.complete();
						if (op.path.endsWith("Enqueued") && mode !== "lost")
							queueMicrotask(() =>
								eventListener?.(
									input.id,
									mode === "refused"
										? {
												ok: false,
												error: "Owned delivery refused after create",
											}
										: {
												ok: true,
												projectId: input.projectId,
												terminals: [],
												agents,
												alreadyExists: mode === "adopted",
											},
								),
							);
					}),
		],
	});
	const clientBoundary = {
		getHostServiceClientByUrl: (url: string) => {
			currentUrl = url;
			return client;
		},
	};
	mock.module("renderer/lib/host-service-client", () => clientBoundary);
	expect(
		Object.is(
			(await import("renderer/lib/host-service-client"))
				.getHostServiceClientByUrl,
			clientBoundary.getHostServiceClientByUrl,
		),
	).toBe(true);
	expect(
		Object.is(
			(await import("renderer/lib/host-event-bus")).getHostEventBus,
			busBoundary.getHostEventBus,
		),
	).toBe(true);
	const { useWorkspaceCreates } = await import("./useWorkspaceCreates");
	const expected = {
		provider: "gitlab" as const,
		projectId: "project",
		host: "git.example.test:8443",
		owner: "Acme/Team",
		repo: "Widget",
		pullNumber: 7,
		expectedUrl:
			"https://git.example.test:8443/Acme/Team/Widget/-/merge_requests/7",
	};
	function snapshot(bound = true) {
		return {
			id: "workspace",
			projectId: "project",
			pr: 7,
			agents: [{ agent: "claude" as const, prompt: "owned prompt" }],
			...(bound ? { expectedPullRequest: expected } : {}),
		};
	}
	function mount() {
		return renderHook(() => useWorkspaceCreates());
	}
	afterEach(() => {
		cleanup();
		mode = "success";
		rowProbe = "exists";
		linkedWorkspaceId = null;
		linkedReadStalled = false;
		agents = [
			{ ok: true, kind: "terminal", sessionId: "agent", label: "Agent" },
		];
		waitSetting = false;
		calls.length = 0;
		removals.length = 0;
		cacheRows.clear();
		for (const item of Object.values(collections)) item.state.clear();
		expect(retains).toBe(0);
	});
	test("bound successful event retains full identity and settings through actual enqueue", async () => {
		waitSetting = undefined;
		const { result } = mount();
		const input = snapshot();
		let handle!: ReturnType<typeof result.current.submit>;
		act(() => {
			handle = result.current.submit({ hostId: "machine", snapshot: input });
		});
		expect(await handle.completed).toEqual({
			ok: true,
			workspaceId: "workspace",
		});
		const sent = calls.find(
			(item) => item.path === "workspaces.createEnqueued",
		)?.input;
		expect(sent).toMatchObject({ ...input, waitForSetupBeforeAgents: true });
		expect((sent as typeof input).expectedPullRequest).toBe(expected);
		expect(collections.v2WorkspaceLocalState.get("workspace")).toBeDefined();
	});
	test("bound refused agent is visible without removing the real workspace or replaying", async () => {
		agents = [{ ok: false, error: "Owned delivery refused" }];
		const { result } = mount();
		const handle = result.current.submit({
			hostId: "machine",
			snapshot: snapshot(),
		});
		expect(await handle.completed).toEqual({
			ok: false,
			error: "Owned delivery refused",
		});
		expect(
			collections.failedWorkspaceCreates.get("workspace")?.input,
		).toMatchObject({ expectedPullRequest: expected });
		expect(collections.v2WorkspaceLocalState.get("workspace")).toBeDefined();
		expect(removals).toEqual([]);
		expect(
			calls.filter((item) => item.path === "workspaces.createEnqueued"),
		).toHaveLength(1);
	});
	test("bound old host refuses rather than legacy synchronous fallback", async () => {
		mode = "missing";
		const { result } = mount();
		const handle = result.current.submit({
			hostId: "machine",
			snapshot: snapshot(),
		});
		expect((await handle.completed).ok).toBe(false);
		expect(calls.some((item) => item.path === "workspaces.create")).toBe(false);
	});
	for (const bound of [true, false])
		test(`${bound ? "bound" : "ordinary GH"} lost event with real row preserves workspace and reports delivery truthfully`, async () => {
			mode = "lost";
			const realTimer = globalThis.setTimeout;
			const timer = spyOn(globalThis, "setTimeout").mockImplementation(((
				callback: TimerHandler,
				delay?: number,
				...args: unknown[]
			) =>
				realTimer(
					callback,
					delay === 600000 ? 1 : delay,
					...args,
				)) as typeof setTimeout);
			try {
				const { result } = mount();
				const handle = result.current.submit({
					hostId: "machine",
					snapshot: snapshot(bound),
				});
				const outcome = await handle.completed;
				expect(outcome.ok).toBe(!bound);
				expect(
					collections.v2WorkspaceLocalState.get("workspace"),
				).toBeDefined();
				expect(removals).toEqual([]);
				expect(
					calls.filter((item) => item.path === "workspaces.createEnqueued"),
				).toHaveLength(1);
				if (bound) {
					expect(
						collections.failedWorkspaceCreates.get("workspace")?.error,
					).toBeTruthy();
					expect(
						collections.failedWorkspaceCreates.get("workspace"),
					).toHaveProperty("retryBlocked", true);
					await result.current.submit({
						hostId: "machine",
						snapshot: snapshot(),
					}).completed;
					expect(
						calls.filter((item) => item.path === "workspaces.createEnqueued"),
					).toHaveLength(1);
				}
			} finally {
				timer.mockRestore();
			}
		});
	test("lost bound settlement recovers existing canonical workspace and cannot replay delivery", async () => {
		mode = "lost";
		rowProbe = "canonical-only";
		linkedWorkspaceId = "canonical";
		const realTimer = globalThis.setTimeout;
		const timer = spyOn(globalThis, "setTimeout").mockImplementation(((
			callback: TimerHandler,
			delay?: number,
			...args: unknown[]
		) =>
			realTimer(
				callback,
				delay === 600000 ? 1 : delay,
				...args,
			)) as typeof setTimeout);
		try {
			const { result } = mount();
			const input = snapshot();
			expect(
				(
					await result.current.submit({ hostId: "machine", snapshot: input })
						.completed
				).ok,
			).toBe(false);
			expect(collections.failedWorkspaceCreates.get("workspace")).toMatchObject(
				{ retryBlocked: true, recoveryWorkspaceId: "canonical" },
			);
			const lookup = calls.find(
				(item) => item.path === "pullRequests.getLinkedWorkspace",
			);
			expect(lookup?.input).toMatchObject({
				projectId: "project",
				prNumber: expected.pullNumber,
				expectedPullRequest: expected,
			});
			await result.current.submit({ hostId: "machine", snapshot: input })
				.completed;
			expect(
				calls.filter((item) => item.path === "workspaces.createEnqueued"),
			).toHaveLength(1);
		} finally {
			timer.mockRestore();
		}
	});
	test("accepted bound enqueue with transport reset cannot replay its prompt", async () => {
		mode = "accepted-reset";
		rowProbe = "canonical-only";
		linkedWorkspaceId = "canonical";
		const { result } = mount();
		const input = snapshot();
		expect(
			(
				await result.current.submit({ hostId: "machine", snapshot: input })
					.completed
			).ok,
		).toBe(false);
		expect(collections.failedWorkspaceCreates.get("workspace")).toMatchObject({
			retryBlocked: true,
			recoveryWorkspaceId: "canonical",
		});
		await result.current.submit({ hostId: "machine", snapshot: input })
			.completed;
		expect(
			calls.filter((item) => item.path === "workspaces.createEnqueued"),
		).toHaveLength(1);
	});
	test("uncertain delivery linkage recovery has a deadline and never unlocks replay", async () => {
		mode = "accepted-reset";
		rowProbe = "absent";
		linkedReadStalled = true;
		const deadline = spyOn(AbortSignal, "timeout").mockImplementation(() => {
			const control = new AbortController();
			setTimeout(
				() => control.abort(new DOMException("Owned deadline", "TimeoutError")),
				1,
			);
			return control.signal;
		});
		try {
			const { result } = mount();
			const input = snapshot();
			expect(
				(
					await result.current.submit({ hostId: "machine", snapshot: input })
						.completed
				).ok,
			).toBe(false);
			expect(
				collections.failedWorkspaceCreates.get("workspace")?.retryBlocked,
			).toBe(true);
			await result.current.submit({ hostId: "machine", snapshot: input })
				.completed;
			expect(
				calls.filter((item) => item.path === "workspaces.createEnqueued"),
			).toHaveLength(1);
		} finally {
			deadline.mockRestore();
		}
	});
	test("ordinary GH missing procedure retains exact fallback snapshot", async () => {
		mode = "missing";
		const { result } = mount();
		const input = snapshot(false);
		expect(
			await result.current.submit({ hostId: "machine", snapshot: input })
				.completed,
		).toEqual({ ok: true, workspaceId: "workspace" });
		expect(calls.find((item) => item.path === "workspaces.create")?.input).toBe(
			input,
		);
	});
	test("ordinary GH agent refusal retains existing success outcome", async () => {
		agents = [{ ok: false, error: "Owned GH refusal" }];
		const { result } = mount();
		expect(
			await result.current.submit({
				hostId: "machine",
				snapshot: snapshot(false),
			}).completed,
		).toEqual({ ok: true, workspaceId: "workspace" });
	});
	test("bound partial agent launch keeps recovery and blocks whole-create replay", async () => {
		agents = [
			{ ok: true, kind: "terminal", sessionId: "agent-a", label: "Agent A" },
			{ ok: false, error: "Owned agent B launch failure" },
		];
		const { result } = mount();
		const input = {
			...snapshot(),
			agents: [
				{ agent: "claude" as const, prompt: "A" },
				{ agent: "claude" as const, prompt: "B" },
			],
		};
		expect(
			await result.current.submit({ hostId: "machine", snapshot: input })
				.completed,
		).toEqual({ ok: false, error: "Owned agent B launch failure" });
		expect(collections.failedWorkspaceCreates.get("workspace")).toMatchObject({
			retryBlocked: true,
			recoveryWorkspaceId: "workspace",
		});
		expect(collections.v2WorkspaceLocalState.get("workspace")).toBeDefined();
		await result.current.submit({ hostId: "machine", snapshot: input })
			.completed;
		expect(
			calls.filter((item) => item.path === "workspaces.createEnqueued"),
		).toHaveLength(1);
	});
	test("bound already-existing empty descriptors cannot acknowledge a new prompt", async () => {
		mode = "adopted";
		agents = [];
		const { result } = mount();
		const outcome = await result.current.submit({
			hostId: "machine",
			snapshot: snapshot(),
		}).completed;
		expect(outcome).toEqual({
			ok: false,
			error: "Workspace creation result could not be confirmed",
		});
		expect(collections.v2WorkspaceLocalState.get("workspace")).toBeDefined();
		expect(removals).toEqual([]);
	});
	test("failed bound settlement recovers different canonical workspace without replay", async () => {
		mode = "refused";
		rowProbe = "canonical-only";
		linkedWorkspaceId = "canonical";
		const { result } = mount();
		const input = snapshot();
		expect(
			await result.current.submit({ hostId: "machine", snapshot: input })
				.completed,
		).toEqual({ ok: false, error: "Owned delivery refused after create" });
		expect(collections.failedWorkspaceCreates.get("workspace")).toMatchObject({
			retryBlocked: true,
			recoveryWorkspaceId: "canonical",
		});
		expect(collections.v2WorkspaceLocalState.get("canonical")).toBeDefined();
		await result.current.submit({ hostId: "machine", snapshot: input })
			.completed;
		expect(
			calls.filter((item) => item.path === "workspaces.createEnqueued"),
		).toHaveLength(1);
	});
	for (const probe of ["exists", "unknown", "absent"])
		test(`bound refused settlement with ${probe} row probe preserves truthful recovery`, async () => {
			mode = "refused";
			rowProbe = probe;
			const { result } = mount();
			const input = snapshot();
			const outcome = await result.current.submit({
				hostId: "machine",
				snapshot: input,
			}).completed;
			expect(outcome).toEqual({
				ok: false,
				error: "Owned delivery refused after create",
			});
			expect(collections.failedWorkspaceCreates.get("workspace")?.input).toBe(
				input,
			);
			expect(Boolean(collections.v2WorkspaceLocalState.get("workspace"))).toBe(
				probe !== "absent",
			);
			expect(removals).toEqual(probe === "absent" ? ["workspace"] : []);
			expect(
				collections.failedWorkspaceCreates.get("workspace")?.retryBlocked,
			).toBe(true);
			await result.current.submit({ hostId: "machine", snapshot: input })
				.completed;
			expect(
				calls.filter((item) => item.path === "workspaces.createEnqueued"),
			).toHaveLength(1);
		});
	test("bound existing checkout without requested agents needs no delivery descriptor", async () => {
		mode = "adopted";
		agents = [];
		const { result } = mount();
		expect(
			await result.current.submit({
				hostId: "machine",
				snapshot: { ...snapshot(), agents: [] },
			}).completed,
		).toEqual({ ok: true, workspaceId: "workspace" });
	});

	test("session uses original createSession payload and no enqueue", async () => {
		const { result } = mount();
		expect(
			await result.current.submit({
				hostId: "machine",
				snapshot: { id: "session", projectId: null, name: "Session" },
			}).completed,
		).toEqual({ ok: true, workspaceId: "session" });
		expect(calls).toEqual([
			{
				path: "workspaces.createSession",
				input: { id: "session", name: "Session" },
				url: "http://owned-host.invalid",
			},
		]);
	});
}
