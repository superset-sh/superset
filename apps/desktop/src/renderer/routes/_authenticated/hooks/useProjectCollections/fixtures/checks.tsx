import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type {
	ProjectCollectionPendingDelete,
	ProjectCollectionPendingPresentation,
	ProjectCollectionPlacement,
} from "shared/project-collections";

const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const target = {
	organizationId: "org",
	machineId: "local",
	hostUrl: "local" as string | null,
	isLocal: true,
};
const { normalizeHostProjectRow } = await import(
	"renderer/hooks/host-projects/useHostProjects/useHostProjects.utils"
);
let projectSignature = "";
let mergedProjects: ReturnType<typeof normalizeHostProjectRow>[] = [];
const projectHosts = [
	{
		target,
		reachable: true,
		rows: [] as ReturnType<typeof normalizeHostProjectRow>[],
	},
];
let sidebarProjects: Array<{
	projectId: string;
	tabOrder: number;
	isHidden: boolean;
}> = [];
let folderHosts: import("renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils").HostTagFoldersResult[] =
	[
		{
			target,
			status: "ready",
			settings: [
				{
					scope: "projects",
					tag: "team",
					displayName: "Team",
					color: null,
					tabOrder: 0,
				},
				{
					scope: "projects",
					tag: "other",
					displayName: "Other",
					color: null,
					tabOrder: 1,
				},
			],
		},
	];
let placements: ProjectCollectionPlacement[] = [
	{ key: "projects:team", kind: "collection", tabOrder: 0, isCollapsed: true },
	{
		key: "projects:other",
		kind: "collection",
		tabOrder: 1,
		isCollapsed: false,
	},
];
let update: (rows: ProjectCollectionPlacement[]) => void;
let release: () => void;
let reconcileStarted = false;
let organizationId = "org";
const reconciliations: Array<{ organizationId: string; keys: string[] }> = [];
const reconcileGate = new Promise<void>((resolve) => {
	release = resolve;
});
const localInvalidations: string[] = [];
let pending: ProjectCollectionPendingDelete[] = [];
let presentations: ProjectCollectionPendingPresentation[] = [];
let presentationsUpdate: (rows: ProjectCollectionPendingPresentation[]) => void;
const presentationUtils = {
	getData: () => presentations,
	setData: (
		_scope: unknown,
		value:
			| ProjectCollectionPendingPresentation[]
			| ((
					rows: ProjectCollectionPendingPresentation[],
			  ) => ProjectCollectionPendingPresentation[]),
	) => {
		presentations = typeof value === "function" ? value(presentations) : value;
		presentationsUpdate([...presentations]);
	},
	invalidate: async () => presentationsUpdate([...presentations]),
};
let pendingUpdate: (rows: ProjectCollectionPendingDelete[]) => void;
const pendingUtils = {
	getData: () => pending,
	setData: (
		_scope: unknown,
		value:
			| ProjectCollectionPendingDelete[]
			| ((
					rows: ProjectCollectionPendingDelete[],
			  ) => ProjectCollectionPendingDelete[]),
	) => {
		pending = typeof value === "function" ? value(pending) : value;
		pendingUpdate([...pending]);
	},
	invalidate: async () => pendingUpdate([...pending]),
};
const write = {
	mutateAsync: async ({
		rows,
		pendingDeletes = [],
		removePendingDeleteTags = [],
		pendingPresentations = [],
		clearPendingSettings = [],
	}: {
		rows: ProjectCollectionPlacement[];
		pendingDeletes?: ProjectCollectionPendingDelete[];
		removePendingDeleteTags?: string[];
		pendingPresentations?: ProjectCollectionPendingPresentation[];
		clearPendingSettings?: ProjectCollectionPendingDelete[];
	}) => {
		const matches = (
			row: ProjectCollectionPendingDelete,
			changes: ProjectCollectionPendingDelete[],
		) =>
			changes.some(
				(change) =>
					change.machineId === row.machineId && change.tag === row.tag,
			);
		presentations = [
			...presentations.filter(
				(row) =>
					!matches(row, clearPendingSettings) &&
					!matches(row, pendingDeletes) &&
					!matches(row, pendingPresentations),
			),
			...pendingPresentations,
		];
		placements = rows;
		pending = [
			...pending.filter(
				(row) =>
					!removePendingDeleteTags.includes(row.tag) &&
					!matches(row, clearPendingSettings) &&
					!matches(row, pendingPresentations) &&
					!matches(row, pendingDeletes),
			),
			...pendingDeletes,
		];
	},
};
const reconcile = {
	mutateAsync: async (input: { organizationId: string; keys: string[] }) => {
		reconciliations.push(input);
		reconcileStarted = true;
		await reconcileGate;
	},
};
const listUtils = {
	cancel: async () => {},
	getData: () => placements,
	setData: (_scope: unknown, rows: ProjectCollectionPlacement[]) => {
		placements = rows;
		update(rows);
	},
	invalidate: async () => {
		localInvalidations.push("placements");
		update(placements);
	},
};
const utils = {
	projectCollections: {
		list: listUtils,
		pendingDeletes: pendingUtils,
		pendingPresentations: presentationUtils,
	},
};
mock.module("@tanstack/react-db", () => ({
	useLiveQuery: () => ({ data: sidebarProjects }),
}));
mock.module("renderer/hooks/host-projects/useHostProjects", () => ({
	useHostProjects: () => {
		const signature = JSON.stringify(projectHosts);
		if (signature !== projectSignature) {
			mergedProjects = projectHosts.flatMap((host) => host.rows);
			projectSignature = signature;
		}
		return {
			projects: mergedProjects,
			hostResults: projectHosts,
			isReady: true,
		};
	},
}));
mock.module("renderer/hooks/host-projects/useHostTagFolders", () => ({
	useHostTagFolders: () => ({ hostResults: folderHosts, isReady: true }),
}));
const setHideEmptyProjectCollections = () => {};
const emptyWorkspaces: never[] = [];
mock.module("renderer/hooks/useV2UserPreferences", () => ({
	useV2UserPreferences: () => ({
		preferences: {
			sidebarProjectSortMode: "manual",
			hideEmptyProjectCollections: false,
		},
		setHideEmptyProjectCollections,
	}),
}));
mock.module("renderer/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: { user: { id: "alice" } } }) },
}));
mock.module(
	"renderer/routes/_authenticated/providers/CollectionsProvider",
	() => ({ useCollections: () => ({}) }),
);
mock.module(
	"renderer/routes/_authenticated/providers/HostWorkspacesProvider",
	() => ({
		useHostWorkspaces: () => ({ workspaces: emptyWorkspaces, isReady: false }),
	}),
);
mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({ activeOrganizationId: organizationId }),
	}),
);
let settingGate: Promise<void> | null = null;
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: (url: string) => ({
		tagFolders: {
			replayPresentation: {
				mutate: async (
					setting: (typeof folderHosts)[number]["settings"][number],
				) => {
					const host = folderHosts.find((host) => host.target.hostUrl === url);
					if (!host || host.status !== "ready") throw new Error("Offline host");
					host.settings = [
						...host.settings.filter((row) => row.tag !== setting.tag),
						setting,
					];
					return { tagSettings: host.settings };
				},
			},
			upsert: {
				mutate: async (
					setting: (typeof folderHosts)[number]["settings"][number],
				) => {
					if (settingGate) await settingGate;
					const host = folderHosts.find((host) => host.target.hostUrl === url);
					if (!host || host.status !== "ready") throw new Error("Offline host");
					host.settings = [
						...host.settings.filter(
							(row) => row.scope !== setting.scope || row.tag !== setting.tag,
						),
						setting,
					];
				},
			},
			delete: {
				mutate: async ({
					tag,
					deletedAt,
				}: {
					tag: string;
					deletedAt?: number;
				}) => {
					const host = folderHosts.find((host) => host.target.hostUrl === url);
					if (!host) throw new Error("Offline host");
					host.settings = host.settings.filter(
						(row) =>
							row.tag !== tag ||
							(deletedAt !== undefined &&
								row.updatedAt !== undefined &&
								row.updatedAt > deletedAt),
					);
					return { tagSettings: host.settings };
				},
			},
		},
	}),
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		projectCollections: {
			pendingPresentations: {
				useQuery: () => {
					const [data, setData] = useState(presentations);
					presentationsUpdate = setData;
					return { data, isSuccess: true };
				},
			},
			acknowledgePresentations: {
				useMutation: () => ({
					mutateAsync: async ({
						rows,
					}: {
						rows: ProjectCollectionPendingPresentation[];
					}) => {
						presentations = presentations.filter(
							(entry) =>
								!rows.some(
									(row) =>
										row.machineId === entry.machineId && row.tag === entry.tag,
								),
						);
					},
				}),
			},
			pendingDeletes: {
				useQuery: () => {
					const [data, setData] = useState(pending);
					pendingUpdate = setData;
					return { data, isSuccess: true };
				},
			},
			acknowledgeDeletes: {
				useMutation: () => ({
					mutateAsync: async ({
						rows,
					}: {
						rows: ProjectCollectionPendingDelete[];
					}) => {
						pending = pending.filter(
							(row) =>
								!rows.some(
									(removed) =>
										removed.machineId === row.machineId &&
										removed.tag === row.tag,
								),
						);
					},
				}),
			},
			list: {
				useQuery: () => {
					const [data, setData] = useState(placements);
					update = setData;
					return { data, isSuccess: true };
				},
			},
			write: { useMutation: () => write },
			reconcile: { useMutation: () => reconcile },
		},
		useUtils: () => utils,
	},
}));
const { act, cleanup, render, waitFor } = await import(
	"@testing-library/react"
);
const { useProjectCollections, ProjectCollectionsContext } = await import(
	"../useProjectCollections"
);
const { enqueueProjectCollectionMutation } = await import(
	"../projectCollectionMutations"
);
const { ProjectCollectionsProvider } = await import(
	"../../../providers/ProjectCollectionsProvider"
);
let isRail = false;
mock.module("renderer/hooks/useActiveOrganizationId", () => ({
	useActiveOrganizationId: () => "org",
}));
mock.module("renderer/stores/workspace-sidebar-state", () => ({
	useWorkspaceSidebarStore: () => isRail,
}));
const { electronTrpc } = await import("renderer/lib/electron-trpc");
Object.assign(electronTrpc, {
	resourceMetrics: {
		getSnapshot: {
			useQuery: () => ({ data: null, refetch: () => {}, isFetching: false }),
		},
	},
});
const { useResourceSnapshot } = await import(
	"../../../_dashboard/components/TopBar/components/ResourceConsumption/hooks/useResourceSnapshot/useResourceSnapshot"
);
const { renderHook } = await import("@testing-library/react");
let hook: ReturnType<typeof useProjectCollections>;
function Probe() {
	hook = useProjectCollections();
	return null;
}
afterEach(async () => {
	cleanup();
	await enqueueProjectCollectionMutation("org\u0000alice", async () => {});
	await enqueueProjectCollectionMutation(
		"other-org\u0000alice",
		async () => {},
	);
});
afterAll(async () => {
	if (!registered) await GlobalRegistrator.unregister();
});

test("restored workspace reveal waits for reconciliation and rapid chevrons keep both writes", async () => {
	const client = new QueryClient();
	const cancellations: unknown[] = [];
	const invalidations: unknown[] = [];
	const cancel = client.cancelQueries.bind(client);
	const invalidate = client.invalidateQueries.bind(client);
	client.cancelQueries = (...args) => {
		cancellations.push(args);
		return cancel(...args);
	};
	client.invalidateQueries = (...args) => {
		invalidations.push(args);
		return invalidate(...args);
	};
	render(
		<QueryClientProvider client={client}>
			<ProjectCollectionsProvider>
				<Probe />
				<Probe />
				<Probe />
			</ProjectCollectionsProvider>
		</QueryClientProvider>,
	);
	await waitFor(() => expect(reconcileStarted).toBe(true));
	await act(async () => {
		const reveal = hook.mutate({
			type: "collapse",
			tag: "team",
			isCollapsed: false,
		});
		const other = hook.mutate({
			type: "collapse",
			tag: "other",
			isCollapsed: true,
		});
		release();
		expect(await reveal).toBe(true);
		expect(await other).toBe(true);
	});
	expect(hook.collections.find((row) => row.tag === "team")?.isCollapsed).toBe(
		false,
	);
	expect(hook.collections.find((row) => row.tag === "other")?.isCollapsed).toBe(
		true,
	);
	expect(cancellations).toEqual([]);
	expect(invalidations).toEqual([]);
	expect(localInvalidations).toEqual(["placements"]);
	client.clear();
});

function localProjectHost() {
	const host = projectHosts[0];
	if (!host) throw new Error("Missing local project host");
	return host;
}
function localFolderHost() {
	const host = folderHosts[0];
	if (!host) throw new Error("Missing local folder host");
	return host;
}
function rootProjectIds() {
	return hook.rootItems
		.filter((item) => item.type === "project")
		.map((item) => item.project.id);
}

test("a new root project precedes persisted projects after renumbering", async () => {
	const localHost = projectHosts[0];
	if (!localHost) throw new Error("Missing local project host");
	localHost.rows = ["a", "b", "new"].map((id) =>
		normalizeHostProjectRow({ id, repoPath: `/${id}`, tags: [] }),
	);
	sidebarProjects = [
		{ projectId: "a", tabOrder: 1, isHidden: false },
		{ projectId: "b", tabOrder: 2, isHidden: false },
		{ projectId: "new", tabOrder: 0, isHidden: false },
	];
	placements = [
		{ key: "a", kind: "project", tabOrder: 0, isCollapsed: false },
		{ key: "b", kind: "project", tabOrder: 1, isCollapsed: false },
	];
	const client = new QueryClient();
	render(
		<QueryClientProvider client={client}>
			<ProjectCollectionsProvider>
				<Probe />
			</ProjectCollectionsProvider>
		</QueryClientProvider>,
	);
	expect(rootProjectIds()).toEqual(["new", "a", "b"]);
	await act(async () => {
		expect(
			await hook.mutate({ type: "collapse", tag: "team", isCollapsed: true }),
		).toBe(true);
	});
	expect(rootProjectIds()).toEqual(["new", "a", "b"]);
	client.clear();
});

test("resource consumption uses the same resolved root and rail positions", () => {
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={new QueryClient()}>
			<ProjectCollectionsContext.Provider
				value={
					{ projectOrder: ["new", "a", "b"] } as ReturnType<
						typeof useProjectCollections
					>
				}
			>
				{children}
			</ProjectCollectionsContext.Provider>
		</QueryClientProvider>
	);
	const { result, unmount } = renderHook(() => useResourceSnapshot("v2"), {
		wrapper,
	});
	expect(result.current.sidebarProjectOrder).toEqual(["new", "a", "b"]);
	placements = [
		...placements,
		{ key: "rail:b", kind: "project", tabOrder: 0, isCollapsed: false },
		{ key: "rail:new", kind: "project", tabOrder: 1, isCollapsed: false },
		{ key: "rail:a", kind: "project", tabOrder: 2, isCollapsed: false },
	];
	isRail = true;
	unmount();
	const rail = renderHook(() => useResourceSnapshot("v2"), { wrapper });
	expect(rail.result.current.sidebarProjectOrder).toEqual(["new", "a", "b"]);
});

let activeWorkspaceId = "active";
let navigatedWorkspaceId: string | null = null;
mock.module("@tanstack/react-router", () => ({
	useNavigate:
		() =>
		async ({ params }: { params?: { workspaceId: string } }) => {
			navigatedWorkspaceId = params?.workspaceId ?? null;
		},
	useMatchRoute: () => () => ({ workspaceId: activeWorkspaceId }),
}));
mock.module("renderer/hooks/useCloudWorkspaces", () => ({
	useCloudWorkspaces: () => ({ workspaces: [] }),
}));
mock.module("renderer/routes/_authenticated/utils/workspaceTagFolders", () => ({
	useTagFolderContext: () => ({
		tagSettings: [],
		hiddenTagsByProject: new Map(),
	}),
}));
mock.module(
	"../../../_dashboard/components/DashboardSidebar/utils/getFlattenedV2WorkspaceIds",
	() => ({
		getFlattenedV2WorkspaceIds: () => ["active", "next", "last"],
	}),
);
mock.module("../../../_dashboard/utils/workspace-navigation", () => ({
	navigateToV2Workspace: async (workspaceId: string) => {
		navigatedWorkspaceId = workspaceId;
	},
}));
const { useNavigateAwayFromWorkspace } = await import(
	"../../../_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace/useNavigateAwayFromWorkspace"
);

test("workspace removal callback stays stable and reads the current route", () => {
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={new QueryClient()}>
			<ProjectCollectionsProvider>{children}</ProjectCollectionsProvider>
		</QueryClientProvider>
	);
	const { result, rerender } = renderHook(
		() => useNavigateAwayFromWorkspace(),
		{ wrapper },
	);
	const first = result.current.navigateAwayFromWorkspace;
	activeWorkspaceId = "next";
	rerender();
	expect(result.current.navigateAwayFromWorkspace).toBe(first);
	first("next");
	expect(navigatedWorkspaceId).toBe("last");
});

test("an offline collection deletion stays hidden after remount and replays on reconnect", async () => {
	const localProjects = projectHosts[0];
	const localFolders = folderHosts[0];
	if (!localProjects || !localFolders) throw new Error("Missing local host");
	localProjects.rows = [];
	localFolders.settings = [
		{
			scope: "projects",
			tag: "team",
			displayName: "Team",
			color: null,
			tabOrder: 0,
		},
	];
	const remote: import("renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils").HostTagFoldersResult =
		{
			target: {
				...target,
				machineId: "remote",
				hostUrl: null as string | null,
				isLocal: false,
			},
			status: "offline",
			settings: [
				{
					scope: "projects",
					tag: "team",
					displayName: "Team",
					color: null,
					tabOrder: 1,
				},
			],
		};
	folderHosts.push(remote);
	placements = [];
	pending = [];
	const client = new QueryClient();
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>
			<ProjectCollectionsProvider>{children}</ProjectCollectionsProvider>
		</QueryClientProvider>
	);
	const first = renderHook(() => useProjectCollections(), { wrapper });
	await act(async () =>
		expect(
			await first.result.current.mutate({ type: "delete", tag: "team" }),
		).toBe(true),
	);
	expect(pending.map(({ machineId, tag }) => ({ machineId, tag }))).toEqual([
		{ machineId: "remote", tag: "team" },
	]);
	first.unmount();
	const second = renderHook(() => useProjectCollections(), { wrapper });
	expect(second.result.current.collections).toEqual([]);
	remote.target.hostUrl = "new-remote-url";
	remote.status = "ready";
	second.rerender();
	await waitFor(() => expect(pending).toEqual([]));
	expect(remote.settings).toEqual([]);
	expect(second.result.current.collections).toEqual([]);
	client.clear();
});

test("resource consumption follows the provider order instead of raw folder settings", () => {
	const client = new QueryClient();
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>
			<ProjectCollectionsContext.Provider
				value={
					{ projectOrder: ["b", "new", "a"] } as ReturnType<
						typeof useProjectCollections
					>
				}
			>
				{children}
			</ProjectCollectionsContext.Provider>
		</QueryClientProvider>
	);
	const { result, unmount } = renderHook(() => useResourceSnapshot("v2"), {
		wrapper,
	});
	expect(result.current.sidebarProjectOrder).toEqual(["b", "new", "a"]);
	unmount();
	client.clear();
});

test("queued reconciliation retains the keys from its original organization", async () => {
	let unblock!: () => void;
	const gate = new Promise<void>((resolve) => {
		unblock = resolve;
	});
	const blocked = enqueueProjectCollectionMutation(
		"org\u0000alice",
		() => gate,
	);
	localProjectHost().rows = [
		normalizeHostProjectRow({
			id: "original",
			repoPath: "/original",
			tags: [],
		}),
	];
	folderHosts.splice(1);
	const client = new QueryClient();
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>
			<ProjectCollectionsProvider>{children}</ProjectCollectionsProvider>
		</QueryClientProvider>
	);
	const { rerender, unmount } = renderHook(() => useProjectCollections(), {
		wrapper,
	});
	organizationId = "other-org";
	localProjectHost().rows = [
		normalizeHostProjectRow({
			id: "other-project",
			repoPath: "/other",
			tags: [],
		}),
	];
	rerender();
	await act(async () => {
		unblock();
		await blocked;
	});
	await waitFor(() =>
		expect(
			reconciliations.some(
				(row) => row.organizationId === "org" && row.keys.includes("original"),
			),
		).toBe(true),
	);
	expect(
		reconciliations.filter((row) => row.organizationId === "org").at(-1)?.keys,
	).not.toContain("other-project");
	unmount();
	organizationId = "org";
	client.clear();
});

test("reconciliation does not delete placements when no keys are known", async () => {
	localProjectHost().rows = [];
	localFolderHost().settings = [];
	folderHosts.splice(1);
	const count = reconciliations.length;
	const client = new QueryClient();
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>
			<ProjectCollectionsProvider>{children}</ProjectCollectionsProvider>
		</QueryClientProvider>
	);
	const { unmount } = renderHook(() => useProjectCollections(), { wrapper });
	await act(async () => {
		await enqueueProjectCollectionMutation("org\u0000alice", async () => {});
	});
	expect(reconciliations.length).toBe(count);
	unmount();
	client.clear();
});

test("collection move eligibility is stable across unrelated renders", () => {
	const client = new QueryClient();
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>
			<ProjectCollectionsProvider>{children}</ProjectCollectionsProvider>
		</QueryClientProvider>
	);
	const { result, rerender, unmount } = renderHook(
		() => useProjectCollections(),
		{ wrapper },
	);
	const canMove = result.current.canMoveProject;
	const value = result.current;
	rerender();
	expect(result.current.canMoveProject).toBe(canMove);
	expect(result.current).toBe(value);
	unmount();
	client.clear();
});

test("author rename and color survive remount and reach returning hosts", async () => {
	localFolderHost().settings = [
		{
			scope: "projects",
			tag: "team",
			displayName: "Client",
			color: null,
			tabOrder: 0,
		},
	];
	const remote: import("renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils").HostTagFoldersResult =
		{
			target: {
				...target,
				machineId: "remote",
				hostUrl: null as string | null,
				isLocal: false,
			},
			status: "offline",
			settings: [
				{
					scope: "projects",
					tag: "team",
					displayName: "Client",
					color: null,
					tabOrder: 0,
				},
			],
		};
	folderHosts.push(remote);
	const client = new QueryClient();
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>
			<ProjectCollectionsProvider>{children}</ProjectCollectionsProvider>
		</QueryClientProvider>
	);
	const first = renderHook(() => useProjectCollections(), { wrapper });
	await act(async () => {
		expect(
			await first.result.current.mutate({
				type: "rename",
				tag: "team",
				name: "Client X",
			}),
		).toBe(true);
	});
	await act(async () => {
		expect(
			await first.result.current.mutate({
				type: "color",
				tag: "team",
				color: "#123456",
			}),
		).toBe(true);
	});
	expect(presentations).toHaveLength(1);
	expect(presentations[0]?.setting).toMatchObject({
		displayName: "Client X",
		color: "#123456",
	});
	first.unmount();
	remote.settings = [
		{
			scope: "projects",
			tag: "team",
			displayName: "Client",
			color: null,
			tabOrder: 0,
		},
	];
	const { rerender, unmount } = renderHook(() => useProjectCollections(), {
		wrapper,
	});
	expect(remote.settings[0]?.displayName).toBe("Client");
	remote.target.hostUrl = "remote";
	remote.status = "ready";
	client.setQueryData(["host-tag-folders", "org", "remote"], remote.settings);
	folderHosts = [...folderHosts];
	rerender();
	await waitFor(() =>
		expect(remote.settings[0]).toMatchObject({
			displayName: "Client X",
			color: "#123456",
		}),
	);
	unmount();
	folderHosts.splice(1);
	client.clear();
});

test("resource consumption preserves the v1 project order", () => {
	sidebarProjects = [
		{ projectId: "legacy-b", tabOrder: 0, isHidden: false },
		{ projectId: "legacy-a", tabOrder: 1, isHidden: false },
	];
	const client = new QueryClient();
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>
			<ProjectCollectionsContext.Provider
				value={
					{ projectOrder: ["a", "b"] } as ReturnType<
						typeof useProjectCollections
					>
				}
			>
				{children}
			</ProjectCollectionsContext.Provider>
		</QueryClientProvider>
	);
	const { result, unmount } = renderHook(() => useResourceSnapshot("v1"), {
		wrapper,
	});
	expect(result.current.sidebarProjectOrder).toEqual(["legacy-b", "legacy-a"]);
	unmount();
	client.clear();
});

test("deletion eligibility includes every replica of a tagged project", () => {
	localProjectHost().rows = [
		normalizeHostProjectRow({
			id: "project",
			repoPath: "/project",
			tags: ["team"],
		}),
	];
	const remote = {
		target: { ...target, machineId: "remote", isLocal: false },
		reachable: false,
		rows: [
			normalizeHostProjectRow({
				id: "project",
				repoPath: "/project",
				tags: ["team"],
			}),
		],
	};
	projectHosts.push(remote);
	const client = new QueryClient();
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>
			<ProjectCollectionsProvider>{children}</ProjectCollectionsProvider>
		</QueryClientProvider>
	);
	const { result, rerender, unmount } = renderHook(
		() => useProjectCollections(),
		{ wrapper },
	);
	expect(result.current.canDeleteCollection("team")).toBe(false);
	expect(result.current.canDeleteCollection("empty")).toBe(true);
	remote.reachable = true;
	rerender();
	expect(result.current.canDeleteCollection("team")).toBe(true);
	unmount();
	projectHosts.splice(1);
	client.clear();
});

for (const deleted of [false, true]) {
	test(
		deleted
			? "a returning stale local host does not resurrect a collection deleted elsewhere"
			: "a returning stale local host does not overwrite newer remote presentation",
		async () => {
			localProjectHost().rows = [];
			const local = localFolderHost();
			local.settings = [
				{
					scope: "projects",
					tag: "team",
					displayName: "Old",
					color: null,
					tabOrder: 0,
				},
			];
			const remote = {
				target: {
					...target,
					machineId: "remote",
					hostUrl: "remote",
					isLocal: false,
				},
				status: "ready" as const,
				settings: deleted
					? []
					: [{ ...local.settings[0], displayName: "New", color: "#ff0000" }],
			};
			folderHosts.splice(1, folderHosts.length, remote);
			pending = [];
			const client = new QueryClient();
			const wrapper = ({ children }: { children: React.ReactNode }) => (
				<QueryClientProvider client={client}>
					<ProjectCollectionsProvider>{children}</ProjectCollectionsProvider>
				</QueryClientProvider>
			);
			const { unmount } = renderHook(() => useProjectCollections(), {
				wrapper,
			});
			await act(async () => {
				await enqueueProjectCollectionMutation(
					"org\u0000alice",
					async () => {},
				);
			});
			expect(remote.settings).toEqual(
				deleted
					? []
					: [
							{
								scope: "projects",
								tag: "team",
								displayName: "New",
								color: "#ff0000",
								tabOrder: 0,
							},
						],
			);
			unmount();
			client.clear();
		},
	);
}

test("D5 optimistic rename is visible while the local host is closed and remote write waits", async () => {
	const local = localFolderHost();
	local.settings = [
		{
			scope: "projects",
			tag: "team",
			displayName: "Old",
			color: null,
			tabOrder: 0,
			updatedAt: 10,
		},
	];
	local.status = "offline";
	const remote = {
		target: {
			...target,
			machineId: "remote",
			hostUrl: "remote",
			isLocal: false,
		},
		status: "ready" as const,
		settings: local.settings.map((row) => ({ ...row, updatedAt: 20 })),
	};
	folderHosts.push(remote);
	const client = new QueryClient();
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>
			<ProjectCollectionsProvider>{children}</ProjectCollectionsProvider>
		</QueryClientProvider>
	);
	const { result, unmount } = renderHook(() => useProjectCollections(), {
		wrapper,
	});
	let release!: () => void;
	settingGate = new Promise((resolve) => {
		release = resolve;
	});
	let mutation!: Promise<boolean>;
	act(() => {
		mutation = result.current.mutate({
			type: "rename",
			tag: "team",
			name: "Client X",
		});
	});
	await waitFor(() =>
		expect(
			result.current.collections.find((row) => row.tag === "team")?.name,
		).toBe("Client X"),
	);
	await act(async () => {
		release();
		expect(await mutation).toBe(true);
	});
	settingGate = null;
	unmount();
	client.clear();
	local.status = "ready";
	folderHosts.splice(1);
});

test("replayed deletion keeps a newer host setting in the canonical cache", async () => {
	const remote = {
		target: {
			...target,
			machineId: "remote",
			hostUrl: "remote",
			isLocal: false,
		},
		status: "ready" as const,
		settings: [
			{
				scope: "projects",
				tag: "team",
				displayName: "Recreated",
				color: null,
				tabOrder: 0,
				updatedAt: 200,
			},
		],
	};
	folderHosts.push(remote);
	pending = [{ machineId: "remote", tag: "team", deletedAt: 100 }];
	const client = new QueryClient();
	client.setQueryData(["host-tag-folders", "org", "remote"], remote.settings);
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>
			<ProjectCollectionsProvider>{children}</ProjectCollectionsProvider>
		</QueryClientProvider>
	);
	const { unmount } = renderHook(() => useProjectCollections(), { wrapper });
	await waitFor(() => expect(pending).toEqual([]));
	expect(
		client.getQueryData(["host-tag-folders", "org", "remote"]),
	).toMatchObject([{ displayName: "Recreated", updatedAt: 200 }]);
	unmount();
	folderHosts.splice(1);
	client.clear();
});
