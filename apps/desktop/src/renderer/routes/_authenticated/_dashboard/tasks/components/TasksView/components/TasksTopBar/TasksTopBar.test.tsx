import { afterEach, expect, mock, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: isolated test child owns temporary cwd
import { mkdtempSync, rmSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: isolated child locates desktop preload
import { resolve } from "node:path";
import type { ReactNode } from "react";

if (process.env.SUPERSET_I4_TOPBAR !== "1") {
	test("actual issue topbar preserves native and default filter controls", () => {
		const cwd = mkdtempSync("/tmp/superset-i4-topbar-");
		try {
			const child = Bun.spawnSync(
				[
					process.execPath,
					"--no-env-file",
					"test",
					"--preload",
					resolve(import.meta.dir, "../".repeat(10), "test-setup.ts"),
					import.meta.path,
				],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_I4_TOPBAR: "1",
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
	const { render, within, fireEvent, act, cleanup } = await import(
		"@testing-library/react"
	);
	afterEach(cleanup);
	const Empty = () => null;
	mock.module("@tanstack/react-router", () => ({
		useNavigate: () => () => {},
	}));

	mock.module("renderer/hooks/useIsV2CloudEnabled", () => ({
		useIsV2CloudEnabled: () => false,
	}));
	mock.module(
		"renderer/routes/_authenticated/_dashboard/components/CreateTaskDialog",
		() => ({ CreateTaskDialog: Empty }),
	);
	mock.module(
		"renderer/routes/_authenticated/_dashboard/components/PageHeader",
		() => ({
			PageHeader: ({
				start,
				end,
				children,
			}: {
				start?: ReactNode;
				end?: ReactNode;
				children?: ReactNode;
			}) => (
				<div>
					{start}
					{children}
					{end}
				</div>
			),
		}),
	);
	mock.module(
		"renderer/routes/_authenticated/_dashboard/components/ProjectFilter",
		() => ({
			ProjectFilter: ({ onChange }: { onChange: (ids: string[]) => void }) => (
				<button type="button" onClick={() => onChange(["native-project"])}>
					Choose project
				</button>
			),
		}),
	);
	mock.module(
		"renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch",
		() => ({
			WorkItemsSearch: ({
				value,
				onChange,
				placeholder,
				label,
			}: {
				value: string;
				onChange: (s: string) => void;
				placeholder: string;
				label: string;
			}) => (
				<input
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					aria-label={label}
				/>
			),
		}),
	);
	mock.module("../../../RunInWorkspacePopoverV2", () => ({
		RunInWorkspacePopoverV2: Empty,
	}));
	for (const name of [
		"AssigneeFilter",
		"CreateLinearIssueDialog",
		"LinearAssigneeFilter",
		"LinearTeamFilter",
		"RunInWorkspacePopover",
		"RunIssuesInWorkspacePopover",
		"StatusFilter",
	])
		mock.module(`./components/${name}`, () => ({ [name]: Empty }));
	const { TasksTopBar } = await import("./TasksTopBar");
	const props = {
		currentTab: "all" as const,
		onTabChange: () => {},
		searchQuery: "",
		onSearchChange: () => {},
		assigneeFilter: null,
		onAssigneeFilterChange: () => {},
		viewMode: "table" as const,
		onViewModeChange: () => {},
		taskSource: "issues" as const,
		onTaskSourceChange: () => {},
		projectFilters: [],
		onProjectFiltersChange: () => {},
		linearTeamFilter: null,
		onLinearTeamFilterChange: () => {},
		linearAssigneeFilter: null,
		onLinearAssigneeFilterChange: () => {},
		includeClosedIssues: false,
		onIncludeClosedIssuesChange: () => {},
	};
	test("native project selection retains text and Open/All semantics with native source caption", async () => {
		const state: { value: boolean | undefined } = { value: undefined };
		let projects: string[] = [];
		let text = "";
		render(
			<TasksTopBar
				{...props}
				issueSelection={{ mode: "gitlab", pending: false }}
				onIncludeClosedIssuesChange={(v) => {
					state.value = v;
				}}
				onProjectFiltersChange={(v) => {
					projects = v;
				}}
				onSearchChange={(v) => {
					text = v;
				}}
			/>,
		);
		const page = within(document.body);
		expect(page.getByRole("tab", { name: "GitLab issues" }) !== null).toBe(
			true,
		);
		expect(
			page
				.getByRole("textbox", { name: "Search GitLab issues" })
				.getAttribute("placeholder"),
		).toBe("Search GitLab issues…");
		await act(async () => {
			fireEvent.click(
				page.getByRole("radio", { name: "Show items in all states" }),
			);
			fireEvent.click(page.getByRole("button", { name: "Choose project" }));
			fireEvent.change(
				page.getByRole("textbox", { name: "Search GitLab issues" }),
				{ target: { value: "native text" } },
			);
		});
		expect(state.value).toBe(true);
		expect(projects).toEqual(["native-project"]);
		expect(text).toBe("native text");
		expect(page.queryByText("Assignee")).toBeNull();
	});
	test("default GitHub caption/search/Open controls stay unchanged", () => {
		render(<TasksTopBar {...props} />);
		const page = within(document.body);
		expect(page.getByRole("tab", { name: "GitHub issues" }) !== null).toBe(
			true,
		);
		expect(
			page
				.getByRole("textbox", { name: "Search GitHub issues" })
				.getAttribute("placeholder"),
		).toBe("Search GitHub issues…");
		expect(
			page
				.getByRole("radio", { name: "Show open items" })
				.getAttribute("data-state"),
		).toBe("on");
	});
	test.each([
		"mixed",
		"unknown",
	] as const)("%s selected repositories stay neutral before or without live identity", (mode) => {
		render(
			<TasksTopBar
				{...props}
				issueSelection={{ mode, pending: mode === "unknown" }}
			/>,
		);
		const page = within(document.body);
		expect(page.getByRole("tab", { name: "Repository issues" }) !== null).toBe(
			true,
		);
		expect(
			page
				.getByRole("textbox", { name: "Search repository issues" })
				.getAttribute("placeholder"),
		).toBe("Search repository issues…");
		expect(page.queryByText("GitHub issues")).toBeNull();
	});
}
