import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Isolate genuine React and owned providers in a child.
import { spawnSync } from "node:child_process";
// biome-ignore lint/style/noRestrictedImports: Own and remove the fixture directory.
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_MANUAL_SUBMIT_FIXTURE !== "1") {
	test("manual submit uses actual React, draft and transport callbacks", () => {
		const cwd = mkdtempSync("/tmp/superset-manual-submit-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_MANUAL_SUBMIT_FIXTURE: "1",
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
			throw Error("Manual submit fetch denied");
		},
		{ preconnect: () => {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before application imports.
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(() => {
		throw Error("Manual submit socket denied");
	});
	const dotenv = {
		config: () => {
			throw Error("Manual submit environment denied");
		},
	};
	mock.module("dotenv", () => dotenv);
	expect((await import("dotenv")).config).toBe(dotenv.config);
	spyOn(Bun, "spawn").mockImplementation(() => {
		throw Error("Manual submit native denied");
	});
	spyOn(Bun, "spawnSync").mockImplementation(() => {
		throw Error("Manual submit native denied");
	});
	const React = await import("react");
	const { renderHook, act, cleanup } = await import("@testing-library/react");
	const { QueryClient, QueryClientProvider, useMutation, useQuery } =
		await import("@tanstack/react-query");
	const queryClients: InstanceType<typeof QueryClient>[] = [];
	const { createTRPCClient } = await import("@trpc/client");
	const { observable } = await import("@trpc/server/observable");
	const HostContext = React.createContext({
		machineId: "machine",
		activeHostUrl: "http://owned-host.invalid",
		activeOrganizationId: "org",
	});
	const hostBoundary = {
		useLocalHostService: () => React.useContext(HostContext),
	};
	mock.module(
		"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
		() => hostBoundary,
	);
	mock.module("renderer/hooks/useAcpChatEnabled", () => ({
		useAwaitAcpChatEnabled: () => async () => false,
	}));
	mock.module(
		"renderer/routes/_authenticated/providers/CollectionsProvider",
		() => ({
			useCollections: () => ({}),
		}),
	);
	mock.module("renderer/hooks/useActiveOrganizationId", () => ({
		useActiveOrganizationId: () =>
			React.useContext(HostContext).activeOrganizationId,
	}));
	mock.module("renderer/hooks/useRelayUrl", () => ({
		useRelayUrl: () => "https://relay.invalid",
	}));
	const errors: string[] = [];
	mock.module("@superset/ui/sonner", () => ({
		toast: { error: (message: string) => errors.push(message) },
	}));
	mock.module("@lingui/react/macro", () => ({
		Trans: ({ children }: { children?: import("react").ReactNode }) => children,
		useLingui: () => ({ t: (value: { message: string }) => value.message }),
	}));
	const navigations: unknown[] = [];
	mock.module("@tanstack/react-router", () => ({
		useNavigate: () => async (value: unknown) => {
			navigations.push(value);
		},
		useMatchRoute: () => () => false,
	}));
	const submissions: Array<{
		hostId: string;
		snapshot: { pr?: number; expectedPullRequest?: unknown };
	}> = [];
	const submit = (value: (typeof submissions)[number]) => {
		submissions.push(value);
		return {
			workspaceId: "created",
			completed: Promise.resolve({ ok: true, workspaceId: "created" }),
		};
	};
	const submitBoundary = { useWorkspaceCreates: () => ({ submit }) };
	mock.module("renderer/stores/workspace-creates", () => submitBoundary);
	const cloudCreates: unknown[] = [];
	const nativeCloudProject = {
		connectionId: "cloud-connection",
		projectId: "17",
		pathWithNamespace: "Acme/Team/Widget",
		cloneUrl: "https://git.fixture.invalid/Acme/Team/Widget.git",
		defaultBranch: "release",
	};
	const nativeEnvironment = {
		id: "native-environment",
		sandboxReady: true,
		repositories: [],
		gitlabProject: nativeCloudProject,
	};
	const githubEnvironment = {
		id: "environment",
		sandboxReady: true,
		repositories: [{ repoUrl: "https://github.com/acme/repo" }],
	};
	type EnvironmentFixture = typeof githubEnvironment | typeof nativeEnvironment;
	let displayedEnvironments: EnvironmentFixture[] = [githubEnvironment],
		freshEnvironments: EnvironmentFixture[] = [githubEnvironment];
	let environmentBlock: Promise<void> | undefined,
		createBlock: Promise<void> | undefined,
		cancelBlock: Promise<void> | undefined,
		listBlock: Promise<void> | undefined;
	let createError: Error | undefined, listError: Error | undefined;
	const cloudListCalls: unknown[] = [],
		cacheSeeds: unknown[] = [];
	const cloudMutation = {
		mutateAsync: async (input: unknown) => {
			cloudCreates.push(input);
			await createBlock;
			if (createError) throw createError;
			return { id: "cloud-created" };
		},
	};
	const cloudUtils = {
		cloudWorkspace: {
			list: {
				cancel: async () => {
					await cancelBlock;
				},
				setData: (input: unknown) => {
					cacheSeeds.push(input);
				},
				invalidate: async () => {},
			},
		},
	};
	mock.module("renderer/lib/cloud-trpc", () => ({
		cloudTrpc: {
			environment: {
				list: {
					useQuery: (
						input: { organizationId: string },
						options: { enabled: boolean },
					) =>
						useQuery({
							queryKey: ["fixture-cloud-environments", input.organizationId],
							enabled: options.enabled,
							staleTime: Infinity,
							queryFn: async () => {
								await listBlock;
								if (listError) throw listError;
								return displayedEnvironments;
							},
						}),
				},
			},
			cloudWorkspace: {
				create: {
					useMutation: () =>
						useMutation({ mutationFn: cloudMutation.mutateAsync }),
				},
			},
			useUtils: () => cloudUtils,
		},
		cloudTrpcClient: {
			environment: {
				list: {
					query: async (input: unknown) => {
						cloudListCalls.push(input);
						await environmentBlock;
						return freshEnvironments;
					},
				},
			},
		},
	}));
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
	let acknowledgement: unknown = expected;
	let blockPreflight: Promise<void> | undefined;
	const calls: Array<{ url: string; path: string; input: unknown }> = [];
	let url = "";
	const client = createTRPCClient({
		links: [
			() =>
				({ op }) =>
					observable((observer) => {
						calls.push({ url, path: op.path, input: op.input });
						void (blockPreflight ?? Promise.resolve()).then(() => {
							observer.next({
								result: {
									data: {
										workspaceId: "ignored-existing",
										...(acknowledgement === undefined
											? {}
											: { validatedPullRequest: acknowledgement }),
									},
								},
							});
							observer.complete();
						});
					}),
		],
	});
	const clientBoundary = {
		getHostServiceClientByUrl: (target: string) => {
			url = target;
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
			(await import("renderer/stores/workspace-creates")).useWorkspaceCreates,
			submitBoundary.useWorkspaceCreates,
		),
	).toBe(true);
	const { useNewWorkspaceDraftStore } = await import(
		"renderer/stores/new-workspace-draft"
	);
	const { DashboardNewWorkspaceDraftProvider } = await import(
		"../../../../../DashboardNewWorkspaceDraftContext"
	);
	const { useSubmitWorkspace } = await import("./useSubmitWorkspace");
	let hostValue = {
		machineId: "machine",
		activeHostUrl: "http://owned-host.invalid",
		activeOrganizationId: "org",
	};
	let closed = 0;
	let uploadBlock: Promise<void> | undefined;
	let promptBlock: Promise<void> | undefined;
	let promptError: Error | undefined;
	const uploads = {
		awaitUploads: async () => {
			await uploadBlock;
			return {
				readyIds: ["attachment"],
				ready: [
					{
						attachmentId: "attachment",
						name: "owned.txt",
						mimeType: "text/plain",
					},
				],
				errors: [],
			};
		},
	};
	const prompt = {
		build: async () => {
			await promptBlock;
			if (promptError) throw promptError;
			return "owned contextual prompt";
		},
	};
	function seed(url = expected.expectedUrl) {
		useNewWorkspaceDraftStore.getState().updateDraft({
			selectedProjectId: "project",
			hostId: "machine",
			prompt: "owned prompt",
			linkedPR: { prNumber: 7, title: "MR title", url, state: "open" },
		});
	}
	function mount() {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		});
		queryClients.push(queryClient);
		queryClient.setQueryData(
			["fixture-cloud-environments", hostValue.activeOrganizationId],
			displayedEnvironments,
		);
		return renderHook(
			({ projectId }) =>
				useSubmitWorkspace(
					projectId,
					"claude",
					null,
					null,
					null,
					null,
					uploads,
					prompt,
				),
			{
				initialProps: { projectId: "project" },
				wrapper: ({ children }) =>
					React.createElement(
						QueryClientProvider,
						{ client: queryClient },
						React.createElement(
							HostContext.Provider,
							{ value: hostValue },
							React.createElement(
								DashboardNewWorkspaceDraftProvider,
								{
									onClose: () => {
										closed++;
									},
								},
								children,
							),
						),
					),
			},
		);
	}
	afterEach(() => {
		cleanup();
		for (const client of queryClients) client.clear();
		queryClients.length = 0;
		useNewWorkspaceDraftStore.getState().resetDraft();
		submissions.length = 0;
		errors.length = 0;
		calls.length = 0;
		navigations.length = 0;
		cloudCreates.length = 0;
		cloudListCalls.length = 0;
		cacheSeeds.length = 0;
		displayedEnvironments = [githubEnvironment];
		freshEnvironments = [githubEnvironment];
		environmentBlock = undefined;
		createBlock = undefined;
		cancelBlock = undefined;
		listBlock = undefined;
		createError = undefined;
		listError = undefined;
		acknowledgement = expected;
		blockPreflight = undefined;
		uploadBlock = undefined;
		promptBlock = undefined;
		promptError = undefined;
		closed = 0;
		hostValue = {
			machineId: "machine",
			activeHostUrl: "http://owned-host.invalid",
			activeOrganizationId: "org",
		};
	});
	test("valid nested case-sensitive custom-port GL uses same complete preflight object and snapshot", async () => {
		seed();
		const { result } = mount();
		await act(async () => {
			await result.current.submitWorkspace();
		});
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			url: "http://owned-host.invalid",
			path: "pullRequests.getLinkedWorkspace",
			input: {
				projectId: "project",
				prNumber: 7,
				expectedPullRequest: expected,
			},
		});
		expect(submissions).toHaveLength(1);
		expect(submissions[0]?.snapshot).toMatchObject({
			pr: 7,
			expectedPullRequest: expected,
		});
		expect(submissions[0]?.snapshot.expectedPullRequest).toBe(
			(calls[0]?.input as { expectedPullRequest: unknown }).expectedPullRequest,
		);
		expect(closed).toBe(1);
		expect(navigations).toHaveLength(1);
	});
	for (const ack of [
		undefined,
		{ provider: "gitlab" },
		{ ...expected, host: "git.example.test:9443" },
		{ ...expected, owner: "acme/Team" },
		{ ...expected, projectId: "foreign" },
		{ ...expected, pullNumber: 8 },
		{
			...expected,
			expectedUrl: "https://foreign.test/Acme/Team/Widget/-/merge_requests/7",
		},
	])
		test(`refuses incomplete or mismatched acknowledgement ${JSON.stringify(ack)}`, async () => {
			seed();
			acknowledgement = ack;
			const { result } = mount();
			await act(async () => {
				await result.current.submitWorkspace();
			});
			expect(submissions).toEqual([]);
			expect(navigations).toEqual([]);
			expect(closed).toBe(0);
			expect(useNewWorkspaceDraftStore.getState().linkedPR?.url).toBe(
				expected.expectedUrl,
			);
			expect(errors).toHaveLength(1);
		});
	for (const change of ["project", "host", "pr", "checkout", "prompt", "reset"])
		test(`draft ${change} change during preflight cannot submit stale GL`, async () => {
			seed();
			let release!: () => void;
			blockPreflight = new Promise((resolve) => {
				release = resolve;
			});
			const { result } = mount();
			let pending!: Promise<void>;
			await act(async () => {
				pending = result.current.submitWorkspace();
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
			act(() => {
				if (change === "reset")
					useNewWorkspaceDraftStore.getState().resetDraft();
				else
					useNewWorkspaceDraftStore.getState().updateDraft(
						change === "project"
							? { selectedProjectId: "foreign" }
							: change === "host"
								? { hostId: "foreign" }
								: change === "pr"
									? {
											linkedPR: {
												prNumber: 8,
												title: "Other",
												url: expected.expectedUrl.replace(/7$/, "8"),
												state: "open",
											},
										}
									: change === "checkout"
										? { checkout: "local" }
										: { prompt: "changed" },
					);
			});
			await act(async () => {
				release();
				await pending;
			});
			expect(submissions).toEqual([]);
			expect(navigations).toEqual([]);
			expect(closed).toBe(0);
		});
	for (const phase of ["upload", "prompt"])
		test(`selection changed during ${phase} remains unsubmitted`, async () => {
			seed();
			let release!: () => void;
			const block = new Promise<void>((resolve) => {
				release = resolve;
			});
			if (phase === "upload") uploadBlock = block;
			else promptBlock = block;
			const { result } = mount();
			let pending!: Promise<void>;
			await act(async () => {
				pending = result.current.submitWorkspace();
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
			act(() =>
				useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "foreign" }),
			);
			await act(async () => {
				release();
				await pending;
			});
			expect(submissions).toEqual([]);
			expect(navigations).toEqual([]);
			expect(closed).toBe(0);
		});
	for (const url of [
		"https://git.example.test:8443/Acme/Team/Widget/-/merge_requests/8",
		"https://user@git.example.test:8443/Acme/Team/Widget/-/merge_requests/7",
		"https://git.example.test:8443/Acme/%2e%2e/Widget/-/merge_requests/7",
	])
		test(`malformed or wrong IID GL URL refuses ${url}`, async () => {
			seed(url);
			const { result } = mount();
			await act(async () => {
				await result.current.submitWorkspace();
			});
			expect(submissions).toEqual([]);
			expect(closed).toBe(0);
			expect(navigations).toEqual([]);
		});
	for (const field of [
		"activeOrganizationId",
		"activeHostUrl",
		"machineId",
		"projectId",
	])
		test(`live ${field} change during preflight refuses`, async () => {
			seed();
			let release!: () => void;
			blockPreflight = new Promise((resolve) => {
				release = resolve;
			});
			const { result, rerender } = mount();
			let pending!: Promise<void>;
			await act(async () => {
				pending = result.current.submitWorkspace();
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
			act(() => {
				if (field !== "projectId")
					hostValue = { ...hostValue, [field]: "foreign" };
				rerender({ projectId: field === "projectId" ? "foreign" : "project" });
			});
			await act(async () => {
				release();
				await pending;
			});
			expect(submissions).toEqual([]);
			expect(navigations).toEqual([]);
			expect(closed).toBe(0);
		});
	test("attachment readiness updates during upload keep the selected GL intent", async () => {
		seed();
		useNewWorkspaceDraftStore.getState().updateDraft({
			attachments: [
				{
					localId: "owned",
					state: "uploading",
					file: { name: "owned.txt", size: 1, mediaType: "text/plain" },
				},
			],
		});
		let release!: () => void;
		uploadBlock = new Promise((resolve) => {
			release = resolve;
		});
		const { result } = mount();
		let pending!: Promise<void>;
		await act(async () => {
			pending = result.current.submitWorkspace();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		act(() =>
			useNewWorkspaceDraftStore.getState().updateDraft({
				attachments: [
					{
						localId: "owned",
						state: "ready",
						attachmentId: "attachment",
						file: { name: "owned.txt", size: 1, mediaType: "text/plain" },
					},
				],
			}),
		);
		await act(async () => {
			release();
			await pending;
		});
		expect(submissions).toHaveLength(1);
		expect(submissions[0]?.snapshot.expectedPullRequest).toEqual(expected);
	});
	for (const change of ["add", "remove", "replace", "file"])
		test(`attachment ${change} while preflight is pending cannot send stale upload IDs`, async () => {
			seed();
			const original = {
				localId: "owned",
				state: "uploading" as const,
				file: { name: "owned.txt", size: 1, mediaType: "text/plain" },
			};
			useNewWorkspaceDraftStore
				.getState()
				.updateDraft({ attachments: [original] });
			let release!: () => void;
			blockPreflight = new Promise((resolve) => {
				release = resolve;
			});
			const { result } = mount();
			let pending!: Promise<void>;
			await act(async () => {
				pending = result.current.submitWorkspace();
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
			const other = { ...original, localId: "other" };
			act(() =>
				useNewWorkspaceDraftStore.getState().updateDraft({
					attachments:
						change === "add"
							? [original, other]
							: change === "remove"
								? []
								: change === "replace"
									? [other]
									: [
											{
												...original,
												file: { ...original.file, name: "replaced.txt" },
											},
										],
				}),
			);
			await act(async () => {
				release();
				await pending;
			});
			expect(submissions).toEqual([]);
			expect(navigations).toEqual([]);
			expect(closed).toBe(0);
		});
	test("attachment removal while upload is pending cannot submit old ready IDs", async () => {
		seed();
		useNewWorkspaceDraftStore.getState().updateDraft({
			attachments: [
				{
					localId: "owned",
					state: "uploading",
					file: { name: "owned.txt", size: 1, mediaType: "text/plain" },
				},
			],
		});
		let release!: () => void;
		uploadBlock = new Promise((resolve) => {
			release = resolve;
		});
		const { result } = mount();
		let pending!: Promise<void>;
		await act(async () => {
			pending = result.current.submitWorkspace();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		act(() =>
			useNewWorkspaceDraftStore.getState().updateDraft({ attachments: [] }),
		);
		await act(async () => {
			release();
			await pending;
		});
		expect(submissions).toEqual([]);
		expect(calls).toEqual([]);
		expect(closed).toBe(0);
	});

	test("remote manual preflight uses the exact store routing resolver target", async () => {
		seed();
		useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "remote" });
		const { result } = mount();
		await act(async () => {
			await result.current.submitWorkspace();
		});
		const { resolveHostUrl } = await import(
			"renderer/hooks/host-service/useHostTargetUrl"
		);
		expect(
			Object.is(
				calls[0]?.url,
				resolveHostUrl({
					hostId: "remote",
					machineId: "machine",
					activeHostUrl: "http://owned-host.invalid",
					organizationId: "org",
					relayUrl: "https://relay.invalid",
				}),
			),
		).toBe(true);
		expect(submissions[0]?.hostId).toBe("remote");
	});
	test("session retains ordinary path without preflight", async () => {
		useNewWorkspaceDraftStore.getState().selectSession();
		const { result } = mount();
		await act(async () => {
			await result.current.submitWorkspace();
		});
		expect(calls).toEqual([]);
		expect(submissions[0]?.snapshot).toMatchObject({ projectId: null });
		expect(submissions[0]?.snapshot).not.toHaveProperty("expectedPullRequest");
	});
	test("cloud GL-linked draft retains API-only path without native preflight", async () => {
		seed();
		useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "cloud" });
		const { result } = mount();
		await act(async () => {
			await result.current.submitWorkspace();
		});
		expect(calls).toEqual([]);
		expect(submissions).toEqual([]);
		expect(cloudCreates).toHaveLength(1);
		expect(closed).toBe(1);
	});

	test("ordinary GH keeps original snapshot and no preflight", async () => {
		seed("https://github.com/Acme/Widget/pull/7");
		const { result } = mount();
		await act(async () => {
			await result.current.submitWorkspace();
		});
		expect(calls).toEqual([]);
		expect(submissions).toHaveLength(1);
		expect(submissions[0]?.snapshot.pr).toBe(7);
		expect(submissions[0]?.snapshot).not.toHaveProperty("expectedPullRequest");
		expect(closed).toBe(1);
	});
	test("failed GL issue verification shows an error without creating or clearing the draft", async () => {
		seed();
		useNewWorkspaceDraftStore.getState().updateDraft({
			linkedPR: null,
			linkedIssues: [
				{
					source: "gitlab",
					slug: "gitlab-reference",
					title: "Native issue",
					number: 7,
					url: "https://git.example.test/Group/Repo/-/issues/7",
				},
			],
		});
		promptError = Error("GitLab issue content could not be verified");
		const { result } = mount();
		await act(async () => {
			await result.current.submitWorkspace();
		});
		expect(submissions).toEqual([]);
		expect(cloudCreates).toEqual([]);
		expect(errors).toEqual(["GitLab issue content could not be verified"]);
		expect(closed).toBe(0);
		expect(result.current.isCreating).toBe(false);
		promptError = undefined;
		await act(async () => {
			await result.current.submitWorkspace();
		});
		expect(submissions).toHaveLength(1);
		expect(closed).toBe(1);
	});
	test("GH context errors retain the original rejection behavior", async () => {
		seed("https://github.com/Acme/Widget/pull/7");
		promptError = Error("Original GH failure");
		const { result } = mount();
		await act(async () => {
			await expect(result.current.submitWorkspace()).rejects.toThrow(
				"Original GH failure",
			);
		});
		expect(errors).toEqual([]);
		expect(submissions).toEqual([]);
	});
	test("review retained GL submit refuses changed organization before invocation", async () => {
		seed();
		const view = mount();
		const retained = view.result.current.submitWorkspace;
		hostValue = { ...hostValue, activeOrganizationId: "other-org" };
		view.rerender({ projectId: "project" });
		await act(async () => {
			await retained();
		});
		expect(submissions).toHaveLength(0);
		expect(closed).toBe(0);
		expect(calls).toHaveLength(0);
	});
	test("review retained GL submit refuses changed host before invocation", async () => {
		seed();
		const view = mount();
		const retained = view.result.current.submitWorkspace;
		hostValue = {
			...hostValue,
			activeHostUrl: "http://other-owned-host.invalid",
		};
		view.rerender({ projectId: "project" });
		await act(async () => {
			await retained();
		});
		expect(submissions).toHaveLength(0);
		expect(closed).toBe(0);
		expect(calls).toHaveLength(0);
	});
	function seedNativeCloud() {
		displayedEnvironments = [nativeEnvironment];
		freshEnvironments = [nativeEnvironment];
		useNewWorkspaceDraftStore.getState().updateDraft({
			selectedProjectId: null,
			hostId: "cloud",
			environmentId: "native-environment",
			prompt: "owned cloud prompt",
			baseBranch: "feature/native",
			linkedPR: null,
		});
	}
	const deferred = () => {
		let release!: () => void;
		const promise = new Promise<void>((resolve) => {
			release = resolve;
		});
		return { promise, release };
	};
	test("native cloud create carries exact current organization environment clone and selected branch", async () => {
		seedNativeCloud();
		const view = mount();
		await act(async () => {
			await view.result.current.submitWorkspace();
		});
		expect(cloudCreates).toHaveLength(1);
		expect(cloudCreates[0]).toMatchObject({
			organizationId: "org",
			environmentId: "native-environment",
			gitlabCloneUrl: nativeCloudProject.cloneUrl,
			branch: "feature/native",
			attachmentFileIds: ["attachment"],
			agent: "claude",
		});
		expect(cloudListCalls).toEqual([{ organizationId: "org" }]);
		expect(submissions).toEqual([]);
		expect(calls).toEqual([]);
		expect(closed).toBe(1);
		expect(navigations).toHaveLength(1);
	});
	test("native cloud branch action uses captured selection instead of the independently rendered draft branch", async () => {
		seedNativeCloud();
		const view = mount();
		await act(async () => {
			await view.result.current.submitWorkspace({
				branch: "feature/captured",
				organizationId: "org",
				environmentId: "native-environment",
				project: nativeCloudProject,
			});
		});
		expect(cloudCreates).toHaveLength(1);
		expect(cloudCreates[0]).toMatchObject({
			branch: "feature/captured",
			organizationId: "org",
			environmentId: "native-environment",
			gitlabCloneUrl: nativeCloudProject.cloneUrl,
		});
		expect(useNewWorkspaceDraftStore.getState().baseBranch).not.toBe(
			"feature/captured",
		);
		expect(submissions).toEqual([]);
	});
	for (const change of [
		"organization",
		"environment",
		"connection",
		"project",
		"clone",
		"path",
	])
		test(`native cloud captured branch action refuses mismatched ${change}`, async () => {
			seedNativeCloud();
			const view = mount();
			const selection = {
				branch: "feature/captured",
				organizationId: change === "organization" ? "other-org" : "org",
				environmentId:
					change === "environment" ? "other-environment" : "native-environment",
				project: {
					...nativeCloudProject,
					...(change === "connection"
						? { connectionId: "other" }
						: change === "project"
							? { projectId: "18" }
							: change === "clone"
								? { cloneUrl: "https://git.fixture.invalid/Other/Repo.git" }
								: change === "path"
									? { pathWithNamespace: "Other/Repo" }
									: {}),
				},
			};
			await act(async () => {
				await view.result.current.submitWorkspace(selection);
			});
			expect(cloudCreates).toEqual([]);
			expect(closed).toBe(0);
			expect(navigations).toEqual([]);
		});
	for (const change of ["environment", "organization", "host", "unmount"])
		for (const phase of ["upload", "list", "prompt"])
			test(`native cloud ${change} during ${phase} cannot dispatch old owner`, async () => {
				seedNativeCloud();
				const hold = deferred();
				if (phase === "upload") uploadBlock = hold.promise;
				else if (phase === "list") environmentBlock = hold.promise;
				else promptBlock = hold.promise;
				const view = mount();
				let pending!: Promise<void>;
				await act(async () => {
					pending = view.result.current.submitWorkspace();
					await new Promise((resolve) => setTimeout(resolve, 5));
				});
				act(() => {
					if (change === "unmount") view.unmount();
					else if (change === "organization") {
						hostValue = { ...hostValue, activeOrganizationId: "other-org" };
						view.rerender({ projectId: "project" });
					} else
						useNewWorkspaceDraftStore
							.getState()
							.updateDraft(
								change === "environment"
									? { environmentId: "other-environment" }
									: { hostId: "other-host" },
							);
				});
				await act(async () => {
					hold.release();
					await pending;
				});
				expect(cloudCreates).toEqual([]);
				expect(closed).toBe(0);
				expect(navigations).toEqual([]);
			});
	for (const change of ["missing", "clone", "connection", "project", "path"])
		test(`fresh native environment ${change} refuses binding substitution`, async () => {
			seedNativeCloud();
			freshEnvironments =
				change === "missing"
					? [{ ...nativeEnvironment, id: "other-environment" }]
					: [
							{
								...nativeEnvironment,
								gitlabProject: {
									...nativeCloudProject,
									...(change === "clone"
										? { cloneUrl: "https://git.fixture.invalid/Other/Repo.git" }
										: change === "connection"
											? { connectionId: "other-connection" }
											: change === "project"
												? { projectId: "18" }
												: { pathWithNamespace: "Other/Repo" }),
								},
							},
						];
			const view = mount();
			await act(async () => {
				await view.result.current.submitWorkspace();
			});
			expect(cloudCreates).toEqual([]);
			expect(closed).toBe(0);
			expect(navigations).toEqual([]);
		});
	test("retained native submit cannot dispatch after organization change or unmount", async () => {
		seedNativeCloud();
		const view = mount();
		const retained = view.result.current.submitWorkspace;
		hostValue = { ...hostValue, activeOrganizationId: "other-org" };
		view.rerender({ projectId: "project" });
		await act(async () => {
			await retained();
		});
		expect(cloudCreates).toEqual([]);
		view.unmount();
		await retained();
		expect(cloudCreates).toEqual([]);
		expect(closed).toBe(0);
	});
	for (const phase of ["mutation", "cancel"])
		for (const change of ["organization", "environment", "unmount"])
			test(`native success deferred at ${phase} preserves new ${change} owner`, async () => {
				seedNativeCloud();
				const hold = deferred();
				if (phase === "mutation") createBlock = hold.promise;
				else cancelBlock = hold.promise;
				const view = mount();
				let pending!: Promise<void>;
				await act(async () => {
					pending = view.result.current.submitWorkspace();
					await new Promise((resolve) => setTimeout(resolve, 5));
				});
				expect(cloudCreates).toHaveLength(1);
				act(() => {
					if (change === "unmount") view.unmount();
					else if (change === "organization") {
						hostValue = { ...hostValue, activeOrganizationId: "other-org" };
						view.rerender({ projectId: "project" });
					} else
						useNewWorkspaceDraftStore.getState().updateDraft({
							environmentId: "other-environment",
							prompt: "new draft",
						});
				});
				await act(async () => {
					hold.release();
					await pending;
				});
				expect(closed).toBe(0);
				expect(navigations).toEqual([]);
				expect(cacheSeeds).toEqual([]);
				if (change === "environment")
					expect(useNewWorkspaceDraftStore.getState().prompt).toBe("new draft");
			});
	test("native error for an old owner does not report against the replacement draft", async () => {
		seedNativeCloud();
		const hold = deferred();
		createBlock = hold.promise;
		createError = Error("Old owner create error");
		const view = mount();
		let pending!: Promise<void>;
		await act(async () => {
			pending = view.result.current.submitWorkspace();
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
		act(() =>
			useNewWorkspaceDraftStore
				.getState()
				.updateDraft({ environmentId: "other-environment" }),
		);
		await act(async () => {
			hold.release();
			await pending;
		});
		expect(errors).toEqual([]);
		expect(closed).toBe(0);
	});
	test("native binding refetch and query error refuse while preserving the current draft", async () => {
		seedNativeCloud();
		const view = mount();
		const hold = deferred();
		listBlock = hold.promise;
		listError = Error("Owned query error");
		let pending!: Promise<void>;
		await act(async () => {
			pending = queryClients[0].refetchQueries();
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
		await act(async () => {
			await view.result.current.submitWorkspace();
		});
		expect(cloudCreates).toEqual([]);
		await act(async () => {
			hold.release();
			await pending;
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
		await act(async () => {
			await view.result.current.submitWorkspace();
		});
		expect(cloudCreates).toEqual([]);
		expect(closed).toBe(0);
	});
	for (const phase of ["prompt", "create", "error"])
		test(`GitHub cloud ${phase} pending cannot dispatch completion against a replacement native environment`, async () => {
			useNewWorkspaceDraftStore.getState().updateDraft({
				selectedProjectId: null,
				hostId: "cloud",
				environmentId: "environment",
				prompt: "old GH prompt",
				baseBranch: "gh-feature",
				linkedPR: null,
			});
			const hold = deferred();
			if (phase === "prompt") promptBlock = hold.promise;
			else createBlock = hold.promise;
			if (phase === "error") createError = Error("Old GH owner create error");
			const view = mount();
			let pending!: Promise<void>;
			await act(async () => {
				pending = view.result.current.submitWorkspace();
				await new Promise((resolve) => setTimeout(resolve, 5));
			});
			act(() => {
				for (const client of queryClients)
					client.setQueryData(
						["fixture-cloud-environments", "org"],
						[nativeEnvironment],
					);
				useNewWorkspaceDraftStore.getState().updateDraft({
					environmentId: "native-environment",
					prompt: "new native draft",
					baseBranch: null,
				});
				view.rerender({ projectId: "project" });
			});
			await act(async () => {
				hold.release();
				await pending;
			});
			expect(cloudCreates).toHaveLength(phase === "prompt" ? 0 : 1);
			expect(cacheSeeds).toEqual([]);
			expect(closed).toBe(0);
			expect(navigations).toEqual([]);
			expect(errors).toEqual([]);
			expect(useNewWorkspaceDraftStore.getState().prompt).toBe(
				"new native draft",
			);
		});
	test("GitHub cloud body and success flow retain original fields without clone override", async () => {
		useNewWorkspaceDraftStore.getState().updateDraft({
			selectedProjectId: null,
			hostId: "cloud",
			environmentId: "environment",
			prompt: "GH cloud prompt",
			baseBranch: "gh-feature",
			linkedPR: null,
		});
		const view = mount();
		await act(async () => {
			await view.result.current.submitWorkspace();
		});
		expect(cloudCreates).toHaveLength(1);
		expect(cloudCreates[0]).toMatchObject({
			organizationId: "org",
			environmentId: "environment",
			branch: "gh-feature",
		});
		expect(cloudCreates[0]).not.toHaveProperty("gitlabCloneUrl");
		expect(closed).toBe(1);
		expect(navigations).toHaveLength(1);
	});
}
