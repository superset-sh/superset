import { afterEach, expect, mock, spyOn, test } from "bun:test";
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

	const { useLinkedContext } = await import("./useLinkedContext");
	let api: ReturnType<typeof useLinkedContext> | undefined;
	const Harness = () => {
		api = useLinkedContext(
			draft((s) => s.linkedIssues),
			draft((s) => s.updateDraft),
		);
		return null;
	};
	const add = async (row = native) => {
		const handler: unknown = Reflect.get(required(api), "addLinkedGitLabIssue");
		expect(typeof handler).toBe("function");
		if (typeof handler !== "function") throw Error("Missing native handler");
		await React.act(() => handler(row));
	};
	test("actual linked hook retains complete native reference without renaming workspace", async () => {
		await render(<Harness />);
		await add();
		const expected = linkedIssueFromGitLab(native);
		if (!expected) throw Error("Invalid native issue fixture");
		expect(draft.getState().linkedIssues).toEqual([expected]);
		expect(draft.getState().workspaceName).toBe("");
		expect(draft.getState().branchName).toBe("");
	});
	test("actual hook dedupes native references and retains identical IIDs on other instances", async () => {
		await render(<Harness />);
		await add();
		await add();
		await add({
			...native,
			url: native.url.replace("git.example:8443", "other.example:9443"),
		});
		expect(draft.getState().linkedIssues).toHaveLength(2);
	});
	test("actual hook refuses malformed native reference without mutation", async () => {
		await render(<Harness />);
		await add({ ...native, url: native.url.replace("Group", "%252f") });
		expect(draft.getState().linkedIssues).toEqual([]);
	});
	test("actual original GH handler object and dedupe remain unchanged", async () => {
		await render(<Harness />);
		await React.act(() =>
			required(api).addLinkedGitHubIssue(7, gh.title, gh.url, "OPEN"),
		);
		expect(draft.getState().linkedIssues).toEqual([
			{
				slug: "#7",
				title: gh.title,
				source: "github",
				url: gh.url,
				number: 7,
				state: "open",
			},
		]);
		await React.act(() =>
			required(api).addLinkedGitHubIssue(7, gh.title, gh.url, "OPEN"),
		);
		expect(draft.getState().linkedIssues).toHaveLength(1);
	});
}
