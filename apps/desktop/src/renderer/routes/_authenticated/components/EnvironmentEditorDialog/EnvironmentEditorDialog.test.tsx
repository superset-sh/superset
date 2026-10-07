import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own the isolated test child's directory.
import { mkdtempSync, rmSync } from "node:fs";
import type { AppRouter } from "@superset/trpc";
import type { TRPCLink } from "@trpc/client";
import type { ChangeEventHandler, ReactNode } from "react";

if (process.env.SUPERSET_ENVIRONMENT_EDITOR_FIXTURE !== "1") {
	test("environment editor runs actual React queries in an isolated owned child", () => {
		const cwd = mkdtempSync("/tmp/superset-environment-editor-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_ENVIRONMENT_EDITOR_FIXTURE: "1",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 45000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 50000);
} else {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Environment editor outbound fetch denied");
		},
		{ preconnect: () => {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before application imports.
	const socket = await import("node:net");
	spyOn(socket.Socket.prototype, "connect").mockImplementation(() => {
		throw Error("Environment editor socket denied");
	});
	const deniedEnvironment = {
		config: () => {
			throw Error("Environment editor environment file denied");
		},
	};
	mock.module("dotenv", () => deniedEnvironment);
	expect((await import("dotenv")).config).toBe(deniedEnvironment.config);
	const denyNative = () => {
		throw Error("Environment editor native process denied");
	};
	spyOn(Bun, "spawn").mockImplementation(denyNative);
	spyOn(Bun, "spawnSync").mockImplementation(denyNative);

	const { createContext, useContext } = await import("react");
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	const { TRPCClientError } = await import("@trpc/client");
	const { createTRPCReact } = await import("@trpc/react-query");
	const { observable } = await import("@trpc/server/observable");
	const { act, cleanup, fireEvent, render, waitFor } = await import(
		"@testing-library/react"
	);
	const { ENVIRONMENT_ONBOARDING_PROMPT } = await import(
		"@superset/shared/cloud-agent-launch"
	);

	type Handlers = Record<string, (input: unknown) => unknown>;
	let calls: { path: string; input: unknown }[] = [];
	let unexpected: string[] = [];
	let handlers: Handlers = {};
	let toasts: { kind: "success" | "error"; message: string }[] = [];
	let promised: Promise<unknown>[] = [];
	let navigations: unknown[] = [];
	const retainedCallbacks = new WeakMap<HTMLButtonElement, () => void>();

	const controlledLink: TRPCLink<AppRouter> =
		() =>
		({ op }) =>
			observable((observer) => {
				calls.push({ path: op.path, input: op.input });
				const handler = handlers[op.path];
				if (!handler) {
					unexpected.push(op.path);
					observer.error(
						TRPCClientError.from<AppRouter>(Error("Unexpected endpoint")),
					);
					return () => {};
				}
				Promise.resolve()
					.then(() => handler(op.input))
					.then(
						(data) => {
							observer.next({ result: { data } });
							observer.complete();
						},
						(error: unknown) =>
							observer.error(
								TRPCClientError.from<AppRouter>(
									error instanceof Error ? error : Error(String(error)),
								),
							),
					);
				return () => {};
			});
	const cloudTrpc = createTRPCReact<AppRouter>();
	const cloudTrpcClient = cloudTrpc.createClient({ links: [controlledLink] });

	const Fragment = ({ children }: { children?: ReactNode }) => <>{children}</>;
	const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
	const SelectState = createContext<{
		value?: string;
		disabled?: boolean;
		onValueChange?: (value: string) => void;
	}>({});
	function SelectTrigger({ id }: { id?: string }) {
		const state = useContext(SelectState);
		return (
			<span
				data-disabled={state.disabled ? "true" : "false"}
				data-value={state.value}
				id={id}
			/>
		);
	}
	function SelectItem({
		children,
		value,
	}: {
		children?: ReactNode;
		value: string;
	}) {
		const state = useContext(SelectState);
		return (
			<button
				data-select-item={value}
				disabled={state.disabled}
				onClick={() => state.onValueChange?.(value)}
				type="button"
			>
				{children}
			</button>
		);
	}
	const boundaries = [
		[
			"@lingui/react/macro",
			{
				Trans: Fragment,
				useLingui: () => ({
					t: ({ message }: { message: string }) => message,
				}),
			},
		],
		[
			"@superset/i18n/errors",
			{
				errorMessage: (error: unknown) =>
					error instanceof Error ? error.message : String(error),
			},
		],
		[
			"@superset/ui/button",
			{
				Button: ({
					children,
					className,
					disabled,
					id,
					onClick,
					title,
					"aria-label": label,
				}: {
					children?: ReactNode;
					className?: string;
					disabled?: boolean;
					id?: string;
					onClick?: () => void;
					title?: string;
					"aria-label"?: string;
				}) => (
					<button
						aria-label={label}
						className={className}
						disabled={disabled}
						id={id}
						onClick={onClick}
						ref={(element) => {
							if (element && onClick) retainedCallbacks.set(element, onClick);
						}}
						title={title}
						type="button"
					>
						{children}
					</button>
				),
			},
		],
		[
			"@superset/ui/command",
			{
				Command: Box,
				CommandEmpty: Box,
				CommandGroup: Box,
				CommandList: Box,
				CommandInput: ({
					onValueChange,
					placeholder,
					value,
				}: {
					onValueChange?: (value: string) => void;
					placeholder?: string;
					value?: string;
				}) => (
					<input
						onChange={(event) => onValueChange?.(event.currentTarget.value)}
						placeholder={placeholder}
						value={value ?? ""}
					/>
				),
				CommandItem: ({
					children,
					disabled,
					onSelect,
					value,
				}: {
					children?: ReactNode;
					disabled?: boolean;
					onSelect?: (value: string) => void;
					value?: string;
				}) => (
					<button
						data-option={value}
						disabled={disabled}
						onClick={() => onSelect?.(value ?? "")}
						ref={(element) => {
							if (element && onSelect)
								retainedCallbacks.set(element, () => onSelect(value ?? ""));
						}}
						type="button"
					>
						{children}
					</button>
				),
			},
		],
		[
			"@superset/ui/dialog",
			{
				Dialog: ({
					children,
					open,
				}: {
					children?: ReactNode;
					open?: boolean;
				}) => (open ? <div role="dialog">{children}</div> : null),
				DialogContent: Box,
				DialogDescription: Box,
				DialogFooter: Box,
				DialogHeader: Box,
				DialogTitle: Box,
			},
		],
		[
			"@superset/ui/input",
			{
				Input: ({
					id,
					onChange,
					placeholder,
					value,
				}: {
					id?: string;
					onChange?: ChangeEventHandler<HTMLInputElement>;
					placeholder?: string;
					value?: string;
				}) => (
					<input
						id={id}
						onChange={onChange}
						placeholder={placeholder}
						value={value}
					/>
				),
			},
		],
		[
			"@superset/ui/label",
			{
				Label: ({
					children,
					htmlFor,
				}: {
					children?: ReactNode;
					htmlFor?: string;
				}) => <label htmlFor={htmlFor}>{children}</label>,
			},
		],
		[
			"@superset/ui/popover",
			{ Popover: Box, PopoverContent: Box, PopoverTrigger: Box },
		],
		[
			"@superset/ui/select",
			{
				Select: ({
					children,
					disabled,
					onValueChange,
					value,
				}: {
					children?: ReactNode;
					disabled?: boolean;
					onValueChange?: (value: string) => void;
					value?: string;
				}) => (
					<SelectState.Provider value={{ value, disabled, onValueChange }}>
						<div data-select>{children}</div>
					</SelectState.Provider>
				),
				SelectContent: Box,
				SelectValue: () => null,
				SelectTrigger,
				SelectItem,
			},
		],
		[
			"@superset/ui/sonner",
			{
				toast: {
					success: (message: string) =>
						toasts.push({ kind: "success", message }),
					error: (message: string) => toasts.push({ kind: "error", message }),
					promise: (work: Promise<unknown>) => {
						promised.push(work);
					},
				},
			},
		],
		[
			"@tanstack/react-router",
			{
				useNavigate: () => (target: unknown) => {
					navigations.push(target);
					return Promise.resolve();
				},
			},
		],
		["renderer/lib/cloud-trpc", { cloudTrpc, cloudTrpcClient }],
	] as const;
	for (const [name, value] of boundaries) {
		mock.module(name, () => value);
		const imported = await import(name);
		for (const [key, entry] of Object.entries(value))
			expect(Reflect.get(imported, key)).toBe(entry);
	}

	const { EnvironmentEditorDialog } = await import("./EnvironmentEditorDialog");
	type Props = Parameters<typeof EnvironmentEditorDialog>[0];
	type Seed = NonNullable<Props["environment"]>;
	interface Shown {
		organizationId?: string;
		environment?: Seed;
		fromWorkspaceId?: string;
		open?: boolean;
		closeUnmount?: boolean;
	}

	const WEB = {
		id: "11111111-1111-4111-8111-111111111111",
		fullName: "acme/web",
	};
	const API = {
		id: "22222222-2222-4222-8222-222222222222",
		fullName: "acme/api",
	};
	const SUGGESTED = "lhr1";
	const WORKSPACE = "33333333-3333-4333-8333-333333333333";
	const LIST_PROJECTS = "cloudWorkspace.listGitlabProjects";
	const LIST_REPOSITORIES = "integration.github.listRepositories";
	const ALPHA = {
		cloneUrl: "https://gitlab.example.com/Alpha/Sub.Team/API-service.git",
		pathWithNamespace: "Alpha/Sub.Team/API-service",
	};
	const ALPHA_WEB = {
		cloneUrl: "https://gitlab.example.com/Alpha/web.git",
		pathWithNamespace: "Alpha/web",
	};
	const BETA = {
		cloneUrl: "https://gitlab.example.com/Beta/app.git",
		pathWithNamespace: "Beta/app",
	};
	const stored = (choice: typeof ALPHA) => ({
		connectionId: "connection-1",
		projectId: "41",
		defaultBranch: "main",
		...choice,
	});
	const organizationOf = (input: unknown) =>
		input &&
		typeof input === "object" &&
		"organizationId" in input &&
		typeof input.organizationId === "string"
			? input.organizationId
			: "";
	function defaults(): Handlers {
		return {
			"environment.suggestRegion": () => ({ region: SUGGESTED }),
			[LIST_REPOSITORIES]: () => [WEB, API],
			[LIST_PROJECTS]: (input) => ({
				items:
					organizationOf(input) === "org-a"
						? [stored(ALPHA), stored(ALPHA_WEB)]
						: [stored(BETA)],
				nextPage: null,
			}),
			"environment.create": () => ({ id: "environment-new" }),
			"environment.update": () => ({ id: "environment-1" }),
			"environment.promote": () => ({ id: "environment-2", name: "Saved" }),
			"cloudWorkspace.create": () => ({ id: "workspace-new" }),
		};
	}
	function deferred<T>() {
		let resolve: (value: T) => void = () => {};
		const promise = new Promise<T>((onResolve) => {
			resolve = onResolve;
		});
		return { promise, resolve };
	}

	function mount(initial: Shown = {}) {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const opened: boolean[] = [];
		let unmount = () => {};
		const ui = (props: Shown) => (
			<cloudTrpc.Provider client={cloudTrpcClient} queryClient={client}>
				<QueryClientProvider client={client}>
					<EnvironmentEditorDialog
						environment={props.environment}
						fromWorkspaceId={props.fromWorkspaceId}
						onOpenChange={(open) => {
							opened.push(open);
							if (!open && props.closeUnmount) unmount();
						}}
						open={props.open ?? true}
						organizationId={props.organizationId ?? "org-a"}
					/>
				</QueryClientProvider>
			</cloudTrpc.Provider>
		);
		const view = render(ui(initial));
		unmount = view.unmount;
		return {
			client,
			opened,
			root: view.container,
			show: (props: Shown) => view.rerender(ui(props)),
			unmount: view.unmount,
		};
	}

	const retained = (element: HTMLButtonElement | undefined) => {
		const callback = element && retainedCallbacks.get(element);
		if (!callback) throw Error("Missing owned callback");
		return callback;
	};
	const sent = (path: string) =>
		calls.filter((call) => call.path === path).map((call) => call.input);
	const withdrawn = (root: Element, selector: string) =>
		root.querySelector(selector) === null;
	const selectValue = (root: Element, id: string) =>
		root.querySelector(`#${id}`)?.getAttribute("data-value");
	const selectDisabled = (root: Element, id: string) =>
		root.querySelector(`#${id}`)?.getAttribute("data-disabled") === "true";
	const option = (root: Element, value: string) =>
		Array.from(root.querySelectorAll<HTMLButtonElement>("[data-option]")).find(
			(candidate) => candidate.getAttribute("data-option") === value,
		);
	const projectOptions = (root: Element) =>
		Array.from(root.querySelectorAll<HTMLButtonElement>("[data-option]"))
			.map((candidate) => candidate.getAttribute("data-option") ?? "")
			.filter((value) => value.startsWith("https://"));
	const action = (root: Element, text: string) =>
		Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === text,
		);
	async function press(element: HTMLButtonElement | undefined) {
		if (!element) throw Error("Missing control");
		if (element.disabled) throw Error("Control is disabled");
		await act(async () => {
			fireEvent.click(element);
		});
	}
	async function choose(root: Element, id: string, value: string) {
		const item = Array.from(
			root
				.querySelector(`#${id}`)
				?.closest("[data-select]")
				?.querySelectorAll<HTMLButtonElement>("[data-select-item]") ?? [],
		).find((candidate) => candidate.getAttribute("data-select-item") === value);
		await press(item);
	}
	async function rename(root: Element, value: string) {
		const input = root.querySelector("#environment-name");
		if (!input) throw Error("Missing name input");
		await act(async () => {
			fireEvent.change(input, { target: { value } });
		});
	}
	async function settle() {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
	}
	async function chooseGitlabProject(root: Element, cloneUrl: string) {
		await choose(root, "environment-provider", "gitlab");
		await waitFor(() => expect(projectOptions(root)).toContain(cloneUrl));
		await waitFor(() => expect(option(root, cloneUrl)?.disabled).toBe(false));
		await press(option(root, cloneUrl));
	}
	async function newGitlabEnvironment(organizationId = "org-a") {
		const view = mount({ organizationId });
		await waitFor(() =>
			expect(selectValue(view.root, "environment-region")).toBe(SUGGESTED),
		);
		await rename(view.root, "GitLab env");
		await chooseGitlabProject(view.root, ALPHA.cloneUrl);
		return view;
	}
	async function newGithubEnvironment() {
		const view = mount();
		await waitFor(() =>
			expect(selectValue(view.root, "environment-region")).toBe(SUGGESTED),
		);
		await waitFor(() => expect(option(view.root, WEB.fullName)).toBeDefined());
		await rename(view.root, "Monorepo");
		await press(option(view.root, WEB.fullName));
		await choose(view.root, "environment-hooks", WEB.id);
		return view;
	}
	const githubSeed = (repositoriesFrozen: boolean): Seed => ({
		id: "environment-1",
		name: "Existing",
		scope: "personal",
		repositoryIds: [WEB.id, API.id],
		hooksRepositoryId: API.id,
		repositoriesFrozen,
		region: "iad1",
	});
	const gitlabSeed = (repositoriesFrozen: boolean): Seed => ({
		id: "environment-1",
		name: "Existing",
		scope: "personal",
		repositoryIds: [],
		hooksRepositoryId: null,
		gitlabProject: ALPHA,
		repositoriesFrozen,
		region: "iad1",
	});

	afterEach(async () => {
		await act(async () => {
			cleanup();
		});
		expect(unexpected).toEqual([]);
		calls = [];
		unexpected = [];
		handlers = {};
		toasts = [];
		promised = [];
		navigations = [];
	});

	test("GitHub: a new environment sends the upstream create request", async () => {
		handlers = defaults();
		const view = await newGithubEnvironment();
		expect(sent(LIST_REPOSITORIES)).toStrictEqual([
			{ organizationId: "org-a" },
		]);
		expect(withdrawn(view.root, "#environment-repositories")).toBe(false);
		expect(withdrawn(view.root, "#environment-hooks")).toBe(false);

		await press(action(view.root, "Skip & save"));
		await waitFor(() => expect(view.opened).toEqual([false]));
		expect(sent("environment.create")).toStrictEqual([
			{
				organizationId: "org-a",
				name: "Monorepo",
				repositoryIds: [WEB.id],
				hooksRepositoryId: WEB.id,
				scope: "organization",
				region: SUGGESTED,
			},
		]);
		expect(toasts).toEqual([
			{ kind: "success", message: "Environment created" },
		]);
		expect(sent("cloudWorkspace.create")).toEqual([]);
		expect(sent(LIST_PROJECTS)).toEqual([]);
		expect(navigations).toEqual([]);
	});

	test("GitHub: start agent sends the upstream create and setup requests", async () => {
		handlers = defaults();
		const view = await newGithubEnvironment();
		await press(action(view.root, "Start agent"));
		await waitFor(() => expect(view.opened).toEqual([false]));
		expect(sent("environment.create")).toHaveLength(1);
		expect(sent("cloudWorkspace.create")).toStrictEqual([
			{
				organizationId: "org-a",
				environmentId: "environment-new",
				name: "Set up Monorepo",
				prompt: ENVIRONMENT_ONBOARDING_PROMPT,
				agent: "claude",
			},
		]);
		expect(navigations).toEqual([
			{
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: "workspace-new" },
			},
		]);
		expect(sent(LIST_PROJECTS)).toEqual([]);
	});

	test("GitHub: editing an image environment sends the upstream update request", async () => {
		handlers = defaults();
		const view = mount({ environment: githubSeed(false) });
		await waitFor(() => expect(sent(LIST_REPOSITORIES)).toHaveLength(1));
		await settle();
		expect(selectValue(view.root, "environment-hooks")).toBe(API.id);
		await rename(view.root, "Renamed");
		await choose(view.root, "environment-scope", "organization");
		await press(action(view.root, "Save"));
		await waitFor(() => expect(view.opened).toEqual([false]));
		expect(sent("environment.update")).toStrictEqual([
			{
				id: "environment-1",
				name: "Renamed",
				repositoryIds: [WEB.id, API.id],
				hooksRepositoryId: API.id,
				scope: "organization",
			},
		]);
		expect(toasts).toEqual([{ kind: "success", message: "Environment saved" }]);
		expect(sent("environment.suggestRegion")).toEqual([]);
		expect(sent(LIST_PROJECTS)).toEqual([]);
	});

	test("GitHub: editing a promoted environment sends name, scope and the config location, never repositories", async () => {
		handlers = defaults();
		const view = mount({ environment: githubSeed(true) });
		await waitFor(() => expect(sent(LIST_REPOSITORIES)).toHaveLength(1));
		await settle();
		expect(selectValue(view.root, "environment-hooks")).toBe(API.id);
		await rename(view.root, "Renamed");
		await choose(view.root, "environment-scope", "organization");
		await choose(view.root, "environment-hooks", WEB.id);
		await press(action(view.root, "Save"));
		await waitFor(() => expect(view.opened).toEqual([false]));
		expect(sent("environment.update")).toStrictEqual([
			{
				id: "environment-1",
				name: "Renamed",
				hooksRepositoryId: WEB.id,
				scope: "organization",
			},
		]);
		expect(toasts).toEqual([{ kind: "success", message: "Environment saved" }]);
		expect(sent(LIST_PROJECTS)).toEqual([]);
	});

	test("GitHub: promoting a workspace sends the upstream promote request", async () => {
		handlers = {
			...defaults(),
			"environment.promotePreview": () => ({
				name: "Workspace",
				gitlabProject: null,
				repositories: [{ ...WEB, hooks: true }],
				region: "iad1",
				scope: "organization",
			}),
		};
		const view = mount({ fromWorkspaceId: WORKSPACE });
		await waitFor(() =>
			expect(selectValue(view.root, "environment-hooks")).toBe(WEB.id),
		);
		expect(sent("environment.promotePreview")).toStrictEqual([
			{ cloudWorkspaceId: WORKSPACE },
		]);
		await press(action(view.root, "Save environment"));
		await waitFor(() => expect(promised).toHaveLength(1));
		await act(async () => {
			await Promise.all(promised);
		});
		expect(sent("environment.promote")).toStrictEqual([
			{ cloudWorkspaceId: WORKSPACE, name: "Workspace", scope: "organization" },
		]);
		expect(view.opened).toEqual([false]);
		expect(sent(LIST_REPOSITORIES)).toEqual([]);
		expect(sent("environment.suggestRegion")).toEqual([]);
		expect(sent(LIST_PROJECTS)).toEqual([]);
	});

	test("GitLab: a new environment lists the organization's projects and saves the chosen clone", async () => {
		handlers = defaults();
		const view = mount();
		await waitFor(() =>
			expect(selectValue(view.root, "environment-region")).toBe(SUGGESTED),
		);
		expect(selectValue(view.root, "environment-provider")).toBe("github");
		expect(selectDisabled(view.root, "environment-provider")).toBe(false);
		expect(sent(LIST_PROJECTS)).toEqual([]);

		await rename(view.root, "GitLab env");
		await choose(view.root, "environment-provider", "gitlab");
		await waitFor(() =>
			expect(projectOptions(view.root)).toEqual([
				ALPHA.cloneUrl,
				ALPHA_WEB.cloneUrl,
			]),
		);
		expect(sent(LIST_PROJECTS)).toEqual([{ organizationId: "org-a", page: 1 }]);
		expect(withdrawn(view.root, "#environment-repositories")).toBe(true);
		expect(withdrawn(view.root, "#environment-hooks")).toBe(true);
		expect(action(view.root, "Skip & save")?.disabled).toBe(true);
		expect(action(view.root, "Start agent")?.disabled).toBe(true);

		await press(option(view.root, ALPHA.cloneUrl));
		await press(action(view.root, "Skip & save"));
		await waitFor(() => expect(view.opened).toEqual([false]));
		expect(sent("environment.create")).toStrictEqual([
			{
				organizationId: "org-a",
				name: "GitLab env",
				gitlabCloneUrl: ALPHA.cloneUrl,
				scope: "organization",
				region: SUGGESTED,
			},
		]);
		expect(toasts).toEqual([
			{ kind: "success", message: "Environment created" },
		]);
		expect(sent("cloudWorkspace.create")).toEqual([]);
	});

	test("GitLab: start agent binds the setup workspace to the saved clone", async () => {
		handlers = defaults();
		const view = await newGitlabEnvironment();
		await press(action(view.root, "Start agent"));
		await waitFor(() => expect(view.opened).toEqual([false]));
		expect(sent("environment.create")).toHaveLength(1);
		expect(sent("cloudWorkspace.create")).toStrictEqual([
			{
				organizationId: "org-a",
				environmentId: "environment-new",
				gitlabCloneUrl: ALPHA.cloneUrl,
				name: "Set up GitLab env",
				prompt: ENVIRONMENT_ONBOARDING_PROMPT,
				agent: "claude",
			},
		]);
		expect(navigations).toEqual([
			{
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: "workspace-new" },
			},
		]);
	});

	test("GitLab: an image environment keeps its project and can return to GitHub", async () => {
		handlers = defaults();
		const view = mount({ environment: gitlabSeed(false) });
		await waitFor(() =>
			expect(projectOptions(view.root)).toContain(ALPHA.cloneUrl),
		);
		expect(selectValue(view.root, "environment-provider")).toBe("gitlab");
		expect(sent(LIST_REPOSITORIES)).toEqual([]);
		expect(view.root.textContent).toContain(ALPHA.pathWithNamespace);

		await press(action(view.root, "Save"));
		await waitFor(() => expect(sent("environment.update")).toHaveLength(1));
		expect(sent("environment.update")[0]).toStrictEqual({
			id: "environment-1",
			name: "Existing",
			gitlabCloneUrl: ALPHA.cloneUrl,
			scope: "personal",
		});

		await choose(view.root, "environment-provider", "github");
		await waitFor(() => expect(option(view.root, WEB.fullName)).toBeDefined());
		expect(withdrawn(view.root, "#environment-repositories")).toBe(false);
		expect(action(view.root, "Save")?.disabled).toBe(true);
		await press(option(view.root, WEB.fullName));
		await press(action(view.root, "Save"));
		await waitFor(() => expect(sent("environment.update")).toHaveLength(2));
		expect(sent("environment.update")[1]).toStrictEqual({
			id: "environment-1",
			name: "Existing",
			repositoryIds: [WEB.id],
			hooksRepositoryId: null,
			scope: "personal",
		});
	});

	test("GitLab: a promoted environment edits name and scope only", async () => {
		handlers = defaults();
		const view = mount({ environment: gitlabSeed(true) });
		await settle();
		expect(selectValue(view.root, "environment-provider")).toBe("gitlab");
		expect(selectDisabled(view.root, "environment-provider")).toBe(true);
		expect(view.root.textContent).toContain(ALPHA.pathWithNamespace);
		expect(projectOptions(view.root)).toEqual([]);
		expect(sent(LIST_PROJECTS)).toEqual([]);
		expect(sent(LIST_REPOSITORIES)).toEqual([]);

		await rename(view.root, "Renamed");
		await choose(view.root, "environment-scope", "organization");
		await press(action(view.root, "Save"));
		await waitFor(() => expect(view.opened).toEqual([false]));
		expect(sent("environment.update")).toStrictEqual([
			{ id: "environment-1", name: "Renamed", scope: "organization" },
		]);
	});

	test("GitLab: promoting a workspace shows its project and sends the upstream promote request", async () => {
		handlers = {
			...defaults(),
			"environment.promotePreview": () => ({
				name: "Workspace",
				gitlabProject: stored(ALPHA),
				repositories: [],
				region: "iad1",
				scope: "personal",
			}),
		};
		const view = mount({ fromWorkspaceId: WORKSPACE });
		await waitFor(() =>
			expect(selectValue(view.root, "environment-provider")).toBe("gitlab"),
		);
		expect(selectDisabled(view.root, "environment-provider")).toBe(true);
		expect(view.root.textContent).toContain(ALPHA.pathWithNamespace);
		expect(withdrawn(view.root, "#environment-repositories")).toBe(true);

		await press(action(view.root, "Save environment"));
		await waitFor(() => expect(promised).toHaveLength(1));
		await act(async () => {
			await Promise.all(promised);
		});
		expect(sent("environment.promote")).toStrictEqual([
			{ cloudWorkspaceId: WORKSPACE, name: "Workspace", scope: "personal" },
		]);
		expect(sent(LIST_PROJECTS)).toEqual([]);
		expect(sent(LIST_REPOSITORIES)).toEqual([]);
	});

	test("GitLab: an organization switch voids the earlier organization's selection", async () => {
		handlers = defaults();
		const view = await newGitlabEnvironment();
		expect(action(view.root, "Skip & save")?.disabled).toBe(false);

		view.show({ organizationId: "org-b" });
		await settle();
		expect(action(view.root, "Skip & save")?.disabled).toBe(true);
		expect(action(view.root, "Start agent")?.disabled).toBe(true);
		expect(projectOptions(view.root)).not.toContain(ALPHA.cloneUrl);

		await chooseGitlabProject(view.root, BETA.cloneUrl);
		expect(sent(LIST_PROJECTS)).toContainEqual({
			organizationId: "org-b",
			page: 1,
		});
		await press(action(view.root, "Skip & save"));
		await waitFor(() => expect(sent("environment.create")).toHaveLength(1));
		expect(sent("environment.create")).toStrictEqual([
			{
				organizationId: "org-b",
				name: "GitLab env",
				gitlabCloneUrl: BETA.cloneUrl,
				scope: "organization",
				region: SUGGESTED,
			},
		]);
	});

	const staleContinuations: [
		string,
		(view: Awaited<ReturnType<typeof newGitlabEnvironment>>) => Promise<void>,
	][] = [
		[
			"an organization switch",
			async (view) => view.show({ organizationId: "org-b" }),
		],
		["the dialog closing", async (view) => view.show({ open: false })],
		[
			"an unmount",
			async (view) => {
				await act(async () => {
					view.unmount();
				});
			},
		],
		[
			"a different project selection",
			async (view) => press(option(view.root, ALPHA_WEB.cloneUrl)),
		],
	];
	for (const [reason, invalidate] of staleContinuations)
		test(`GitLab: start agent creates no setup workspace after ${reason}`, async () => {
			const saved = deferred<{ id: string }>();
			handlers = { ...defaults(), "environment.create": () => saved.promise };
			const view = await newGitlabEnvironment();
			await press(action(view.root, "Start agent"));
			await waitFor(() => expect(sent("environment.create")).toHaveLength(1));

			await invalidate(view);
			await act(async () => {
				saved.resolve({ id: "environment-new" });
			});
			await settle();
			expect(sent("cloudWorkspace.create")).toEqual([]);
			expect(navigations).toEqual([]);

			if (reason !== "an unmount") {
				view.show({ organizationId: "org-a" });
				await settle();
			}
			expect(sent("environment.create")).toHaveLength(1);
			expect(sent("cloudWorkspace.create")).toEqual([]);
			expect(navigations).toEqual([]);
			expect(toasts.filter((toast) => toast.kind === "error")).toEqual([]);
		});
	for (const [reason, invalidate] of staleContinuations) {
		test(`GitLab: setup completion has no owner effects after ${reason}`, async () => {
			const created = deferred<{ id: string }>();
			handlers = {
				...defaults(),
				"cloudWorkspace.create": () => created.promise,
			};
			const view = await newGitlabEnvironment();
			await press(action(view.root, "Start agent"));
			await waitFor(() =>
				expect(sent("cloudWorkspace.create")).toHaveLength(1),
			);
			await invalidate(view);
			await act(async () => created.resolve({ id: "workspace-late" }));
			await settle();
			expect(navigations).toEqual([]);
			expect(view.opened).toEqual([]);
			expect(
				view.client
					.getQueryCache()
					.getAll()
					.filter((q) =>
						JSON.stringify(q.queryKey).includes('"cloudWorkspace","list"'),
					),
			).toEqual([]);
		});
		test(`GitLab: cache cancellation completion has no owner effects after ${reason}`, async () => {
			handlers = defaults();
			const pause = deferred<void>();
			const view = await newGitlabEnvironment();
			const originalCancel = view.client.cancelQueries.bind(view.client);
			let waiting = false;
			spyOn(view.client, "cancelQueries").mockImplementation(
				async (filters, options) => {
					waiting = true;
					await pause.promise;
					return originalCancel(filters, options);
				},
			);
			await press(action(view.root, "Start agent"));
			await waitFor(() => expect(waiting).toBe(true));
			await invalidate(view);
			await act(async () => pause.resolve());
			await settle();
			expect(navigations).toEqual([]);
			expect(view.opened).toEqual([]);
			expect(
				view.client
					.getQueryCache()
					.getAll()
					.filter((q) =>
						JSON.stringify(q.queryKey).includes('"cloudWorkspace","list"'),
					),
			).toEqual([]);
		});
		test(`GitLab: finish invalidation cannot close or navigate after ${reason}`, async () => {
			handlers = defaults();
			const pause = deferred<void>();
			const view = await newGitlabEnvironment();
			const originalInvalidate = view.client.invalidateQueries.bind(
				view.client,
			);
			let waiting = false;
			spyOn(view.client, "invalidateQueries").mockImplementation(
				async (filters, options) => {
					waiting = true;
					await pause.promise;
					return originalInvalidate(filters, options);
				},
			);
			await press(action(view.root, "Start agent"));
			await waitFor(() => expect(waiting).toBe(true));
			await invalidate(view);
			await act(async () => pause.resolve());
			await settle();
			expect(navigations).toEqual([]);
			expect(view.opened).toEqual([]);
		});
		test(`GitLab: save completion cannot toast or close after ${reason}`, async () => {
			const saved = deferred<{ id: string }>();
			handlers = { ...defaults(), "environment.create": () => saved.promise };
			const view = await newGitlabEnvironment();
			await press(action(view.root, "Skip & save"));
			await waitFor(() => expect(sent("environment.create")).toHaveLength(1));
			await invalidate(view);
			await act(async () => saved.resolve({ id: "environment-new" }));
			await settle();
			expect(toasts).toEqual([]);
			expect(view.opened).toEqual([]);
			expect(navigations).toEqual([]);
		});
		for (const label of ["Skip & save", "Start agent"])
			test(`GitLab: retained ${label} refuses dispatch after ${reason}`, async () => {
				handlers = defaults();
				const view = await newGitlabEnvironment();
				const callback = retained(action(view.root, label));
				await invalidate(view);
				await act(async () => {
					await callback();
				});
				await settle();
				expect(sent("environment.create")).toEqual([]);
				expect(sent("cloudWorkspace.create")).toEqual([]);
				expect(toasts).toEqual([]);
				expect(view.opened).toEqual([]);
				expect(navigations).toEqual([]);
			});
	}
	for (const label of ["Skip & save", "Start agent"])
		test(`GitLab: failed ${label} save after unmount is silent`, async () => {
			const saved = deferred<{ id: string }>();
			handlers = {
				...defaults(),
				"environment.create": async () => {
					await saved.promise;
					throw Error("401");
				},
			};
			const view = await newGitlabEnvironment();
			await press(action(view.root, label));
			await waitFor(() => expect(sent("environment.create")).toHaveLength(1));
			await act(async () => {
				view.unmount();
				saved.resolve({ id: "unused" });
			});
			await settle();
			expect(toasts).toEqual([]);
			expect(view.opened).toEqual([]);
			expect(navigations).toEqual([]);
		});
	test("GitLab: failed setup completion after organization switch is silent", async () => {
		const created = deferred<{ id: string }>();
		handlers = {
			...defaults(),
			"cloudWorkspace.create": async () => {
				await created.promise;
				throw Error("503");
			},
		};
		const view = await newGitlabEnvironment();
		await press(action(view.root, "Start agent"));
		await waitFor(() => expect(sent("cloudWorkspace.create")).toHaveLength(1));
		view.show({ organizationId: "org-b" });
		await act(async () => created.resolve({ id: "unused" }));
		await settle();
		expect(toasts).toEqual([]);
		expect(navigations).toEqual([]);
		expect(view.opened).toEqual([]);
	});
	test("GitLab: native setup completion is revoked by provider change", async () => {
		const created = deferred<{ id: string }>();
		handlers = {
			...defaults(),
			"cloudWorkspace.create": () => created.promise,
		};
		const view = await newGitlabEnvironment();
		await press(action(view.root, "Start agent"));
		await waitFor(() => expect(sent("cloudWorkspace.create")).toHaveLength(1));
		await choose(view.root, "environment-provider", "github");
		await act(async () => created.resolve({ id: "workspace-late" }));
		await settle();
		expect(navigations).toEqual([]);
		expect(view.opened).toEqual([]);
	});
	test("GitLab: retained picker choice cannot restore native provider after switching to GitHub", async () => {
		handlers = defaults();
		const view = await newGitlabEnvironment();
		const callback = retained(option(view.root, ALPHA_WEB.cloneUrl));
		await choose(view.root, "environment-provider", "github");
		await act(async () => callback());
		await settle();
		expect(selectValue(view.root, "environment-provider")).toBe("github");
	});

	test("GitLab: successful setup still navigates when its own close unmounts the dialog", async () => {
		handlers = defaults();
		const view = await newGitlabEnvironment();
		view.show({ closeUnmount: true });
		await press(action(view.root, "Start agent"));
		await waitFor(() => expect(view.opened).toEqual([false]));
		await settle();
		expect(navigations).toEqual([
			{
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: "workspace-new" },
			},
		]);
		expect(sent("cloudWorkspace.create")).toHaveLength(1);
		expect(toasts.filter((t) => t.kind === "error")).toEqual([]);
	});
}
