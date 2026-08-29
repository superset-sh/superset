import { afterEach, describe, expect, mock, test } from "bun:test";

// Control what `findWorkspaceOnHost` resolves per test. The command imports it
// from the lib barrel, so mock that module before importing the SUT.
type FindResult = {
	hostId: string;
	workspace: Record<string, unknown> | undefined;
};
let findResult: FindResult = { hostId: "host-1", workspace: undefined };
mock.module("../../../lib/host-workspaces", () => ({
	findWorkspaceOnHost: async () => findResult,
}));

const WEB_URL = "https://app.superset.sh";
mock.module("../../../lib/auth", () => ({ getWebUrl: () => WEB_URL }));

// `--print` aside, the command shells out to the platform URL opener. Capture
// the call instead of actually launching the desktop app.
let spawned: { bin: string; args: string[] } | undefined;
let spawnError: Error | undefined;
mock.module("node:child_process", () => ({
	spawn: (bin: string, args: string[]) => {
		spawned = { bin, args };
		const handlers: Record<string, (arg?: unknown) => void> = {};
		const child = {
			unref: () => {},
			once: (event: string, handler: (arg?: unknown) => void) => {
				handlers[event] = handler;
				return child;
			},
		};
		queueMicrotask(() => {
			if (spawnError) handlers.error?.(spawnError);
			else handlers.spawn?.();
		});
		return child;
	},
}));

const { default: openCommand } = await import("./command");

const WORKSPACE = {
	id: "b502bf30-8693-4815-be65-795035e0ce5f",
	name: "ludicrous-candytuft",
};

function invoke(options: { print?: boolean; host?: string } = {}) {
	return openCommand.run({
		ctx: {
			api: {},
			config: { organizationId: "org-1" },
			bearer: "bearer",
			authSource: "oauth",
		} as never,
		args: { id: WORKSPACE.id } as never,
		options: options as never,
		signal: new AbortController().signal,
	}) as Promise<{
		data: { id: string; name: string; url: string; webUrl: string };
		message: string;
	}>;
}

afterEach(() => {
	findResult = { hostId: "host-1", workspace: undefined };
	spawned = undefined;
	spawnError = undefined;
});

describe("workspaces open", () => {
	test("returns the native url unchanged, so existing consumers keep working", async () => {
		findResult = { hostId: "host-1", workspace: { ...WORKSPACE } };
		const result = await invoke({ print: true });
		expect(result.data.url).toBe(`superset://v2-workspace/${WORKSPACE.id}`);
		expect(result.data.id).toBe(WORKSPACE.id);
		expect(result.data.name).toBe(WORKSPACE.name);
	});

	test("exposes the public HTTPS handoff alongside it as webUrl", async () => {
		findResult = { hostId: "host-1", workspace: { ...WORKSPACE } };
		const result = await invoke({ print: true });
		expect(result.data.webUrl).toBe(
			`${WEB_URL}/open/v2-workspace/${WORKSPACE.id}`,
		);
	});

	test("--print still prints the native url as the message", async () => {
		findResult = { hostId: "host-1", workspace: { ...WORKSPACE } };
		const result = await invoke({ print: true });
		expect(result.message).toBe(`superset://v2-workspace/${WORKSPACE.id}`);
		expect(spawned).toBeUndefined();
	});

	test("opens the native url, not the web url", async () => {
		findResult = { hostId: "host-1", workspace: { ...WORKSPACE } };
		const result = await invoke();
		expect(spawned?.args).toContain(`superset://v2-workspace/${WORKSPACE.id}`);
		expect(spawned?.args.join(" ")).not.toContain(WEB_URL);
		expect(result.message).toContain(WORKSPACE.name);
		expect(result.data.webUrl).toBe(
			`${WEB_URL}/open/v2-workspace/${WORKSPACE.id}`,
		);
	});

	test("surfaces a failure to launch the desktop app", async () => {
		findResult = { hostId: "host-1", workspace: { ...WORKSPACE } };
		spawnError = new Error("no opener");
		await expect(invoke()).rejects.toThrow(/Failed to open desktop app/);
	});

	test("errors when the workspace is not on the target host", async () => {
		findResult = { hostId: "host-1", workspace: undefined };
		await expect(invoke()).rejects.toThrow(/not found/);
	});

	test("errors when there is no active organization", async () => {
		findResult = { hostId: "host-1", workspace: { ...WORKSPACE } };
		await expect(
			openCommand.run({
				ctx: {
					api: {},
					config: { organizationId: undefined },
					bearer: "bearer",
					authSource: "oauth",
				} as never,
				args: { id: WORKSPACE.id } as never,
				options: {} as never,
				signal: new AbortController().signal,
			}),
		).rejects.toThrow(/No active organization/);
	});
});
