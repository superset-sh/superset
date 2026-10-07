import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Isolated fixture owns these scratch directories.
import { mkdtempSync, rmSync } from "node:fs";
import type { ComponentProps, MouseEvent, ReactNode } from "react";

if (process.env.SUPERSET_NATIVE_REPOSITORY_PICKER_FIXTURE !== "1") {
	test("native repository picker runs isolated actual React Query requests", () => {
		const cwd = mkdtempSync("/tmp/superset-native-repository-picker-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_NATIVE_REPOSITORY_PICKER_FIXTURE: "1",
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
			throw Error("Owned picker fixture fetch denied");
		},
		{ preconnect() {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before renderer imports.
	const sockets = await import("node:net");
	spyOn(sockets.Socket.prototype, "connect").mockImplementation(() => {
		throw Error("Owned picker fixture socket denied");
	});
	const dotenvName: string = "dotenv";
	mock.module(dotenvName, () => ({
		config: () => {
			throw Error("Owned picker fixture env denied");
		},
	}));
	const denyNative = () => {
		throw Error("Owned picker fixture native process denied");
	};
	spyOn(Bun, "spawn").mockImplementation(denyNative);
	spyOn(Bun, "spawnSync").mockImplementation(denyNative);
	const { act, cleanup, fireEvent, render, waitFor } = await import(
		"@testing-library/react"
	);
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	mock.module("@lingui/react/macro", () => ({
		Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
		useLingui: () => ({ t: ({ message }: { message: string }) => message }),
	}));
	const retained = new Map<Element, () => void>();
	mock.module("@superset/ui/button", () => ({
		Button: ({
			children,
			onClick,
			disabled,
			...props
		}: ComponentProps<"button">) => (
			<button
				{...props}
				disabled={disabled}
				onClick={onClick}
				ref={(element) => {
					if (element && onClick)
						retained.set(element, () =>
							onClick({} as MouseEvent<HTMLButtonElement>),
						);
				}}
			>
				{children}
			</button>
		),
	}));
	mock.module("@superset/ui/input", () => ({
		Input: (props: ComponentProps<"input">) => <input {...props} />,
	}));
	mock.module("@superset/ui/label", () => ({
		Label: ({ htmlFor, children, ...props }: ComponentProps<"label">) => (
			<label {...props} htmlFor={htmlFor}>
				{children}
			</label>
		),
	}));
	const required = <T,>(value: T | null | undefined): T => {
		if (value == null) throw Error("Missing owned fixture control");
		return value;
	};
	const button = (container: Element, label: string) =>
		required(
			[...container.querySelectorAll<HTMLButtonElement>("button")].find(
				(item) => item.textContent?.trim() === label,
			),
		);
	const press = async (element: Element) => {
		await act(async () => fireEvent.click(element));
	};
	const change = async (element: Element, value: string) => {
		await act(async () => fireEvent.change(element, { target: { value } }));
	};

	type Choice = { fullName: string; cloneUrl: string };
	type Page = { repositories: Choice[]; nextPage: number | null };
	type Input = { host: string; page: number; search?: string };
	let requests: { service: string; input: Input }[] = [];
	let respond: (input: Input, service: string) => Page | Promise<Page> =
		() => ({ repositories: [], nextPage: null });
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: (service: string) => ({
			project: {
				listGitLabRepositoriesForHost: {
					query: async (input: Input) => {
						requests.push({ service, input });
						return respond(input, service);
					},
				},
			},
		}),
	}));
	const { GitLabRepositoryPicker } = await import("./GitLabRepositoryPicker");
	const choice = (
		name = "Widget",
		host = "git.example.invalid:8443",
	): Choice => ({
		fullName: `Group/Sub/${name}`,
		cloneUrl: `https://${host}/Group/Sub/${name}.git`,
	});
	const page = (items: Choice[], nextPage: number | null = null): Page => ({
		repositories: items,
		nextPage,
	});
	function deferred<T>() {
		let resolve: (value: T) => void = () => {};
		let reject: (value: Error) => void = () => {};
		const promise = new Promise<T>((yes, no) => {
			resolve = yes;
			reject = no;
		});
		return { promise, resolve, reject };
	}
	function mount(
		initial: { hostUrl?: string | null; disabled?: boolean } = {},
	) {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const selected: Choice[] = [];
		const invalidations: unknown[] = [];
		const ui = (props: typeof initial) => (
			<QueryClientProvider client={client}>
				<GitLabRepositoryPicker
					hostUrl={
						props.hostUrl === undefined
							? "http://owned-a.invalid"
							: props.hostUrl
					}
					disabled={props.disabled ?? false}
					selectedCloneUrl={null}
					onSelect={(item) => selected.push(item)}
					onInvalidate={() => invalidations.push(true)}
				/>
			</QueryClientProvider>
		);
		const view = render(ui(initial));
		return {
			...view,
			client,
			selected,
			invalidations,
			show: (props: typeof initial) => view.rerender(ui(props)),
		};
	}
	const hostInput = (container: Element) =>
		required(
			container.querySelector<HTMLInputElement>(
				"input[aria-label='GitLab host']",
			),
		);
	const searchInput = (container: Element) =>
		required(
			container.querySelector<HTMLInputElement>(
				"input[placeholder='Search GitLab repositories...']",
			),
		);
	const options = (container: Element) => [
		...container.querySelectorAll<HTMLButtonElement>(
			"button[data-gitlab-repository]",
		),
	];
	afterEach(() => {
		cleanup();
		requests = [];
		respond = () => page([]);
		retained.clear();
	});
	test("no active host disables native listing with honest selection guidance", async () => {
		const view = mount({ hostUrl: null });
		expect(requests).toEqual([]);
		expect(view.container.textContent).toContain(
			"Select a host to browse repositories.",
		);
		expect(options(view.container)).toHaveLength(0);
	});
	test("default public authority is explicit and does not invoke legacy or GitHub listing", async () => {
		const view = mount();
		await waitFor(() => expect(requests).toHaveLength(1));
		expect(requests[0]).toEqual({
			service: "http://owned-a.invalid",
			input: { host: "gitlab.com", page: 1, search: undefined },
		});
		expect(hostInput(view.container).value).toBe("gitlab.com");
	});
	test("custom HTTPS authority/subgroup/case and page2 remain bound to exact selected host", async () => {
		respond = (input) =>
			page(
				[choice(input.page === 1 ? "Widget" : "Second", input.host)],
				input.page === 1 ? 2 : null,
			);
		const view = mount();
		await change(
			hostInput(view.container),
			"https://Git.Example.Invalid:8443/",
		);
		await waitFor(() => expect(options(view.container)).toHaveLength(1));
		await press(button(view.container, "Load more"));
		await waitFor(() => expect(options(view.container)).toHaveLength(2));
		await press(options(view.container)[1]);
		expect(requests.slice(-2).map((row) => row.input)).toEqual([
			{ host: "git.example.invalid:8443", page: 1, search: undefined },
			{ host: "git.example.invalid:8443", page: 2, search: undefined },
		]);
		expect(view.selected).toEqual([choice("Second")]);
	});
	for (const host of [
		"https://user:secret@git.example.invalid",
		"https://git.example.invalid/group",
		"http://git.example.invalid",
		"git.example.invalid:65536",
		"github.com",
	])
		test(`invalid authority ${host} refuses listing and retained selection`, async () => {
			respond = () => page([choice("Initial", "gitlab.com")]);
			const view = mount();
			await waitFor(() => expect(options(view.container)).toHaveLength(1));
			const old = required(retained.get(options(view.container)[0]));
			const count = requests.length;
			await change(hostInput(view.container), host);
			await act(async () => old());
			expect(requests).toHaveLength(count);
			expect(view.selected).toEqual([]);
			expect(options(view.container)).toHaveLength(0);
		});
	for (const context of [
		"authority",
		"search",
		"service",
		"disabled",
		"unmount",
	] as const)
		test(`native retained rows are revoked by ${context}`, async () => {
			respond = (input) => page([choice("Current", input.host)]);
			const view = mount();
			await waitFor(() => expect(options(view.container)).toHaveLength(1));
			const old = required(retained.get(options(view.container)[0]));
			if (context === "authority")
				await change(hostInput(view.container), "other.invalid:8443");
			else if (context === "search")
				await change(searchInput(view.container), "Changed");
			else if (context === "service")
				view.show({ hostUrl: "http://owned-b.invalid" });
			else if (context === "disabled") view.show({ disabled: true });
			else view.unmount();
			if (["authority", "search", "service"].includes(context))
				await waitFor(() =>
					expect(view.container.textContent).not.toContain(
						"Loading repositories...",
					),
				);
			await act(async () => old());
			expect(view.selected).toEqual([]);
		});
	test("paged repository overlap retains one canonical URL row", async () => {
		respond = (input) =>
			input.page === 1
				? page([choice("First", input.host)], 2)
				: page([choice("First", input.host), choice("Second", input.host)]);
		const view = mount();
		await waitFor(() => expect(options(view.container)).toHaveLength(1));
		await press(button(view.container, "Load more"));
		await waitFor(() => expect(options(view.container)).toHaveLength(2));
		expect(
			options(view.container).map((item) =>
				item.getAttribute("data-gitlab-repository"),
			),
		).toEqual([
			choice("First", "gitlab.com").cloneUrl,
			choice("Second", "gitlab.com").cloneUrl,
		]);
	});
	test("late prior-authority response cannot replace current rows", async () => {
		const old = deferred<Page>();
		respond = (input) =>
			input.host === "gitlab.com"
				? old.promise
				: page([choice("Current", input.host)]);
		const view = mount();
		await waitFor(() => expect(requests).toHaveLength(1));
		await change(hostInput(view.container), "git.example.invalid:8443");
		await waitFor(() => expect(options(view.container)).toHaveLength(1));
		await act(async () => old.resolve(page([choice("Stale", "gitlab.com")])));
		expect(options(view.container).map((item) => item.textContent)).toEqual([
			"Group/Sub/Current",
		]);
	});
	for (const message of [
		"Native authentication refused",
		"Native service outage",
		"No procedure found on path project.listGitLabRepositoriesForHost",
	])
		test(`error stays visible with manual fallback and explicit retry: ${message}`, async () => {
			respond = () => {
				throw Error(message);
			};
			const view = mount();
			await waitFor(() =>
				expect(view.container.textContent).toContain(
					message.includes("No procedure") ? "Update this host" : message,
				),
			);
			expect(options(view.container)).toHaveLength(0);
			respond = () => page([choice("Recovered", "gitlab.com")]);
			await press(button(view.container, "Retry"));
			await waitFor(() => expect(options(view.container)).toHaveLength(1));
		});
	test("loading and successful empty state remain distinct", async () => {
		const pending = deferred<Page>();
		respond = () => pending.promise;
		const view = mount();
		await waitFor(() =>
			expect(view.container.textContent).toContain("Loading repositories..."),
		);
		expect(view.container.textContent).not.toContain("No matches");
		await act(async () => pending.resolve(page([])));
		await waitFor(() =>
			expect(view.container.textContent).toContain("No matches"),
		);
	});
}
