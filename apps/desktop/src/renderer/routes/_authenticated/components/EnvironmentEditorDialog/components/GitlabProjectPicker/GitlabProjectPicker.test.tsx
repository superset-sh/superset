import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own the isolated test child's directory.
import { mkdtempSync, rmSync } from "node:fs";
import type { AppRouter, RouterOutputs } from "@superset/trpc";
import type { TRPCLink } from "@trpc/client";
import type { ReactNode } from "react";

if (process.env.SUPERSET_GITLAB_PROJECT_PICKER_FIXTURE !== "1") {
	test("GitLab project picker runs actual React queries in an isolated owned child", () => {
		const cwd = mkdtempSync("/tmp/superset-gitlab-project-picker-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_GITLAB_PROJECT_PICKER_FIXTURE: "1",
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
			throw Error("GitLab project picker outbound fetch denied");
		},
		{ preconnect: () => {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before application imports.
	const socket = await import("node:net");
	spyOn(socket.Socket.prototype, "connect").mockImplementation(() => {
		throw Error("GitLab project picker socket denied");
	});
	const deniedEnvironment = {
		config: () => {
			throw Error("GitLab project picker environment file denied");
		},
	};
	mock.module("dotenv", () => deniedEnvironment);
	expect((await import("dotenv")).config).toBe(deniedEnvironment.config);
	const denyNative = () => {
		throw Error("GitLab project picker native process denied");
	};
	spyOn(Bun, "spawn").mockImplementation(denyNative);
	spyOn(Bun, "spawnSync").mockImplementation(denyNative);

	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	const { TRPCClientError } = await import("@trpc/client");
	const { createTRPCReact } = await import("@trpc/react-query");
	const { observable } = await import("@trpc/server/observable");
	const { act, cleanup, fireEvent, render, waitFor } = await import(
		"@testing-library/react"
	);

	type ProjectPage = RouterOutputs["cloudWorkspace"]["listGitlabProjects"];
	type ProjectInput = { organizationId: string; query?: string; page: number };
	const ENDPOINT = "cloudWorkspace.listGitlabProjects";

	let calls: { path: string; type: string; input: unknown }[] = [];
	let unexpected: string[] = [];
	let listProjects: (
		input: ProjectInput,
	) => ProjectPage | Promise<ProjectPage> = () => page([]);

	const controlledLink: TRPCLink<AppRouter> =
		() =>
		({ op }) =>
			observable((observer) => {
				calls.push({ path: op.path, type: op.type, input: op.input });
				if (op.path !== ENDPOINT || op.type !== "query") {
					unexpected.push(`${op.type} ${op.path}`);
					observer.error(
						TRPCClientError.from<AppRouter>(Error("Unexpected endpoint")),
					);
					return () => {};
				}
				Promise.resolve()
					.then(() => listProjects(op.input as ProjectInput))
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

	const retainedCallbacks = new WeakMap<HTMLButtonElement, () => void>();
	const retained = (element: HTMLButtonElement | undefined) => {
		const callback = element && retainedCallbacks.get(element);
		if (!callback) throw Error("Missing owned callback");
		return callback;
	};
	const Fragment = ({ children }: { children?: ReactNode }) => <>{children}</>;
	const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
	const linguiBoundary = {
		Trans: Fragment,
		useLingui: () => ({ t: ({ message }: { message: string }) => message }),
	};
	const buttonBoundary = {
		Button: ({
			children,
			disabled,
			onClick,
		}: {
			children?: ReactNode;
			disabled?: boolean;
			onClick?: () => void;
		}) => (
			<button
				disabled={disabled}
				onClick={onClick}
				ref={(element) => {
					if (element && onClick) retainedCallbacks.set(element, onClick);
				}}
				type="button"
			>
				{children}
			</button>
		),
	};
	const commandBoundary = {
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
				data-project-search
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
				data-project-option={value}
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
	};
	const cloudBoundary = { cloudTrpc, cloudTrpcClient };
	for (const [name, value] of [
		["@lingui/react/macro", linguiBoundary],
		["@superset/ui/button", buttonBoundary],
		["@superset/ui/command", commandBoundary],
		["renderer/lib/cloud-trpc", cloudBoundary],
	] as const) {
		mock.module(name, () => value);
		const imported = await import(name);
		for (const [key, entry] of Object.entries(value))
			expect(Reflect.get(imported, key)).toBe(entry);
	}

	const { GitlabProjectPicker } = await import("./GitlabProjectPicker");
	type Choice = Parameters<
		Parameters<typeof GitlabProjectPicker>[0]["onChange"]
	>[0];

	function project(pathWithNamespace: string, host = "gitlab.example.com") {
		return {
			connectionId: "connection-1",
			projectId: String(pathWithNamespace.length),
			pathWithNamespace,
			cloneUrl: `https://${host}/${pathWithNamespace}.git`,
			defaultBranch: "main",
		};
	}
	function page(paths: string[], nextPage: number | null = null): ProjectPage {
		return { items: paths.map((path) => project(path)), nextPage };
	}
	function deferred<T>() {
		let resolve: (value: T) => void = () => {};
		let reject: (error: Error) => void = () => {};
		const promise = new Promise<T>((onResolve, onReject) => {
			resolve = onResolve;
			reject = onReject;
		});
		return { promise, resolve, reject };
	}

	function mount(
		initial: {
			organizationId?: string;
			value?: Choice | null;
			disabled?: boolean;
		} = {},
	) {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const selected: Choice[] = [];
		const ui = (props: typeof initial) => (
			<cloudTrpc.Provider client={cloudTrpcClient} queryClient={client}>
				<QueryClientProvider client={client}>
					<GitlabProjectPicker
						disabled={props.disabled}
						onChange={(choice) => selected.push(choice)}
						organizationId={props.organizationId ?? "org-a"}
						value={props.value ?? null}
					/>
				</QueryClientProvider>
			</cloudTrpc.Provider>
		);
		const view = render(ui(initial));
		return {
			client,
			selected,
			container: view.container,
			show: (props: typeof initial) => view.rerender(ui(props)),
			unmount: view.unmount,
		};
	}
	const searchInput = (root: Element) => {
		const input = root.querySelector("[data-project-search]");
		if (!input) throw Error("Missing search input");
		return input;
	};
	const options = (root: Element) =>
		Array.from(
			root.querySelectorAll<HTMLButtonElement>("[data-project-option]"),
		);
	const optionValues = (root: Element) =>
		options(root).map((option) => option.getAttribute("data-project-option"));
	const button = (root: Element, text: string) =>
		Array.from(root.querySelectorAll("button")).find(
			(candidate) => candidate.textContent === text,
		);
	async function press(element: Element | undefined) {
		if (!element) throw Error("Missing control");
		await act(async () => {
			fireEvent.click(element);
		});
	}
	async function settle() {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
	}
	const inputs = () =>
		calls.filter((call) => call.path === ENDPOINT).map((call) => call.input);

	const LOADING = "Loading projects...";
	const FAILED =
		"Could not load GitLab projects. Check the connection in Integrations.";
	const EMPTY = "No GitLab projects found. Connect GitLab in Integrations.";

	afterEach(async () => {
		await act(async () => {
			cleanup();
		});
		expect(unexpected).toEqual([]);
		calls = [];
		unexpected = [];
		listProjects = () => page([]);
	});

	test("lists the organization's projects through the cloud endpoint and narrows the selection", async () => {
		const first = deferred<ProjectPage>();
		listProjects = () => first.promise;
		const view = mount();
		await waitFor(() => expect(inputs()).toHaveLength(1));
		expect(calls[0]).toEqual({
			path: ENDPOINT,
			type: "query",
			input: { organizationId: "org-a", page: 1 },
		});
		expect(view.container.textContent).toContain(LOADING);
		expect(optionValues(view.container)).toEqual([]);

		await act(async () => {
			first.resolve(page(["Group/Sub.Team/API-service", "Group/web"]));
		});
		await waitFor(() =>
			expect(optionValues(view.container)).toEqual([
				"https://gitlab.example.com/Group/Sub.Team/API-service.git",
				"https://gitlab.example.com/Group/web.git",
			]),
		);
		expect(view.container.textContent).not.toContain(LOADING);

		await press(options(view.container)[0]);
		expect(view.selected).toStrictEqual([
			{
				cloneUrl: "https://gitlab.example.com/Group/Sub.Team/API-service.git",
				pathWithNamespace: "Group/Sub.Team/API-service",
			},
		]);
	});

	test("an empty organization scope says so and offers nothing", async () => {
		const view = mount();
		await waitFor(() => expect(view.container.textContent).toContain(EMPTY));
		expect(optionValues(view.container)).toEqual([]);
		expect(button(view.container, "Load more")).toBeUndefined();
	});

	test("searches on the server and never offers the previous search's projects", async () => {
		const searched = deferred<ProjectPage>();
		listProjects = (input) =>
			input.query === undefined ? page(["Group/web"]) : searched.promise;
		const view = mount();
		await waitFor(() => expect(optionValues(view.container)).toHaveLength(1));

		const search = view.container.querySelector("[data-project-search]");
		if (!search) throw Error("Missing search input");
		await act(async () => {
			fireEvent.change(search, { target: { value: "Sub" } });
		});
		await waitFor(() => expect(inputs()).toHaveLength(2));
		expect(inputs()[1]).toEqual({
			organizationId: "org-a",
			query: "Sub",
			page: 1,
		});
		expect(optionValues(view.container)).toEqual([]);
		expect(view.container.textContent).toContain(LOADING);

		await act(async () => {
			searched.resolve(page(["Other/server-ranked"]));
		});
		await waitFor(() =>
			expect(optionValues(view.container)).toEqual([
				"https://gitlab.example.com/Other/server-ranked.git",
			]),
		);
	});

	test("rapid search typing makes one debounced request and blocks stale selection immediately", async () => {
		listProjects = (input) =>
			page([input.query ? `Group/${input.query}` : "Group/old"]);
		const view = mount();
		await waitFor(() => expect(options(view.container)).toHaveLength(1));
		const old = retained(options(view.container)[0]);
		for (const query of ["n", "ne", "new"])
			await act(async () => {
				fireEvent.change(searchInput(view.container), {
					target: { value: query },
				});
			});
		await act(async () => old());
		expect(view.selected).toEqual([]);
		expect(inputs()).toHaveLength(1);
		expect(optionValues(view.container)).toEqual([]);
		await waitFor(() => expect(inputs()).toHaveLength(2));
		expect(inputs()[1]).toEqual({
			organizationId: "org-a",
			query: "new",
			page: 1,
		});
		await waitFor(() =>
			expect(optionValues(view.container)).toEqual([
				"https://gitlab.example.com/Group/new.git",
			]),
		);
	});
	test("pages on demand with the same organization and search", async () => {
		listProjects = (input) =>
			input.page === 1 ? page(["Group/a"], 2) : page(["Group/b"]);
		const view = mount();
		await waitFor(() => expect(optionValues(view.container)).toHaveLength(1));
		expect(inputs()).toHaveLength(1);

		await press(button(view.container, "Load more"));
		await waitFor(() =>
			expect(optionValues(view.container)).toEqual([
				"https://gitlab.example.com/Group/a.git",
				"https://gitlab.example.com/Group/b.git",
			]),
		);
		expect(inputs()[1]).toEqual({ organizationId: "org-a", page: 2 });
		expect(button(view.container, "Load more")).toBeUndefined();
	});

	test("an initial failure offers nothing until an explicit retry succeeds", async () => {
		listProjects = () => {
			throw Error("gateway");
		};
		const view = mount();
		await waitFor(() => expect(view.container.textContent).toContain(FAILED));
		expect(optionValues(view.container)).toEqual([]);
		expect(inputs()).toHaveLength(1);
		await settle();
		expect(inputs()).toHaveLength(1);

		listProjects = () => page(["Group/a"]);
		await press(button(view.container, "Try again"));
		await waitFor(() => expect(optionValues(view.container)).toHaveLength(1));
		expect(view.container.textContent).not.toContain(FAILED);
		expect(inputs()).toHaveLength(2);
	});

	test("a failed refresh withdraws cached projects from selection", async () => {
		listProjects = () => page(["Group/a"]);
		const view = mount();
		await waitFor(() => expect(optionValues(view.container)).toHaveLength(1));

		listProjects = () => {
			throw Error("revoked");
		};
		await act(async () => {
			await view.client.invalidateQueries();
		});
		await waitFor(() => expect(view.container.textContent).toContain(FAILED));
		expect(optionValues(view.container)).toEqual([]);
		expect(view.selected).toEqual([]);

		listProjects = () => page(["Group/a"]);
		await press(button(view.container, "Try again"));
		await waitFor(() => expect(optionValues(view.container)).toHaveLength(1));
	});

	test("cached projects cannot be selected while their refresh is pending", async () => {
		listProjects = () => page(["Group/a"]);
		const view = mount();
		await waitFor(() => expect(optionValues(view.container)).toHaveLength(1));

		const refresh = deferred<ProjectPage>();
		listProjects = () => refresh.promise;
		await act(async () => {
			void view.client.invalidateQueries();
		});
		await waitFor(() => expect(inputs()).toHaveLength(2));
		await waitFor(() =>
			expect(options(view.container)[0]?.disabled).toBe(true),
		);
		await press(options(view.container)[0]);
		expect(view.selected).toEqual([]);

		await act(async () => {
			refresh.resolve(page(["Group/a"]));
		});
		await waitFor(() =>
			expect(options(view.container)[0]?.disabled).toBe(false),
		);
		await press(options(view.container)[0]);
		expect(view.selected).toHaveLength(1);
	});

	test("a failed next page withdraws the list until retried", async () => {
		listProjects = (input) => {
			if (input.page === 1) return page(["Group/a"], 2);
			throw Error("gateway");
		};
		const view = mount();
		await waitFor(() => expect(optionValues(view.container)).toHaveLength(1));
		await press(button(view.container, "Load more"));
		await waitFor(() => expect(view.container.textContent).toContain(FAILED));
		expect(optionValues(view.container)).toEqual([]);

		await press(button(view.container, "Try again"));
		await waitFor(() =>
			expect(optionValues(view.container)).toEqual([
				"https://gitlab.example.com/Group/a.git",
			]),
		);
	});

	test("an organization switch discards the previous organization's pending and cached projects", async () => {
		const pending: Record<string, ReturnType<typeof deferred<ProjectPage>>> = {
			"org-a": deferred<ProjectPage>(),
			"org-b": deferred<ProjectPage>(),
		};
		listProjects = (input) => {
			const reply = pending[input.organizationId];
			if (!reply) throw Error("Unknown organization");
			return reply.promise;
		};
		const view = mount({ organizationId: "org-a" });
		await waitFor(() => expect(inputs()).toHaveLength(1));

		view.show({ organizationId: "org-b" });
		await waitFor(() => expect(inputs()).toHaveLength(2));
		expect(inputs()[1]).toEqual({ organizationId: "org-b", page: 1 });

		await act(async () => {
			pending["org-a"]?.resolve(page(["Alpha/secret"]));
		});
		await settle();
		expect(optionValues(view.container)).toEqual([]);
		expect(view.container.textContent).toContain(LOADING);

		await act(async () => {
			pending["org-b"]?.resolve(page(["Beta/app"]));
		});
		await waitFor(() =>
			expect(optionValues(view.container)).toEqual([
				"https://gitlab.example.com/Beta/app.git",
			]),
		);
		await press(options(view.container)[0]);
		expect(view.selected).toStrictEqual([
			{
				cloneUrl: "https://gitlab.example.com/Beta/app.git",
				pathWithNamespace: "Beta/app",
			},
		]);

		pending["org-a"] = deferred<ProjectPage>();
		view.show({ organizationId: "org-a" });
		await waitFor(() => expect(inputs()).toHaveLength(3));
		expect(optionValues(view.container)).not.toContain(
			"https://gitlab.example.com/Beta/app.git",
		);
		for (const option of options(view.container))
			expect(option.disabled).toBe(true);
	});

	test("a frozen project is shown without contacting GitLab", async () => {
		const view = mount({
			disabled: true,
			value: {
				cloneUrl: "https://gitlab.example.com/Group/frozen.git",
				pathWithNamespace: "Group/frozen",
			},
		});
		await settle();
		expect(calls).toEqual([]);
		expect(view.container.textContent).toContain("Group/frozen");
		expect(optionValues(view.container)).toEqual([]);
		expect(view.container.querySelector("[data-project-search]")).toBeNull();
	});

	test("a reply that arrives after unmount selects nothing", async () => {
		const reply = deferred<ProjectPage>();
		listProjects = () => reply.promise;
		const view = mount();
		await waitFor(() => expect(inputs()).toHaveLength(1));
		await act(async () => {
			view.unmount();
		});
		await act(async () => {
			reply.resolve(page(["Group/a"]));
		});
		await settle();
		expect(view.selected).toEqual([]);
		expect(inputs()).toHaveLength(1);
	});
	for (const reason of [
		"organization",
		"search",
		"failed refresh",
		"pending refresh",
		"unmount",
	])
		test(`retained project selection is refused after ${reason}`, async () => {
			listProjects = () => page(["Group/a"], 2);
			const view = mount();
			await waitFor(() => expect(options(view.container)).toHaveLength(1));
			const callback = retained(options(view.container)[0]);
			if (reason === "organization") view.show({ organizationId: "org-b" });
			if (reason === "search")
				await act(async () => {
					fireEvent.change(searchInput(view.container), {
						target: { value: "new" },
					});
				});
			if (reason === "failed refresh") {
				listProjects = () => {
					throw Error("401");
				};
				await act(async () => {
					await view.client.invalidateQueries();
				});
			}
			if (reason === "pending refresh") {
				listProjects = () => new Promise(() => {});
				await act(async () => {
					void view.client.invalidateQueries();
				});
			}
			if (reason === "unmount") await act(async () => view.unmount());
			await settle();
			await act(async () => callback());
			await settle();
			expect(view.selected).toEqual([]);
		});
	for (const reason of ["organization", "search", "unmount"])
		test(`retained Retry does not retarget after ${reason}`, async () => {
			listProjects = () => {
				throw Error("503");
			};
			const view = mount();
			await waitFor(() => expect(view.container.textContent).toContain(FAILED));
			const callback = retained(button(view.container, "Try again"));
			listProjects = () => page(["Other/new"], 2);
			if (reason === "organization") view.show({ organizationId: "org-b" });
			if (reason === "search")
				await act(async () => {
					fireEvent.change(searchInput(view.container), {
						target: { value: "new" },
					});
				});
			if (reason === "unmount") await act(async () => view.unmount());
			await settle();
			const before = inputs().length;
			await act(async () => callback());
			await settle();
			expect(inputs()).toHaveLength(before);
			expect(view.selected).toEqual([]);
		});
	for (const reason of ["organization", "search", "failed refresh", "unmount"])
		test(`retained Load more does not retarget after ${reason}`, async () => {
			listProjects = () => page(["Group/a"], 2);
			const view = mount();
			await waitFor(() => expect(options(view.container)).toHaveLength(1));
			const callback = retained(button(view.container, "Load more"));
			if (reason === "organization") view.show({ organizationId: "org-b" });
			if (reason === "search")
				await act(async () => {
					fireEvent.change(searchInput(view.container), {
						target: { value: "new" },
					});
				});
			if (reason === "failed refresh") {
				listProjects = () => {
					throw Error("401");
				};
				await act(async () => {
					await view.client.invalidateQueries();
				});
			}
			if (reason === "unmount") await act(async () => view.unmount());
			await settle();
			const before = inputs().length;
			await act(async () => callback());
			await settle();
			expect(inputs()).toHaveLength(before);
			expect(view.selected).toEqual([]);
		});
}
