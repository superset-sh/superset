import { afterEach, expect, mock, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own an isolated React fixture child.
import { spawnSync } from "node:child_process";
// biome-ignore lint/style/noRestrictedImports: Own and remove the fixture directory.
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_NATIVE_SHIP_FIXTURE !== "1") {
	test("new ship actions preserve provider and creation target", () => {
		const cwd = mkdtempSync("/tmp/superset-native-ship-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: { PATH: process.env.PATH, SUPERSET_NATIVE_SHIP_FIXTURE: "1" },
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
			throw Error("Ship fixture network denied");
		},
		{ preconnect: () => {} },
	);
	const React = await import("react");
	const { renderHook, render, act, cleanup } = await import(
		"@testing-library/react"
	);
	const { createTRPCUntypedClient } = await import("@trpc/client");
	const { observable } = await import("@trpc/server/observable");
	let workspace = {
		id: "workspace-a",
		projectId: "project-a",
		type: "worktree",
	};
	let hostUrl = "https://host-a.example.test";
	let project = {
		id: "project-a",
		repoProvider: "gitlab",
		repoOwner: "team/sub",
		repoName: "repo",
		repoUrl: "https://git-a.example.test:8443/team/sub/repo.git",
	};
	let resultUrl =
		"https://git-a.example.test:8443/team/sub/repo/-/merge_requests/17";
	let pushBarrier: Promise<void> | undefined;
	let createBarrier: Promise<void> | undefined;
	const wire: { path: string; input: Record<string, unknown> }[] = [];
	const intents: Record<string, unknown>[] = [];
	const navigation: string[] = [];
	let createdCallbacks = 0;
	const errors: string[] = [];
	const successes: {
		message: string;
		options: {
			action: { onClick: () => void };
			description: React.ReactElement;
		};
	}[] = [];
	const client = createTRPCUntypedClient({
		links: [
			() =>
				({ op }) =>
					observable((observer) => {
						wire.push({
							path: op.path,
							input: JSON.parse(JSON.stringify(op.input)),
						});
						void (async () => {
							if (op.path === "git.push") await pushBarrier;
							else await createBarrier;
							observer.next({
								result: {
									data:
										op.path === "pullRequests.createForWorkspace"
											? { number: 17, url: resultUrl }
											: {},
								},
							});
							observer.complete();
						})();
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
			mutate: () => {},
			mutateAsync: async (input: Record<string, unknown>) => {
				const result = await client.mutation(path, input);
				options.onSuccess?.(result, input);
				return result;
			},
		}),
	});
	mock.module("@superset/workspace-client", () => ({
		workspaceTrpc: {
			project: {
				get: {
					useQuery: () => ({
						data: project,
						isPending: false,
						isSuccess: true,
					}),
				},
			},
			git: {
				getBaseBranch: {
					useQuery: () => ({ data: { baseBranch: "main" }, isSuccess: true }),
				},
				listCommits: {
					useQuery: () => ({
						data: { commits: [{ message: "Owned title" }] },
						isSuccess: true,
						refetch: async () => {},
					}),
				},
				commit: mutation("git.commit"),
				push: mutation("git.push"),
			},
			pullRequests: {
				createForWorkspace: mutation("pullRequests.createForWorkspace"),
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
			dismiss: () => {},
			success: (message: string, options: never) =>
				successes.push({ message, options }),
			error: (message: string) => errors.push(message),
		},
	}));
	mock.module("@tanstack/react-router", () => ({
		useNavigate: () => () => {},
	}));
	mock.module(
		"renderer/routes/_authenticated/_dashboard/utils/workspace-navigation",
		() => ({ navigateToV2Workspace: (id: string) => navigation.push(id) }),
	);
	mock.module(
		"renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider",
		() => ({ useWorkspace: () => ({ workspace, hostUrl }) }),
	);
	mock.module("../../providers/WorkspaceGitStatusProvider", () => ({
		useWorkspaceGitStatus: () => ({ data: { staged: [], unstaged: [] } }),
	}));
	mock.module("renderer/stores/pull-request-pane-intent", () => ({
		usePullRequestPaneIntent: {
			getState: () => ({
				request: (input: Record<string, unknown>) => intents.push(input),
			}),
		},
	}));
	mock.module("@superset/ui/input", () => ({
		Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
			<input {...props} />
		),
	}));
	mock.module("@superset/ui/textarea", () => ({
		Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
			<textarea {...props} />
		),
	}));
	mock.module("@superset/ui/label", () => ({
		Label: ({ children }: { children: React.ReactNode }) => (
			<span>{children}</span>
		),
	}));
	mock.module("@superset/ui/checkbox", () => ({ Checkbox: () => null }));
	const menuWrap = ({ children }: { children: React.ReactNode }) => children;
	mock.module("@superset/ui/dropdown-menu", () => ({
		DropdownMenu: menuWrap,
		DropdownMenuContent: menuWrap,
		DropdownMenuTrigger: menuWrap,
		DropdownMenuItem: ({
			children,
			onClick,
			disabled,
		}: {
			children: React.ReactNode;
			onClick?: () => void;
			disabled?: boolean;
		}) => (
			<button type="button" onClick={onClick} disabled={disabled}>
				{children}
			</button>
		),
	}));
	const { ActivityMenuHeader } = await import(
		"../../components/WorkspaceActivityMenu/components/ActivityMenuHeader/ActivityMenuHeader"
	);
	const { useShipActions } = await import("./useShipActions");
	const { CreatePrForm } = await import(
		"../../components/CreatePrForm/CreatePrForm"
	);
	const mount = (requestedWorkspaceId?: string) =>
		renderHook(() =>
			useShipActions({
				workspaceId: requestedWorkspaceId ?? workspace.id,
				onRefresh: () => {},
				isPrFormOpen: false,
				onCommitted: () => {},
				onPrCreated: () => {
					createdCallbacks++;
				},
			}),
		);
	const title = (hook: ReturnType<typeof mount>) =>
		act(() => {
			hook.result.current.editPrTitle("Owned title");
		});
	afterEach(() => {
		cleanup();
		wire.length = 0;
		intents.length = 0;
		navigation.length = 0;
		successes.length = 0;
		errors.length = 0;
		pushBarrier = undefined;
		createBarrier = undefined;
		createdCallbacks = 0;
		workspace = { id: "workspace-a", projectId: "project-a", type: "worktree" };
		hostUrl = "https://host-a.example.test";
		project = {
			id: "project-a",
			repoProvider: "gitlab",
			repoOwner: "team/sub",
			repoName: "repo",
			repoUrl: "https://git-a.example.test:8443/team/sub/repo.git",
		};
		resultUrl =
			"https://git-a.example.test:8443/team/sub/repo/-/merge_requests/17";
	});
	test("native form and successful create use merge-request copy", async () => {
		const hook = mount();
		title(hook);
		const view = render(<CreatePrForm actions={hook.result.current} />);
		expect(view.getByPlaceholderText("Merge request title")).toBeDefined();
		expect(view.getByText("Create merge request")).toBeDefined();
		await act(async () => {
			await hook.result.current.createPr();
		});
		expect(successes[0]?.message).toBe("Merge request opened");
		expect(wire.map((x) => x.path)).toEqual([
			"git.push",
			"pullRequests.createForWorkspace",
		]);
	});
	test("GitHub create preserves original form and mutation payload", async () => {
		project = {
			...project,
			repoProvider: "github",
			repoOwner: "team",
			repoUrl: "https://github.com/team/repo.git",
		};
		resultUrl = "https://github.com/team/repo/pull/17";
		const hook = mount();
		title(hook);
		const view = render(<CreatePrForm actions={hook.result.current} />);
		expect(view.getByPlaceholderText("Pull request title")).toBeDefined();
		expect(view.getByText("Create pull request")).toBeDefined();
		await act(async () => {
			await hook.result.current.createPr();
		});
		expect(wire[1]?.input).toEqual({
			workspaceId: "workspace-a",
			title: "Owned title",
			draft: false,
		});
		expect(successes[0]?.message).toBe("PR #17 created");
	});
	test("native flow stops before create if target changed during push", async () => {
		let resolve!: () => void;
		pushBarrier = new Promise<void>((accept) => {
			resolve = accept;
		});
		const hook = mount();
		title(hook);
		let pending!: Promise<void>;
		act(() => {
			pending = hook.result.current.createPr();
		});
		workspace = { ...workspace, id: "workspace-b", projectId: "project-b" };
		project = { ...project, id: "project-b" };
		hook.rerender();
		await act(async () => {
			resolve();
			await pending;
		});
		expect(wire.map((x) => x.path)).toEqual(["git.push"]);
	});
	test("retained native create callback cannot push after target change", async () => {
		const hook = mount();
		title(hook);
		const old = hook.result.current.createPr;
		hostUrl = "https://host-b.example.test";
		hook.rerender();
		await act(async () => {
			await old();
		});
		expect(wire).toEqual([]);
	});
	test("late native success keeps toast navigation bound to original instance/workspace", async () => {
		let resolve!: () => void;
		createBarrier = new Promise<void>((accept) => {
			resolve = accept;
		});
		const hook = mount();
		title(hook);
		let pending!: Promise<void>;
		await act(async () => {
			pending = hook.result.current.createPr();
			await Promise.resolve();
			await Promise.resolve();
		});
		workspace = { ...workspace, id: "workspace-b", projectId: "project-b" };
		project = { ...project, id: "project-b" };
		hook.rerender();
		title(hook);
		await act(async () => {
			resolve();
			await pending;
		});
		expect(createdCallbacks).toBe(0);
		expect(hook.result.current.prTitle).toBe("Owned title");
		successes[0]?.options.action.onClick();
		expect(intents[0]).toEqual({
			workspaceId: "workspace-a",
			provider: "gitlab",
			host: "git-a.example.test:8443",
			repoFullName: "team/sub/repo",
			number: 17,
		});
		expect(navigation).toEqual(["workspace-a"]);
	});
	test("native created result from another provider or instance cannot open a pane", async () => {
		const hook = mount();
		title(hook);
		resultUrl = "https://github.com/team/repo/pull/17";
		await act(async () => {
			await hook.result.current.createPr();
		});
		expect(successes).toEqual([]);
		expect(errors[0]).toContain("Create merge request failed:");
		expect(intents).toEqual([]);
		resultUrl = "https://git-b.example.test/team/sub/repo/-/merge_requests/17";
		await act(async () => {
			await hook.result.current.createPr();
		});
		expect(successes).toEqual([]);
		expect(errors).toHaveLength(2);
	});
	test("native SSH source preserves a distinct HTTPS web port", async () => {
		project = {
			...project,
			repoUrl: "ssh://git@git-a.example.test:2222/team/sub/repo.git",
		};
		const hook = mount();
		title(hook);
		await act(async () => {
			await hook.result.current.createPr();
		});
		expect(successes[0]?.message).toBe("Merge request opened");
		successes[0]?.options.action.onClick();
		expect(intents[0]?.host).toBe("git-a.example.test:8443");
	});
	test("native flow stops if the same workspace project identity changes during push", async () => {
		let resolve!: () => void;
		pushBarrier = new Promise<void>((accept) => {
			resolve = accept;
		});
		const hook = mount();
		title(hook);
		let pending!: Promise<void>;
		act(() => {
			pending = hook.result.current.createPr();
		});
		project = {
			...project,
			repoUrl: "https://git-b.example.test/team/sub/repo.git",
		};
		hook.rerender();
		await act(async () => {
			resolve();
			await pending;
		});
		expect(wire.map((x) => x.path)).toEqual(["git.push"]);
	});
	test("activity menu uses the selected native create label and preserves GitHub label", () => {
		const hook = mount();
		const props = {
			title: "workspace",
			canCommit: false,
			canPush: false,
			canCreatePr: true,
			hasCommitsAhead: true,
			isBusy: false,
			onOpenView: () => {},
			onPush: () => {},
			onNoCommitsAhead: () => {},
		};
		const view = render(
			<ActivityMenuHeader
				{...props}
				createLabel={hook.result.current.createLabel}
			/>,
		);
		expect(view.getByText("Create merge request")).toBeDefined();
		project = { ...project, repoProvider: "github" };
		hook.rerender();
		view.rerender(
			<ActivityMenuHeader
				{...props}
				createLabel={hook.result.current.createLabel}
			/>,
		);
		expect(view.getByText("Create PR")).toBeDefined();
	});
	test("retained native create cannot dispatch after contextual workspace changes with unchanged requested ID", async () => {
		const hook = mount("workspace-a");
		title(hook);
		const create = hook.result.current.createPr;
		workspace = { ...workspace, id: "workspace-b" };
		hook.rerender();
		await act(async () => {
			await create();
		});
		expect(wire).toEqual([]);
	});
}
