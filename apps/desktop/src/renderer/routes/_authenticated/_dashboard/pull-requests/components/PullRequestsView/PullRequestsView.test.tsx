import { afterEach, beforeEach, expect, mock, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: isolated test child owns its temporary cwd
import { mkdtempSync, rmSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: isolated test child resolves its preload file
import { resolve } from "node:path";
import type { ReactNode } from "react";

if (process.env.SUPERSET_NATIVE_FILTER_VIEW !== "1") {
	test("actual PR view isolates host metadata and URL/store boundaries", () => {
		const cwd = mkdtempSync("/tmp/superset-native-filter-view-");
		try {
			const desktop = resolve(import.meta.dir, "../".repeat(8));
			const child = Bun.spawnSync(
				[
					process.execPath,
					"--no-env-file",
					"test",
					"--preload",
					resolve(desktop, "test-setup.ts"),
					import.meta.path,
				],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_NATIVE_FILTER_VIEW: "1",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 30000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 35000);
} else {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	const { act, cleanup, fireEvent, render, within, waitFor } = await import(
		"@testing-library/react"
	);
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	let url = "http://first.invalid";
	let provider: "gitlab" | "github" = "gitlab";
	let release: (() => void) | undefined;
	let pending = false;
	let failure: Error | null = null;
	let rulesFailure:
		| { code: "UNAUTHORIZED" | "SERVICE_UNAVAILABLE"; message: string }
		| undefined;
	let showNativeControls = false;
	let contributorCalls = 0;
	let queried: string[] = [];
	let navigations: unknown[] = [];
	mock.module("@tanstack/react-router", () => ({
		useNavigate: () => (input: unknown) => {
			navigations.push(input);
		},
	}));
	mock.module(
		"renderer/routes/_authenticated/_dashboard/hooks/useDebouncedSearchNavigation",
		() => ({
			useDebouncedSearchNavigation: () => ({
				cancelPendingSearchNavigation: () => {},
				scheduleSearchNavigation: () => {},
			}),
		}),
	);
	mock.module(
		"renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets",
		() => ({
			useProjectQueryTargets: () => ({
				isReady: true,
				projects: [
					{
						projectKey: "project",
						name: "Fixture",
						repoOwner: "Group/Sub",
						repoName: "Widget",
					},
				],
				targets: [
					{
						projectId: "project",
						projectName: "Fixture",
						hostId: url,
						hostUrl: url,
					},
				],
			}),
			groupProjectTargetsByHost: () => [
				{
					key: url,
					hostId: url,
					hostUrl: url,
					projects: [{ projectId: "project", projectName: "Fixture" }],
				},
			],
		}),
	);
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: (host: string) => ({
			project: {
				get: {
					query: async (input: { projectId: string }) => {
						expect(input.projectId).toBe("project");
						return {
							repoUrl:
								provider === "github"
									? "https://github.com/acme/widget.git"
									: "https://gitlab.com/group/widget",
							repoOwner: "acme",
							repoName: "widget",
						};
					},
				},
			},
			workspaceCreation: {
				getRepoContributors: {
					query: async () => {
						contributorCalls++;
						throw new Error("Native author must not query GitHub contributors");
					},
				},
				getPullRequestSearchCapabilities: {
					query: async (input: { projectIds: string[] }) => {
						queried.push(host);
						if (failure) throw failure;
						expect(input.projectIds).toEqual(["project"]);
						if (pending)
							await new Promise<void>((resolve) => {
								release = resolve;
							});
						return [
							{
								projectId: "project",
								provider,
								host:
									provider === "gitlab" ? "native.example:8443" : "github.com",
								projectPath: "Group/Sub/Widget",
								approvalRules: rulesFailure
									? "unknown"
									: provider === "gitlab"
										? "unavailable"
										: "available",
								error: rulesFailure,
							},
						];
					},
				},
			},
		}),
	}));
	const PopoverBoundary = ({ children }: { children?: ReactNode }) => (
		<div>{children}</div>
	);
	mock.module("@superset/ui/popover", () => ({
		Popover: PopoverBoundary,
		PopoverTrigger: PopoverBoundary,
		PopoverContent: PopoverBoundary,
	}));
	const { AuthorFilter } = await import(
		"./components/PullRequestsTopBar/components/AuthorFilter/AuthorFilter"
	);
	const { ReviewFilter } = await import(
		"./components/PullRequestsTopBar/components/ReviewFilter/ReviewFilter"
	);
	type SearchSelection =
		import("../../utils/pullRequestReviewFilter/pullRequestReviewFilter").PullRequestSearchSelection;
	mock.module("./components/PullRequestsTopBar", () => ({
		PullRequestsTopBar: (props: {
			authorFilter: string | null;
			searchSelection?: SearchSelection;
			onAuthorFilterChange: (value: string | null) => void;
		}) => (
			<div
				data-testid="topbar"
				data-mode={props.searchSelection?.mode}
				data-ready={String(props.searchSelection?.ready)}
				data-error={props.searchSelection?.error}
			>
				<span>{props.authorFilter}</span>
				{showNativeControls && (
					<>
						<AuthorFilter
							value={props.authorFilter}
							onChange={props.onAuthorFilterChange}
							projectTargets={[
								{
									projectId: "project",
									projectName: "Fixture",
									hostId: url,
									hostUrl: url,
								},
							]}
							searchSelection={props.searchSelection}
						/>
						<ReviewFilter
							value={null}
							onChange={() => {}}
							searchSelection={props.searchSelection}
						/>
					</>
				)}
				<button
					type="button"
					onClick={() => props.onAuthorFilterChange("native_user")}
				>
					Choose native author
				</button>
			</div>
		),
	}));
	mock.module("./components/PullRequestsContent", () => ({
		PullRequestsContent: (props: { authorFilter: string | null }) => (
			<div data-testid="content">{props.authorFilter}</div>
		),
	}));
	const { usePullRequestsFilterStore } = await import(
		"../../stores/pullRequestsFilterStore"
	);
	const { PullRequestsView } = await import("./PullRequestsView");
	let client: InstanceType<typeof QueryClient>;
	beforeEach(() => {
		url = "http://first.invalid";
		provider = "gitlab";
		pending = false;
		failure = null;
		rulesFailure = undefined;
		showNativeControls = false;
		contributorCalls = 0;
		release = undefined;
		queried = [];
		navigations = [];
		client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		usePullRequestsFilterStore.setState({
			projectFilters: [],
			authorFilter: null,
			reviewFilter: null,
			search: "",
		});
	});
	afterEach(() => {
		cleanup();
		client.clear();
	});
	test("cached native capability remains ready during background refresh", async () => {
		render(
			<QueryClientProvider client={client}>
				<PullRequestsView initialAuthor="native_user" />
			</QueryClientProvider>,
		);
		const page = within(document.body);
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
				"gitlab",
			),
		);
		pending = true;
		let refresh!: Promise<unknown>;
		await act(async () => {
			refresh = client.invalidateQueries({
				predicate: (q) => q.queryKey.includes("searchCapabilities"),
			});
			await Promise.resolve();
		});
		await waitFor(() => expect(release).toBeDefined());
		expect(client.isFetching()).toBeGreaterThan(0);
		expect(page.getByTestId("topbar").getAttribute("data-ready")).toBe("true");
		expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe("gitlab");
		expect(page.getByTestId("content").textContent).toBe("native_user");
		await act(async () => {
			pending = false;
			release?.();
			await refresh;
		});
	});
	test("keeps native URL author while capabilities are pending then dispatches it through existing field", async () => {
		pending = true;
		render(
			<QueryClientProvider client={client}>
				<PullRequestsView initialAuthor="native_user,@me" />
			</QueryClientProvider>,
		);
		const page = within(document.body);
		expect(page.getByTestId("content").textContent).toBe("native_user,@me");
		expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
			"unknown",
		);
		await act(async () => {
			pending = false;
			release?.();
		});
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
				"gitlab",
			),
		);
		await act(async () => {
			fireEvent.click(
				page.getByRole("button", { name: "Choose native author" }),
			);
		});
		expect(usePullRequestsFilterStore.getState().authorFilter).toBe(
			"native_user",
		);
		expect(navigations.at(-1)).toMatchObject({
			search: { author: "native_user" },
		});
	});
	test("host switching does not reuse previous native capabilities or destroy a persisted author", async () => {
		const view = render(
			<QueryClientProvider client={client}>
				<PullRequestsView initialAuthor="native_user" />
			</QueryClientProvider>,
		);
		const page = within(document.body);
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
				"gitlab",
			),
		);
		url = "http://second.invalid";
		provider = "github";
		pending = true;
		view.rerender(
			<QueryClientProvider client={client}>
				<PullRequestsView initialAuthor="native_user" />
			</QueryClientProvider>,
		);
		expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
			"unknown",
		);
		expect(page.getByTestId("content").textContent).toBe("native_user");
		await act(async () => {
			pending = false;
			release?.();
		});
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
				"github",
			),
		);
		expect(queried).toEqual(["http://first.invalid", "http://second.invalid"]);
	});
	test("preserves legacy GitHub URL canonicalization after known GitHub capability data", async () => {
		provider = "github";
		render(
			<QueryClientProvider client={client}>
				<PullRequestsView initialAuthor=" @octocat,@me " />
			</QueryClientProvider>,
		);
		const page = within(document.body);
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
				"github",
			),
		);
		expect(page.getByTestId("content").textContent).toBe("octocat,me");
	});
	test("keeps GitHub author filtering available when an older host lacks capability discovery", async () => {
		provider = "github";
		failure = new Error(
			'No procedure found on path "workspaceCreation.getPullRequestSearchCapabilities"',
		);
		render(
			<QueryClientProvider client={client}>
				<PullRequestsView initialAuthor=" @octocat,@me " />
			</QueryClientProvider>,
		);
		const page = within(document.body);
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
				"github",
			),
		);
		expect(page.getByTestId("topbar").getAttribute("data-ready")).toBe("true");
		expect(page.getByTestId("topbar").getAttribute("data-error")).toBeNull();
		expect(page.getByTestId("content").textContent).toBe("octocat,me");
	});
	test("keeps GitLab unavailable when an older host lacks capability discovery", async () => {
		const failureMessage =
			'No procedure found on path "workspaceCreation.getPullRequestSearchCapabilities"';
		failure = new Error(failureMessage);
		render(
			<QueryClientProvider client={client}>
				<PullRequestsView initialAuthor="native_user" />
			</QueryClientProvider>,
		);
		const page = within(document.body);
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-error")).toBe(
				failureMessage,
			),
		);
		expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
			"unknown",
		);
		expect(page.getByTestId("content").textContent).toBe("native_user");
	});
	test("an outage invalidates old live capability authority and then recovers without dropping author", async () => {
		render(
			<QueryClientProvider client={client}>
				<PullRequestsView initialAuthor="native_user" />
			</QueryClientProvider>,
		);
		const page = within(document.body);
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
				"gitlab",
			),
		);
		failure = new Error("Fixture capability outage");
		await act(async () => {
			await client.invalidateQueries({
				queryKey: ["pullRequests", "searchCapabilities"],
			});
		});
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
				"unknown",
			),
		);
		expect(page.getByTestId("content").textContent).toBe("native_user");
		expect(page.getByTestId("topbar").getAttribute("data-error")).toBe(
			"Fixture capability outage",
		);
		failure = null;
		await act(async () => {
			await client.invalidateQueries({
				queryKey: ["pullRequests", "searchCapabilities"],
			});
		});
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
				"gitlab",
			),
		);
	});
	test.each([
		"UNAUTHORIZED",
		"SERVICE_UNAVAILABLE",
	] as const)("known native repository retains author and current-cycle controls when rules probe is %s", async (code) => {
		const expectedMessage = `Fixture rules probe ${code}`;
		rulesFailure = { code, message: expectedMessage };
		showNativeControls = true;
		render(
			<QueryClientProvider client={client}>
				<PullRequestsView initialAuthor="native_user,@me" />
			</QueryClientProvider>,
		);
		const page = within(document.body);
		await waitFor(() =>
			expect(page.getByTestId("topbar").getAttribute("data-mode")).toBe(
				"gitlab",
			),
		);
		expect(page.getByTestId("topbar").getAttribute("data-ready")).toBe("true");
		expect(page.getByTestId("content").textContent).toBe("native_user,@me");
		expect(page.getByTestId("topbar").getAttribute("data-error")).toBe(
			expectedMessage,
		);
		await act(async () => {
			fireEvent.click(
				page.getByRole("button", { name: "Author: @native_user, @me" }),
			);
		});
		expect(page.getByRole("combobox").getAttribute("placeholder")).toBe(
			"GitLab username or @me…",
		);
		expect(contributorCalls).toBe(0);
		expect(
			document.querySelector('img[src^="https://github.com/"]'),
		).toBeNull();
		await act(async () => {
			fireEvent.keyDown(page.getByRole("combobox"), {
				key: "Escape",
				code: "Escape",
			});
		});
		await act(async () => {
			fireEvent.click(
				page.getByRole("button", { name: "Reviews: All reviews" }),
			);
		});
		await waitFor(() =>
			expect(
				page.getAllByRole("alert").map((alert) => alert.textContent),
			).toEqual([expectedMessage, expectedMessage]),
		);
		expect(
			page
				.getByRole("radio", { name: /Approved with all approval rules met/ })
				.hasAttribute("disabled"),
		).toBe(true);
		expect(
			page
				.getByRole("radio", { name: /Pending reviews or unmet approval rules/ })
				.hasAttribute("disabled"),
		).toBe(true);
		expect(
			page
				.getByRole("radio", {
					name: "Reviewed by you in the current review cycle",
				})
				.hasAttribute("disabled"),
		).toBe(false);
		expect(
			page.queryByRole("radio", {
				name: "Awaiting review from you or your team",
			}),
		).toBeNull();
		await act(async () => {
			fireEvent.click(
				page.getByRole("button", { name: "Close review filter" }),
			);
		});
	});
}
