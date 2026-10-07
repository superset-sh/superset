import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own the isolated consumer fixture.
import { mkdtempSync, rmSync } from "node:fs";
import type { ReactNode } from "react";

if (process.env.SUPERSET_U4_PILL_FIXTURE !== "1") {
	test("environment pill renders in isolated real React", () => {
		const cwd = mkdtempSync("/tmp/superset-u4-pill-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: { PATH: process.env.PATH, SUPERSET_U4_PILL_FIXTURE: "1" },
					stdout: "pipe",
					stderr: "pipe",
					timeout: 15000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 20000);
} else {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	GlobalRegistrator.register();
	Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
	const deny = () => {
		throw Error("U4 external operation denied");
	};
	globalThis.fetch = Object.assign(async () => deny(), { preconnect: deny });
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before application imports.
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(deny);
	spyOn(Bun, "spawn").mockImplementation(deny);
	spyOn(Bun, "spawnSync").mockImplementation(deny);
	mock.module("dotenv", () => ({ config: deny }));
	const { render, fireEvent, cleanup } = await import("@testing-library/react");
	const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
	mock.module("@lingui/react/macro", () => ({
		Trans: Box,
		useLingui: () => ({ t: ({ message }: { message: string }) => message }),
	}));
	mock.module("@superset/ui/popover", () => ({
		Popover: Box,
		PopoverTrigger: Box,
		PopoverContent: Box,
	}));
	mock.module("@superset/ui/command", () => ({
		Command: Box,
		CommandEmpty: Box,
		CommandGroup: Box,
		CommandList: Box,
		CommandInput: () => null,
		CommandItem: ({
			children,
			value,
			onSelect,
		}: {
			children?: ReactNode;
			value: string;
			onSelect: () => void;
		}) => (
			<button type="button" data-search={value} onClick={onSelect}>
				{children}
			</button>
		),
	}));
	mock.module("../FormPickerTrigger", () => ({ FormPickerTrigger: Box }));
	const { EnvironmentPickerPill } = await import("./EnvironmentPickerPill");
	afterEach(cleanup);
	test("native nested project is displayed searchable and selects exact environment id", () => {
		const env = {
			id: "native",
			name: "Work",
			gitlabProject: { pathWithNamespace: "Acme/Team/Widget" },
		};
		const selected: string[] = [];
		const view = render(
			<EnvironmentPickerPill
				selectedEnvironment={env}
				environments={[env]}
				onSelectEnvironment={(id) => selected.push(id)}
			/>,
		);
		expect(view.container.textContent).toContain("Acme/Team/Widget");
		const row = view.container.querySelector<HTMLButtonElement>(
			"button[data-search]",
		);
		expect(row?.dataset.search).toContain("Acme/Team/Widget");
		if (!row) throw Error("Missing environment row");
		fireEvent.click(row);
		expect(selected).toEqual(["native"]);
	});
	test("GitHub-only environment retains name and exact selection id", () => {
		const env = { id: "github", name: "Original GH" };
		const selected: string[] = [];
		const view = render(
			<EnvironmentPickerPill
				selectedEnvironment={env}
				environments={[env]}
				onSelectEnvironment={(id) => selected.push(id)}
			/>,
		);
		const row = view.container.querySelector<HTMLButtonElement>(
			"button[data-search]",
		);
		expect(row?.textContent).toBe("Original GH");
		expect(row?.dataset.search?.trim()).toBe("Original GH");
		if (!row) throw Error("Missing original row");
		fireEvent.click(row);
		expect(selected).toEqual(["github"]);
	});
}
