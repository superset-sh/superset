import { afterEach, expect, mock, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Isolate the owned React browser fixture.
import { spawnSync } from "node:child_process";
// biome-ignore lint/style/noRestrictedImports: Own and clean the fixture directory.
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_NATIVE_STATUS_FIXTURE !== "1") {
	test("native status actions use the current expected provider binding", () => {
		const cwd = mkdtempSync("/tmp/superset-native-status-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: { PATH: process.env.PATH, SUPERSET_NATIVE_STATUS_FIXTURE: "1" },
					stdio: "pipe",
					timeout: 15000,
				},
			);
			process.stdout.write(child.stdout ?? "");
			process.stderr.write(child.stderr ?? "");
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
} else {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Fixture network denied");
		},
		{ preconnect: () => {} },
	);
	const React = await import("react");
	const { render, fireEvent, cleanup, act } = await import(
		"@testing-library/react"
	);
	const { createTRPCUntypedClient } = await import("@trpc/client");
	const { observable } = await import("@trpc/server/observable");
	const wire: { path: string; input: Record<string, unknown> }[] = [];
	const client = createTRPCUntypedClient({
		links: [
			() =>
				({ op }) =>
					observable((observer) => {
						wire.push({
							path: op.path,
							input: JSON.parse(JSON.stringify(op.input)),
						});
						observer.next({ result: { data: { merged: true } } });
						observer.complete();
					}),
		],
	});
	const mutation = (path: string) => ({
		useMutation: (
			options: {
				onMutate?: (input: Record<string, unknown>) => unknown;
				onSuccess?: (
					data: unknown,
					input: Record<string, unknown>,
					context?: unknown,
				) => void;
			} = {},
		) => ({
			isPending: false,
			mutate(input: Record<string, unknown>) {
				const context = options.onMutate?.(input);
				void client
					.mutation(path, input)
					.then((data) => options.onSuccess?.(data, input, context));
			},
			mutateAsync: (input: Record<string, unknown>) =>
				client.mutation(path, input),
		}),
	});
	mock.module("@superset/workspace-client", () => ({
		workspaceTrpc: {
			github: {
				mergePR: mutation("github.mergePR"),
				markPullRequestReady: mutation("github.markPullRequestReady"),
			},
			pullRequests: {
				refreshByWorkspaces: mutation("pullRequests.refreshByWorkspaces"),
			},
		},
	}));
	mock.module("@lingui/react/macro", () => ({
		Trans: ({ children }: { children: React.ReactNode }) => children,
		useLingui: () => ({ t: ({ message }: { message: string }) => message }),
	}));
	mock.module("@superset/ui/sonner", () => ({
		toast: {
			loading: () => "toast",
			success: () => {},
			error: () => {},
			warning: () => {},
		},
	}));
	mock.module("@superset/ui/utils", () => ({ cn: () => "" }));
	const wrap = ({ children }: { children: React.ReactNode }) => <>{children}</>;
	const retained: Array<() => void> = [];
	mock.module("@superset/ui/dropdown-menu", () => ({
		DropdownMenu: wrap,
		DropdownMenuContent: wrap,
		DropdownMenuLabel: wrap,
		DropdownMenuSeparator: () => null,
		DropdownMenuTrigger: wrap,
		DropdownMenuItem: ({
			children,
			onClick,
			disabled,
			asChild,
		}: {
			children: React.ReactNode;
			onClick?: () => void;
			disabled?: boolean;
			asChild?: boolean;
		}) => {
			if (onClick) retained.push(onClick);
			return asChild ? (
				children
			) : (
				<button type="button" disabled={disabled} onClick={onClick}>
					{children}
				</button>
			);
		},
	}));
	mock.module("@superset/ui/hover-card", () => ({
		HoverCard: wrap,
		HoverCardContent: () => null,
		HoverCardTrigger: wrap,
	}));
	mock.module("renderer/screens/main/components/PRIcon", () => ({
		PRIcon: () => null,
	}));
	mock.module("./components/PRDetailCard", () => ({
		PRDetailCard: () => null,
	}));
	mock.module("./components/PRStatusIndicators", () => ({
		PRStatusIndicators: () => null,
	}));
	mock.module(
		"renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/computeChecksStatus",
		() => ({ computeChecksRollup: () => ({}) }),
	);
	let workspace = {
		id: "workspace-a",
		projectId: "project-a",
		type: "worktree",
	};
	let hostUrl = "https://host-a.example.test";
	mock.module(
		"renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider",
		() => ({ useWorkspace: () => ({ workspace, hostUrl }) }),
	);
	const { PRStatusGroup } = await import("./PRStatusGroup");
	const initial = {
		provider: "gitlab",
		host: "git-a.example.test:8443",
		projectId: "project-a",
		url: "https://git-a.example.test:8443/team/sub/repo/-/merge_requests/17",
		repoOwner: "team/sub",
		repoName: "repo",
		number: 17,
		state: "open",
		isDraft: false,
		checks: [],
	};
	const mount = (pr: Record<string, unknown> = { ...initial }) =>
		render(
			<PRStatusGroup
				state={{ kind: "pr-exists", pr, sync: null } as never}
				workspaceId={workspace.id}
				onOpenPullRequest={() => {}}
			/>,
		);
	const flush = () =>
		act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
	afterEach(() => {
		cleanup();
		wire.length = 0;
		retained.length = 0;
		workspace = { id: "workspace-a", projectId: "project-a", type: "worktree" };
		hostUrl = "https://host-a.example.test";
	});
	test("native merge sends full binding over the mutation transport", async () => {
		const view = mount();
		fireEvent.click(view.getByText("Squash and merge"));
		await flush();
		expect(wire.find((x) => x.path === "github.mergePR")?.input).toEqual({
			owner: "team/sub",
			repo: "repo",
			pullNumber: 17,
			mergeMethod: "squash",
			provider: "gitlab",
			host: initial.host,
			projectId: "project-a",
			workspaceId: "workspace-a",
			expectedUrl: initial.url,
		});
	});
	test("native ready uses the same exact instance and workspace", async () => {
		const view = mount({ ...initial, isDraft: true });
		fireEvent.click(view.getByText("Ready for review"));
		await flush();
		expect(
			wire.find((x) => x.path === "github.markPullRequestReady")?.input,
		).toEqual({
			owner: "team/sub",
			repo: "repo",
			pullNumber: 17,
			provider: "gitlab",
			host: initial.host,
			projectId: "project-a",
			workspaceId: "workspace-a",
			expectedUrl: initial.url,
		});
	});
	test("native external link copy is provider neutral", () => {
		const view = mount();
		expect(
			view.getByText("Open in browser").closest("a")?.getAttribute("href"),
		).toBe(initial.url);
		expect(view.queryByText("View on GitHub")).toBeNull();
	});
	test("GitHub retains its original payload and external label", async () => {
		const view = mount({
			...initial,
			provider: undefined,
			host: undefined,
			projectId: undefined,
			repoOwner: "team",
			url: "https://github.com/team/repo/pull/17",
		});
		fireEvent.click(view.getByText("Squash and merge"));
		await flush();
		expect(wire.find((x) => x.path === "github.mergePR")?.input).toEqual({
			owner: "team",
			repo: "repo",
			pullNumber: 17,
			mergeMethod: "squash",
		});
		expect(view.getByText("View on GitHub")).toBeDefined();
	});
	test("retained native menu callback cannot mutate after instance change", async () => {
		const view = mount();
		const merge = retained[0];
		if (!merge) throw Error("Missing merge menu action");
		view.rerender(
			<PRStatusGroup
				state={
					{
						kind: "pr-exists",
						pr: {
							...initial,
							host: "git-b.example.test",
							url: "https://git-b.example.test/team/sub/repo/-/merge_requests/17",
						},
						sync: null,
					} as never
				}
				workspaceId={workspace.id}
				onOpenPullRequest={() => {}}
			/>,
		);
		merge();
		await flush();
		expect(wire).toEqual([]);
	});
	test("retained native menu callback cannot mutate after serving host change", async () => {
		const view = mount();
		const merge = retained[0];
		if (!merge) throw Error("Missing merge menu action");
		hostUrl = "https://host-b.example.test";
		view.rerender(
			<PRStatusGroup
				state={{ kind: "pr-exists", pr: initial, sync: null } as never}
				workspaceId={workspace.id}
				onOpenPullRequest={() => {}}
			/>,
		);
		merge();
		await flush();
		expect(wire).toEqual([]);
	});
	test("stale native project binding disables writes", () => {
		const view = mount({ ...initial, projectId: "project-b" });
		expect(
			(view.getByText("Squash and merge") as HTMLButtonElement).disabled,
		).toBe(true);
	});
	test("retained native ready callback cannot mutate a newly selected MR", async () => {
		const view = mount({ ...initial, isDraft: true });
		const ready = retained[0];
		if (!ready) throw Error("Missing ready menu action");
		view.rerender(
			<PRStatusGroup
				state={
					{
						kind: "pr-exists",
						pr: {
							...initial,
							isDraft: true,
							number: 18,
							url: "https://git-a.example.test:8443/team/sub/repo/-/merge_requests/18",
						},
						sync: null,
					} as never
				}
				workspaceId={workspace.id}
				onOpenPullRequest={() => {}}
			/>,
		);
		ready();
		await flush();
		expect(wire).toEqual([]);
	});
	test("inconsistent selected MR metadata blocks retained merge", async () => {
		const view = mount();
		const merge = retained[0];
		if (!merge) throw Error("Missing merge menu action");
		view.rerender(
			<PRStatusGroup
				state={
					{
						kind: "pr-exists",
						pr: { ...initial, number: 18 },
						sync: null,
					} as never
				}
				workspaceId="workspace-a"
				onOpenPullRequest={() => {}}
			/>,
		);
		expect(
			(view.getByText("Squash and merge") as HTMLButtonElement).disabled,
		).toBe(true);
		merge();
		await flush();
		expect(wire).toEqual([]);
	});
	test("changed contextual workspace blocks retained merge even while requested workspace is unchanged", async () => {
		const view = mount();
		const merge = retained[0];
		if (!merge) throw Error("Missing merge menu action");
		workspace = { ...workspace, id: "workspace-b" };
		view.rerender(
			<PRStatusGroup
				state={{ kind: "pr-exists", pr: initial, sync: null } as never}
				workspaceId="workspace-a"
				onOpenPullRequest={() => {}}
			/>,
		);
		expect(
			(view.getByText("Squash and merge") as HTMLButtonElement).disabled,
		).toBe(true);
		merge();
		await flush();
		expect(wire).toEqual([]);
	});
}
