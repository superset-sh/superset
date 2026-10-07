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
	}) => (
		<button
			type="button"
			onClick={p.onClick}
			disabled={p.disabled}
			title={p.title}
			aria-label={p["aria-label"]}
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
	const flush = async () => {
		await React.act(async () => {
			await new Promise((r) => setTimeout(r, 10));
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

	let search: Record<string, unknown> = {
			project: "p",
			type: "issues",
			issueUrl: native.url,
		},
		params = { issueNumber: "7" },
		navigation: unknown[] = [],
		calls: unknown[] = [],
		opened: string[] = [];
	let reply: Record<string, unknown> = {};
	let failure: Error | null = null;
	mock.module("@tanstack/react-router", () => ({
		createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
			options,
			useParams: () => params,
			useSearch: () => search,
		}),
		Outlet: Box,
		useNavigate: () => (v: unknown) => navigation.push(v),
	}));
	mock.module("renderer/hooks/host-service/useHostTargetUrl", () => ({
		useHostUrl: () => native.hostUrl,
	}));
	mock.module("renderer/hooks/useOpenNewWorkspace", () => ({
		useOpenNewWorkspace: () => (v: string) => opened.push(v),
	}));
	mock.module(
		"renderer/routes/_authenticated/_dashboard/hooks/useProjectHost",
		() => ({
			useProjectHost: () => ({
				hostId: "h",
				isReady: true,
				project: { id: "p" },
			}),
		}),
	);
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: (host: string) => ({
			issues: {
				getContent: {
					query: async (input: unknown) => {
						calls.push({ host, input });
						if (failure) throw failure;
						return reply;
					},
				},
			},
		}),
	}));
	mock.module("renderer/components/MarkdownRenderer", () => ({
		MarkdownRenderer: ({ content }: { content: string }) => (
			<article>{content}</article>
		),
	}));
	mock.module(
		"renderer/routes/_authenticated/_dashboard/components/WorkItemDetailHeader",
		() => ({
			WorkItemDetailHeader: (p: {
				backLabel: string;
				externalLabel: string;
				onBack: () => void;
				onAddToWorkspace?: () => void;
				url?: string;
			}) => (
				<header>
					<button type="button" onClick={p.onBack}>
						{p.backLabel}
					</button>
					<a href={p.url}>{p.externalLabel}</a>
					{p.onAddToWorkspace && (
						<button type="button" aria-label="add" onClick={p.onAddToWorkspace}>
							Add
						</button>
					)}
				</header>
			),
		}),
	);
	mock.module(
		"renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState",
		() => ({
			WorkItemDetailState: (p: { message: string; onRetry?: () => void }) => (
				<aside>
					{p.message}
					{p.onRetry && (
						<button type="button" aria-label="retry" onClick={p.onRetry}>
							Retry
						</button>
					)}
				</aside>
			),
		}),
	);
	const { Route } = await import("./page"),
		{ Route: layout } = await import("../../layout");
	const Page = required(Route.options.component);
	beforeEach(() => {
		search = { project: "p", type: "issues", issueUrl: native.url };
		params = { issueNumber: "7" };
		navigation = [];
		calls = [];
		opened = [];
		failure = null;
		reply = {
			number: 7,
			title: "Native issue",
			body: "Complete native description",
			state: "open",
			url: native.url,
			provider: "gitlab",
			expectedIssueUrl: native.url,
			author: "alice",
		};
	});
	test("actual layout retains native issue URL but keeps old search defaults", () => {
		const validateSearch = layout.options.validateSearch;
		if (typeof validateSearch !== "function")
			throw Error("Missing layout search validator");
		expect(
			validateSearch({ type: "issues", issueUrl: native.url }),
		).toMatchObject({ issueUrl: native.url });
		expect(
			validateSearch({ type: "tasks", issueUrl: native.url }),
		).not.toHaveProperty("issueUrl");
	});
	test("actual native detail request binds URL and renders native labels/description", async () => {
		await render(<Page />);
		expect(calls).toEqual([
			{
				host: native.hostUrl,
				input: { projectId: "p", issueNumber: 7, expectedIssueUrl: native.url },
			},
		]);
		expect(element?.textContent).toContain("Back to GitLab issues");
		expect(element?.textContent).toContain("Open issue in GitLab");
		expect(element?.textContent).toContain("Complete native description");
		await click('[aria-label="add"]');
		const expected = linkedIssueFromGitLab(native);
		if (!expected) throw Error("Invalid native issue fixture");
		expect(draft.getState().linkedIssues).toEqual([expected]);
	});
	test("actual back deliberately drops native issue URL", async () => {
		await render(<Page />);
		await click("header button");
		expect(navigation).toMatchObject([{ to: "/tasks" }]);
		expect(
			(navigation[0] as { search: Record<string, unknown> }).search,
		).not.toHaveProperty("issueUrl");
	});
	for (const kind of ["old-host", "ack", "url", "iid"]) {
		test(`actual native detail refuses ${kind} metadata and supports retry`, async () => {
			if (kind === "old-host") delete reply.provider;
			if (kind === "ack") delete reply.expectedIssueUrl;
			if (kind === "url") reply.url = native.url.replace(":8443", ":9443");
			if (kind === "iid") reply.number = 8;
			await render(<Page />);
			expect(element?.querySelector("article") === null).toBe(true);
			expect(element?.querySelector('[aria-label="add"]') === null).toBe(true);
			expect(element?.querySelector('[aria-label="retry"]') !== null).toBe(
				true,
			);
			reply = {
				number: 7,
				title: "Fixed",
				body: "Refetched native description",
				url: native.url,
				state: "open",
				provider: "gitlab",
				expectedIssueUrl: native.url,
			};
			await click('[aria-label="retry"]');
			await flush();
			expect(element?.textContent).toContain("Refetched native description");
		});
	}
	test("malformed raw native route URL never queries", async () => {
		search.issueUrl = native.url.replace("Group", "%252e%252e");
		await render(<Page />);
		expect(calls).toEqual([]);
		expect(element?.querySelector('[aria-label="add"]') === null).toBe(true);
	});
	test("native detail missing project uses native instructions and never queries", async () => {
		search = { type: "issues", issueUrl: native.url };
		await render(<Page />);
		expect(calls).toEqual([]);
		expect(element?.textContent).toContain(
			"Choose a project from GitLab issues before opening an issue.",
		);
	});
	test("same IID detail switching native port gets new acknowledged content", async () => {
		await render(<Page />);
		const other = native.url.replace(":8443", ":9443");
		search = { project: "p", type: "issues", issueUrl: other };
		reply = {
			...reply,
			url: other,
			expectedIssueUrl: other,
			body: "Other instance description",
		};
		await render(<Page />);
		expect(calls).toHaveLength(2);
		expect(element?.textContent).toContain("Other instance description");
		expect(element?.textContent).not.toContain("Complete native description");
	});

	test("original GH detail input and draft stay unchanged", async () => {
		search = { project: "p", type: "issues" };
		reply = {
			number: 7,
			title: gh.title,
			body: "GH body",
			state: "open",
			url: gh.url,
		};
		await render(<Page />);
		expect(calls).toEqual([
			{ host: native.hostUrl, input: { projectId: "p", issueNumber: 7 } },
		]);
		await click('[aria-label="add"]');
		expect(draft.getState().linkedIssues).toEqual([
			{
				slug: "gh-7",
				title: gh.title,
				source: "github",
				url: gh.url,
				number: 7,
				state: "open",
			},
		]);
		expect(element?.textContent).toContain("Back to GitHub issues");
	});
}
