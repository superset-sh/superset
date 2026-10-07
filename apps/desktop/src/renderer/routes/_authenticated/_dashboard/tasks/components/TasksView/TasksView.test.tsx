import { afterEach, beforeEach, expect, mock, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: isolated test child owns its temporary cwd
import { mkdtempSync, rmSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: isolated test child resolves its preload file
import { resolve } from "node:path";

if (process.env.SUPERSET_I4_TASK_VIEW !== "1") {
	test("actual Tasks view preserves native filter routing", () => {
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
						SUPERSET_I4_TASK_VIEW: "1",
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
	const { render, within, waitFor, fireEvent, act, cleanup } = await import(
		"@testing-library/react"
	);
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	let url = "http://first.invalid",
		provider: "gitlab" | "github" = "gitlab",
		pending = false,
		failure: Error | null = null,
		release: (() => void) | undefined;
	let navigation: unknown[] = [];
	mock.module("@tanstack/react-router", () => ({
		useNavigate: () => (v: unknown) => navigation.push(v),
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
				projects: [{ projectKey: "p", name: "Fixture" }],
				targets: [
					{ projectId: "p", projectName: "Fixture", hostId: "h", hostUrl: url },
				],
			}),
			groupProjectTargetsByHost: () => [
				{
					key: "h-p",
					hostId: "h",
					hostUrl: url,
					projects: [{ projectId: "p", projectName: "Fixture" }],
				},
			],
		}),
	);
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: () => ({
			workspaceCreation: {
				getIssueSearchCapabilities: {
					query: async () => {
						if (failure) throw failure;
						if (pending)
							await new Promise<void>((r) => {
								release = r;
							});
						return [
							{
								projectId: "p",
								provider,
								host: "native.example:8443",
								projectPath: "Group/Sub/Widget",
							},
						];
					},
				},
			},
		}),
	}));
	for (const name of ["BoardContent", "TableContent", "LinearIssuesContent"])
		mock.module(`./components/${name}`, () => ({ [name]: () => null }));
	mock.module("./components/TasksTopBar", () => ({
		TasksTopBar: (p: {
			issueSelection?: { mode: string; pending: boolean; error?: string };
			includeClosedIssues: boolean;
			onIncludeClosedIssuesChange: (v: boolean) => void;
			searchQuery: string;
			onSearchChange: (v: string) => void;
		}) => (
			<div
				data-testid="topbar"
				data-mode={p.issueSelection?.mode}
				data-pending={String(p.issueSelection?.pending)}
			>
				<button
					type="button"
					onClick={() => p.onIncludeClosedIssuesChange(true)}
				>
					All issues
				</button>
				<input
					aria-label="Fixture text"
					value={p.searchQuery}
					onChange={(e) => p.onSearchChange(e.target.value)}
				/>
			</div>
		),
	}));
	mock.module("./components/GitHubIssuesContent", () => ({
		GitHubIssuesContent: (p: {
			issueSelection?: { mode: string; pending: boolean; error?: string };
			includeClosed: boolean;
			searchQuery: string;
		}) => (
			<div
				data-testid="content"
				data-mode={p.issueSelection?.mode}
				data-error={p.issueSelection?.error}
				data-state={String(p.includeClosed)}
			>
				{p.searchQuery}
			</div>
		),
	}));
	const { TasksView } = await import("./TasksView");
	const { useTasksFilterStore } = await import(
		"../../stores/tasks-filter-state"
	);
	let client: InstanceType<typeof QueryClient>;
	beforeEach(() => {
		url = "http://first.invalid";
		provider = "gitlab";
		pending = false;
		failure = null;
		release = undefined;
		navigation = [];
		client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		useTasksFilterStore.setState({
			typeTab: "issues",
			projectFilters: [],
			includeClosedIssues: false,
			search: "",
		});
	});
	afterEach(() => {
		cleanup();
		client.clear();
	});
	test("pending native identity and settled state filters reach actual list without changing state URL contract", async () => {
		pending = true;
		render(
			<QueryClientProvider client={client}>
				<TasksView
					initialType="issues"
					initialSearch="native text"
					initialState="all"
				/>
			</QueryClientProvider>,
		);
		const page = within(document.body);
		expect(page.getByTestId("content").getAttribute("data-mode")).toBe(
			"unknown",
		);
		expect(page.getByTestId("content").getAttribute("data-state")).toBe("true");
		expect(page.getByTestId("content").textContent).toBe("native text");
		await act(async () => {
			pending = false;
			release?.();
		});
		await waitFor(() =>
			expect(page.getByTestId("content").getAttribute("data-mode")).toBe(
				"gitlab",
			),
		);
		await act(async () => {
			fireEvent.click(page.getByRole("button", { name: "All issues" }));
		});
		expect(navigation.at(-1)).toMatchObject({
			search: { type: "issues", search: "native text", state: "all" },
		});
	});
	test("switching serving host drops cached native authority until new live GitHub response", async () => {
		const ui = render(
			<QueryClientProvider client={client}>
				<TasksView initialType="issues" />
			</QueryClientProvider>,
		);
		const page = within(document.body);
		await waitFor(() =>
			expect(page.getByTestId("content").getAttribute("data-mode")).toBe(
				"gitlab",
			),
		);
		url = "http://second.invalid";
		provider = "github";
		pending = true;
		ui.rerender(
			<QueryClientProvider client={client}>
				<TasksView initialType="issues" />
			</QueryClientProvider>,
		);
		expect(page.getByTestId("content").getAttribute("data-mode")).toBe(
			"unknown",
		);
		await act(async () => {
			pending = false;
			release?.();
		});
		await waitFor(() =>
			expect(page.getByTestId("content").getAttribute("data-mode")).toBe(
				"github",
			),
		);
	});
	test("current identity outage is visible and recovers without dropping existing text/state", async () => {
		failure = new Error("Fixture identity outage");
		render(
			<QueryClientProvider client={client}>
				<TasksView
					initialType="issues"
					initialSearch="native text"
					initialState="all"
				/>
			</QueryClientProvider>,
		);
		const page = within(document.body);
		await waitFor(() =>
			expect(page.getByTestId("content").getAttribute("data-error")).toBe(
				"Fixture identity outage",
			),
		);
		expect(page.getByTestId("content").getAttribute("data-mode")).toBe(
			"unknown",
		);
		failure = null;
		await act(async () => {
			await client.invalidateQueries({
				queryKey: ["issues", "searchCapabilities"],
			});
		});
		await waitFor(() =>
			expect(page.getByTestId("content").getAttribute("data-mode")).toBe(
				"gitlab",
			),
		);
		expect(page.getByTestId("content").textContent).toBe("native text");
		expect(page.getByTestId("content").getAttribute("data-state")).toBe("true");
	});
}
