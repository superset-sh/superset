import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own the isolated test child's directory.
import { mkdtempSync, rmSync } from "node:fs";
import type { MouseEventHandler, ReactNode } from "react";

if (process.env.SUPERSET_I3_FIXTURE !== "1") {
	test("issue producer uses an isolated real React caller", () => {
		const cwd = mkdtempSync("/tmp/superset-issue-producer-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_I3_FIXTURE: "1",
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
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Outbound denied");
		},
		{ preconnect() {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before importing application callers.
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(() => {
		throw Error("Socket denied");
	});
	spyOn(Bun, "spawn").mockImplementation(() => {
		throw Error("Native denied");
	});
	spyOn(Bun, "spawnSync").mockImplementation(() => {
		throw Error("Native denied");
	});
	const dotenvName: string = "dotenv";
	mock.module(dotenvName, () => ({
		config: () => {
			throw Error("Environment denied");
		},
	}));
	const React = await import("react"),
		{ createRoot } = await import("react-dom/client");
	const t = (input: { message: string }) => input.message;
	const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
	const Button = (p: {
		children?: ReactNode;
		onClick?: MouseEventHandler<HTMLButtonElement>;
		disabled?: boolean;
		title?: string;
		"aria-label"?: string;
		"data-issue-identity-retry"?: boolean;
	}) => (
		<button
			type="button"
			onClick={p.onClick}
			disabled={p.disabled}
			title={p.title}
			aria-label={p["aria-label"]}
			data-issue-identity-retry={p["data-issue-identity-retry"]}
		>
			{p.children}
		</button>
	);
	mock.module("@lingui/react/macro", () => ({
		useLingui: () => ({ t }),
		Trans: Box,
		Plural: ({
			one,
			other,
			value,
		}: {
			one: string;
			other: string;
			value: number;
		}) => <span>{value === 1 ? one : other}</span>,
	}));
	mock.module("@lingui/core/macro", () => ({
		msg: (x: unknown) => x,
		plural: (_n: number, x: { one: string; other: string }) => x.other,
	}));
	mock.module("@superset/i18n", () => ({
		i18n: new Proxy({}, { get: (_t, k) => (k === "_" ? t : undefined) }),
	}));
	mock.module("@superset/ui/button", () => ({ Button }));
	mock.module("@superset/ui/scroll-area", () => ({ ScrollArea: Box }));
	mock.module("@superset/ui/checkbox", () => ({
		Checkbox: (p: {
			checked: boolean;
			onCheckedChange: (v: boolean) => void;
			"aria-label"?: string;
		}) => (
			<input
				type="checkbox"
				checked={p.checked}
				aria-label={p["aria-label"]}
				onChange={(e) => p.onCheckedChange(e.currentTarget.checked)}
			/>
		),
	}));
	mock.module("@superset/ui/popover", () => ({
		Popover: ({
			children,
			onOpenChange,
			open,
		}: {
			children?: ReactNode;
			onOpenChange?: (v: boolean) => void;
			open?: boolean;
		}) => (
			<div>
				<button
					type="button"
					data-fixture-open
					onClick={() => onOpenChange?.(!open)}
				>
					Open popover
				</button>
				{children}
			</div>
		),
		PopoverTrigger: Box,
		PopoverContent: Box,
	}));
	mock.module("@superset/ui/tooltip", () => ({
		Tooltip: Box,
		TooltipTrigger: Box,
		TooltipContent: Box,
	}));
	mock.module("@superset/ui/command", () => ({
		Command: Box,
		CommandEmpty: Box,
		CommandGroup: Box,
		CommandList: Box,
		CommandInput: () => null,
		CommandItem: (p: { children?: ReactNode; onSelect: () => void }) => (
			<button type="button" data-fixture-select onClick={p.onSelect}>
				{p.children}
			</button>
		),
	}));
	let errors: string[] = [],
		promises: Promise<unknown>[] = [];
	mock.module("@superset/ui/sonner", () => ({
		toast: {
			error: (v: string) => errors.push(v),
			promise: (p: Promise<unknown>) => {
				promises.push(p);
				p.catch(() => {});
			},
		},
	}));
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	const { useNewWorkspaceDraftStore: draft } = await import(
		"renderer/stores/new-workspace-draft"
	);
	const { linkedIssueFromGitLab } = await import(
		"renderer/routes/_authenticated/utils/linkedIssueFromGitLab"
	);
	const native = {
		projectId: "p",
		hostId: "h",
		hostUrl: "https://relay.example/o/h",
		issueNumber: 7,
		title: "Native issue",
		url: "https://git.example:8443/Group/Sub/Repo/-/issues/7",
		state: "opened",
	};
	const gh = {
		...native,
		url: "https://github.com/Owner/Repo/issues/7",
		title: "GH issue",
		state: "OPEN",
	};
	let root: ReturnType<typeof createRoot> | undefined,
		element: HTMLDivElement | undefined;
	const required = <T,>(value: T | null | undefined): T => {
		if (value === null || value === undefined)
			throw Error("Missing fixture value");
		return value;
	};
	const render = async (node: ReactNode) => {
		if (!root) {
			element = document.createElement("div");
			document.body.append(element);
			root = createRoot(element);
		}
		await React.act(async () => {
			required(root).render(
				<QueryClientProvider client={client}>{node}</QueryClientProvider>,
			);
			await new Promise((r) => setTimeout(r, 5));
		});
		await React.act(async () => {
			await new Promise((r) => setTimeout(r, 5));
		});
	};
	const click = async (selector: string) => {
		const e = required(element?.querySelector<HTMLElement>(selector));
		await React.act(async () => {
			e.click();
			await new Promise((r) => setTimeout(r, 5));
		});
	};
	afterEach(async () => {
		if (root) await React.act(() => root?.unmount());
		root = undefined;
		element?.remove();
		element = undefined;
		client.clear();
		draft.getState().resetDraft();
		errors = [];
		promises = [];
	});

	let listFetching = false,
		listError: Error | null = null;
	let rows = [native],
		navigation: unknown[] = [],
		opened: string[] = [],
		selection: unknown[] = [],
		rowKeys: string[] = [];
	mock.module("@tanstack/react-router", () => ({
		useNavigate: () => (input: unknown) => navigation.push(input),
	}));
	mock.module("renderer/hooks/useDebouncedValue", () => ({
		useDebouncedValue: (x: unknown) => x,
	}));
	mock.module("renderer/hooks/useOpenNewWorkspace", () => ({
		useOpenNewWorkspace: () => (p: string) => opened.push(p),
	}));
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: () => {
			throw Error("Unexpected direct list fetch");
		},
	}));
	mock.module(
		"renderer/routes/_authenticated/_dashboard/hooks/useWorkItemsList",
		() => ({
			useWorkItemsList: (options: {
				getRowKey: (row: typeof native) => string;
			}) => {
				rowKeys = rows.map(options.getRowKey);
				return {
					rows,
					totalCount: rows.length,
					repoMismatch: null,
					isFetching: listFetching,
					isFetchingNextPage: false,
					hasNextPage: false,
					error: listError,
					refetch() {},
					scrollRef: undefined,
					sentinelRef: undefined,
				};
			},
		}),
	);
	mock.module(
		"renderer/routes/_authenticated/_dashboard/components/LoadMoreSentinel",
		() => ({ LoadMoreSentinel: () => null }),
	);
	const { GitHubIssuesContent } = await import("./GitHubIssuesContent");
	const props = {
		projectFilters: ["p"],
		projectTargets: [
			{
				projectId: "p",
				projectName: "Repo",
				hostId: "h",
				hostUrl: native.hostUrl,
			},
		],
		areProjectsReady: true,
		hasProjects: true,
		searchQuery: "",
		includeClosed: false,
		onSelectionChange: (s: unknown[]) => {
			selection = s;
		},
	};
	beforeEach(() => {
		listFetching = false;
		listError = null;
		rows = [native];
		navigation = [];
		opened = [];
		selection = [];
	});
	test("actual native list add retains full serving identity and provider draft", async () => {
		await render(<GitHubIssuesContent {...props} />);
		await click('[aria-label="Add issue #7 to workspace"]');
		expect(draft.getState().linkedIssues).toEqual([
			required(linkedIssueFromGitLab(native)),
		]);
		expect(draft.getState().hostId).toBe("h");
		expect(opened).toEqual(["p"]);
	});
	test("actual native preview preserves expected URL through tasks validator", async () => {
		await render(<GitHubIssuesContent {...props} />);
		await click('[role="button"]');
		expect(navigation).toMatchObject([
			{ search: { issueUrl: native.url, project: "p" } },
		]);
	});
	test("actual native batch selection retains complete reference", async () => {
		await render(<GitHubIssuesContent {...props} />);
		await click('input[type="checkbox"]');
		expect(selection).toMatchObject([
			{ gitlab: required(linkedIssueFromGitLab(native)).gitlab },
		]);
	});
	test("same IID native instances keep distinct selected rows", async () => {
		rows = [
			native,
			{
				...native,
				url: native.url.replace("git.example:8443", "other.example:9443"),
			},
		];
		await render(<GitHubIssuesContent {...props} />);
		const inputs =
			required(element).querySelectorAll<HTMLInputElement>("input");
		await React.act(() => {
			for (const i of inputs) i.click();
		});
		expect(selection).toHaveLength(2);
	});
	test("native merge keys keep identical repository issues on separate serving hosts", async () => {
		rows = [
			native,
			{
				...native,
				hostId: "other-host",
				hostUrl: "https://relay.example/o/other-host",
			},
		];
		await render(<GitHubIssuesContent {...props} />);
		expect(new Set(rowKeys).size).toBe(2);
	});
	test("malformed native list identity refuses draft and exposes error", async () => {
		rows = [{ ...native, url: native.url.replace("Group", "%252e%252e") }];
		await render(<GitHubIssuesContent {...props} />);
		await click('[aria-label="Add issue #7 to workspace"]');
		expect(opened).toEqual([]);
		expect(draft.getState().linkedIssues).toEqual([]);
		expect(errors).toHaveLength(1);
	});
	test("original GH list add shape and preview keys remain unchanged", async () => {
		rows = [gh];
		await render(<GitHubIssuesContent {...props} />);
		await click('[aria-label="Add issue #7 to workspace"]');
		expect(draft.getState().linkedIssues).toEqual([
			{
				slug: "gh-7",
				title: "GH issue",
				source: "github",
				url: gh.url,
				number: 7,
				state: "open",
			},
		]);
		await click('[role="button"]');
		expect(navigation).toEqual([
			{
				to: "/tasks/issue/$issueNumber",
				params: { issueNumber: "7" },
				search: {
					search: undefined,
					type: "issues",
					project: "p",
					projects: "p",
					state: undefined,
				},
			},
		]);
	});
	test("canonical GitHub dash repository keeps original selection, draft, and preview", async () => {
		const dash = { ...gh, url: "https://github.com/acme/-/issues/7" };
		rows = [dash];
		await render(<GitHubIssuesContent {...props} />);
		expect(rowKeys).toEqual(["p:7"]);
		await click('input[type="checkbox"]');
		expect(selection).toEqual([
			{
				issueNumber: 7,
				title: dash.title,
				url: dash.url,
				state: dash.state,
				projectId: "p",
			},
		]);
		expect(
			required(
				element?.querySelector<HTMLInputElement>('input[type="checkbox"]'),
			).checked,
		).toBe(true);
		await click('[aria-label="Add issue #7 to workspace"]');
		expect(draft.getState().linkedIssues).toEqual([
			{
				slug: "gh-7",
				title: dash.title,
				source: "github",
				url: dash.url,
				number: 7,
				state: "open",
			},
		]);
		expect(opened).toEqual(["p"]);
		expect(navigation).toHaveLength(1);
		navigation = [];
		await click('[role="button"]');
		expect(navigation).toEqual([
			{
				to: "/tasks/issue/$issueNumber",
				params: { issueNumber: "7" },
				search: {
					search: undefined,
					type: "issues",
					project: "p",
					projects: "p",
					state: undefined,
				},
			},
		]);
		expect(errors).toEqual([]);
	});
	test("non-GitHub four-segment native marker remains refused", async () => {
		rows = [{ ...native, url: "https://git.example:8443/acme/-/issues/7" }];
		await render(<GitHubIssuesContent {...props} />);
		await click('input[type="checkbox"]');
		await click('[aria-label="Add issue #7 to workspace"]');
		await click('[role="button"]');
		expect(selection).toEqual([]);
		expect(opened).toEqual([]);
		expect(navigation).toEqual([]);
		expect(draft.getState().linkedIssues).toEqual([]);
		expect(errors).toHaveLength(4);
	});
	test("zero native rows use selected live provider rather than row inference", async () => {
		rows = [];
		await render(
			<GitHubIssuesContent
				{...props}
				issueSelection={{ mode: "gitlab", pending: false }}
			/>,
		);
		expect(element?.textContent).toContain("GitLab issues");
		expect(element?.textContent).not.toContain("GitHub issues");
		expect(
			element?.querySelector('[aria-label="Refresh issues"]') !== null,
		).toBe(true);
	});
	test("pending selected identity stays neutral despite a cached GitHub row", async () => {
		rows = [gh];
		listFetching = true;
		await render(
			<GitHubIssuesContent
				{...props}
				issueSelection={{ mode: "unknown", pending: true }}
			/>,
		);
		expect(element?.textContent).not.toContain("GitHub issues");
		expect(element?.textContent).toContain("Loading repositories…");
	});
	test("native list authentication error is visible without a false empty success", async () => {
		rows = [];
		listError = new Error("Fixture native authentication required");
		await render(
			<GitHubIssuesContent
				{...props}
				issueSelection={{ mode: "gitlab", pending: false }}
			/>,
		);
		expect(element?.textContent).toContain(listError.message);
		expect(element?.textContent).not.toContain("No open issues.");
		expect(element?.textContent).not.toContain("GitHub issues");
	});
	test("metadata failure remains visible alongside existing rows and can be retried", async () => {
		let retries = 0;
		await render(
			<GitHubIssuesContent
				{...props}
				issueSelection={{
					mode: "unknown",
					pending: false,
					error: "Fixture live identity outage",
					refetch: () => {
						retries++;
					},
				}}
			/>,
		);
		expect(element?.textContent).toContain("Fixture live identity outage");
		await click("[data-issue-identity-retry]");
		expect(retries).toBe(1);
	});
	test("metadata loading or failure cannot claim an empty issue success", async () => {
		rows = [];
		await render(
			<GitHubIssuesContent
				{...props}
				issueSelection={{ mode: "unknown", pending: true }}
			/>,
		);
		expect(element?.textContent).toContain("Loading repositories…");
		expect(element?.textContent).not.toContain("No open issues.");
		await render(
			<GitHubIssuesContent
				{...props}
				issueSelection={{
					mode: "unknown",
					pending: false,
					error: "Fixture current repo cannot resolve",
				}}
			/>,
		);
		expect(element?.textContent).toContain(
			"Fixture current repo cannot resolve",
		);
		expect(element?.textContent).not.toContain("No open issues.");
	});
}
