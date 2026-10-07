import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Isolated fixture owns these scratch directories.
import { mkdtempSync, rmSync } from "node:fs";
import type { ComponentProps, MouseEvent, ReactNode } from "react";

if (process.env.SUPERSET_NATIVE_NEW_PROJECT_MODAL_FIXTURE !== "1") {
	test("new-project native consumer runs isolated actual React callbacks", () => {
		const cwd = mkdtempSync("/tmp/superset-native-new-project-modal-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_NATIVE_NEW_PROJECT_MODAL_FIXTURE: "1",
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
	const { act, cleanup, fireEvent, render } = await import(
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

	const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
	mock.module("@superset/ui/dialog", () => ({
		Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
			open ? <div>{children}</div> : null,
		DialogContent: Box,
		DialogDescription: Box,
		DialogFooter: Box,
		DialogHeader: Box,
		DialogTitle: Box,
	}));
	let errors: unknown[] = [];
	mock.module("@superset/ui/sonner", () => ({
		toast: { error: (...args: unknown[]) => errors.push(args) },
	}));
	let v2 = true;
	let hostUrl: string | null = "http://owned-host-a.invalid";
	mock.module("renderer/hooks/useIsV2CloudEnabled", () => ({
		useIsV2CloudEnabled: () => v2,
	}));
	mock.module(
		"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
		() => ({ useLocalHostService: () => ({ activeHostUrl: hostUrl }) }),
	);
	mock.module("renderer/lib/electron-trpc", () => ({
		electronTrpc: {
			window: {
				getHomeDir: { useQuery: () => ({ data: "/owned-home" }) },
				selectDirectory: {
					useMutation: () => ({
						isPending: false,
						mutateAsync: async () => ({ canceled: true }),
					}),
				},
			},
		},
	}));
	let mutations: { host: string; input: unknown }[] = [];
	let legacy: unknown[] = [];
	let finalized: unknown[] = [];
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: (host: string) => ({
			project: {
				create: {
					mutate: async (input: unknown) => {
						mutations.push({ host, input });
						return {
							projectId: "owned-project",
							repoPath: "/owned-location/Widget",
							created: true,
						};
					},
				},
			},
		}),
	}));
	mock.module("renderer/react-query/projects", () => ({
		useFinalizeProjectSetup:
			() =>
			(...args: unknown[]) =>
				finalized.push(args),
		useCreateV1Project: () => ({
			cloneFromUrl: async (input: unknown) => {
				legacy.push(input);
				return "legacy-project";
			},
		}),
	}));
	mock.module("renderer/lib/host-service-unavailable", () => ({
		showHostServiceUnavailableToast: () => errors.push("host unavailable"),
	}));
	type Choice = { fullName: string; cloneUrl: string };
	let ghProps: {
		selectedFullName: string | null;
		onSelect: (choice: Choice) => void;
	} | null = null;
	const nativeChoice = {
		fullName: "Group/SubGroup/Widget",
		cloneUrl: "https://git.example.invalid:8443/Group/SubGroup/Widget.git",
	};
	let nativeProps: {
		selectedCloneUrl: string | null;
		onSelect: (choice: Choice) => void;
		onInvalidate: () => void;
	} | null = null;
	mock.module("./components/GitHubRepositoryPicker", () => ({
		GitHubRepositoryPicker: (props: NonNullable<typeof ghProps>) => {
			ghProps = props;
			return (
				<button
					type="button"
					onClick={() =>
						props.onSelect({
							fullName: "Owner/GH",
							cloneUrl: "https://github.com/Owner/GH.git",
						})
					}
				>
					GH fixture repository
				</button>
			);
		},
	}));
	mock.module("./components/GitLabRepositoryPicker", () => ({
		GitLabRepositoryPicker: (props: NonNullable<typeof nativeProps>) => {
			nativeProps = props;
			return (
				<div>
					<button type="button" onClick={() => props.onSelect(nativeChoice)}>
						Native fixture repository
					</button>
					<button type="button" onClick={props.onInvalidate}>
						Native scope changed
					</button>
				</div>
			);
		},
	}));
	const { NewProjectModal } = await import("./NewProjectModal");
	function mount() {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const opened: boolean[] = [];
		const successes: unknown[] = [];
		const ui = (open = true) => (
			<QueryClientProvider client={client}>
				<NewProjectModal
					open={open}
					onOpenChange={(value) => opened.push(value)}
					onSuccess={(value) => successes.push(value)}
				/>
			</QueryClientProvider>
		);
		const view = render(ui());
		return {
			...view,
			client,
			opened,
			successes,
			show: (open = true) => view.rerender(ui(open)),
		};
	}
	afterEach(() => {
		cleanup();
		v2 = true;
		hostUrl = "http://owned-host-a.invalid";
		mutations = [];
		legacy = [];
		finalized = [];
		errors = [];
		ghProps = null;
		nativeProps = null;
		retained.clear();
	});
	test("default GitHub picker and original manual URL clone request stay unchanged", async () => {
		const view = mount();
		expect(ghProps?.selectedFullName).toBeNull();
		expect(view.container.textContent).toContain("GH fixture repository");
		const url = required(
			view.container.querySelector<HTMLInputElement>("#clone-url"),
		);
		expect(url.placeholder).toBe(
			"https://github.com/owner/repo.git or /path/to/repo",
		);
		await change(url, "https://github.com/Owner/Repo.git");
		await change(
			required(view.container.querySelector("#project-path")),
			"/owned-location",
		);
		await press(button(view.container, "Clone"));
		expect(mutations).toEqual([
			{
				host: required(hostUrl),
				input: {
					name: "Repo",
					mode: {
						kind: "clone",
						parentDir: "/owned-location",
						url: "https://github.com/Owner/Repo.git",
					},
				},
			},
		]);
		expect(finalized).toHaveLength(1);
	});
	test("native selection preserves custom authority/subgroup/case through unchanged clone mutation", async () => {
		const view = mount();
		await press(button(view.container, "GitLab"));
		await press(button(view.container, "Native fixture repository"));
		expect(
			required(view.container.querySelector<HTMLInputElement>("#clone-url"))
				.value,
		).toBe(nativeChoice.cloneUrl);
		expect(
			required(view.container.querySelector<HTMLInputElement>("#project-name"))
				.value,
		).toBe("Widget");
		await change(
			required(view.container.querySelector("#project-path")),
			"/owned-location",
		);
		await press(button(view.container, "Clone"));
		expect(mutations).toEqual([
			{
				host: required(hostUrl),
				input: {
					name: "Widget",
					mode: {
						kind: "clone",
						parentDir: "/owned-location",
						url: nativeChoice.cloneUrl,
					},
				},
			},
		]);
	});
	test("scope invalidation clears native selection while manual URL remains available", async () => {
		const view = mount();
		await press(button(view.container, "GitLab"));
		await press(button(view.container, "Native fixture repository"));
		await press(button(view.container, "Native scope changed"));
		expect(
			required(view.container.querySelector<HTMLInputElement>("#clone-url"))
				.value,
		).toBe("");
		await change(
			required(view.container.querySelector("#clone-url")),
			"/owned/local/source",
		);
		await press(button(view.container, "Clone"));
		expect(mutations[0]?.input).toEqual({
			name: "source",
			mode: {
				kind: "clone",
				parentDir: "/owned-home/.superset/projects",
				url: "/owned/local/source",
			},
		});
	});
	test("switching provider revokes retained native selection and clone callbacks", async () => {
		const view = mount();
		await press(button(view.container, "GitLab"));
		await press(button(view.container, "Native fixture repository"));
		const oldSelect = required(nativeProps).onSelect;
		const oldClone = required(retained.get(button(view.container, "Clone")));
		await press(button(view.container, "GitHub"));
		await act(async () => {
			oldSelect(nativeChoice);
			oldClone();
		});
		expect(
			required(view.container.querySelector<HTMLInputElement>("#clone-url"))
				.value,
		).toBe("");
		expect(mutations).toEqual([]);
	});
	for (const context of ["host", "close", "unmount"] as const)
		test(`native retained callbacks cannot act after ${context}`, async () => {
			const view = mount();
			await press(button(view.container, "GitLab"));
			await press(button(view.container, "Native fixture repository"));
			const oldSelect = required(nativeProps).onSelect;
			const oldClone = required(retained.get(button(view.container, "Clone")));
			if (context === "host") {
				hostUrl = "http://owned-host-b.invalid";
				view.show();
			} else if (context === "close") {
				view.show(false);
				view.show(true);
			} else view.unmount();
			await act(async () => {
				oldSelect(nativeChoice);
				oldClone();
			});
			expect(mutations).toEqual([]);
			if (context !== "unmount")
				expect(
					required(view.container.querySelector<HTMLInputElement>("#clone-url"))
						.value,
				).toBe("");
		});
	test("a retained native clone callback cannot start the same request twice before render", async () => {
		const view = mount();
		await press(button(view.container, "GitLab"));
		await press(button(view.container, "Native fixture repository"));
		const clone = required(retained.get(button(view.container, "Clone")));
		await act(async () => {
			clone();
			clone();
		});
		expect(mutations).toHaveLength(1);
	});
	test("original v1/manual clone continues without provider listing", async () => {
		v2 = false;
		const view = mount();
		expect(view.container.textContent).not.toContain("GitLab");
		await change(
			required(view.container.querySelector("#clone-url")),
			"/owned/source",
		);
		await press(button(view.container, "Clone"));
		expect(legacy).toEqual([
			{ url: "/owned/source", parentDir: "/owned-home/.superset/projects" },
		]);
		expect(mutations).toEqual([]);
	});
}
