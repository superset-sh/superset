import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
} from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface MockTerminalCallbacks {
	onData?: (data: string) => void;
	onExit?: (event: { exitCode?: number; signal?: number }) => void;
}

class MockPty {
	public callbacks: MockTerminalCallbacks = {};
	public kill = mock(() => undefined);
	public resize = mock(() => undefined);
	public write = mock(() => undefined);

	public onData(callback: (data: string) => void) {
		this.callbacks.onData = callback;
	}

	public onExit(
		callback: (event: { exitCode?: number; signal?: number }) => void,
	) {
		this.callbacks.onExit = callback;
	}
}

const spawnMock = mock(() => new MockPty());
let registerWorkspaceTerminalRoute: typeof import("./terminal").registerWorkspaceTerminalRoute;

describe("registerWorkspaceTerminalRoute", () => {
	beforeAll(async () => {
		mock.module("node-pty", () => ({
			spawn: (...args: unknown[]) => spawnMock(...args),
		}));

		({ registerWorkspaceTerminalRoute } = await import("./terminal"));
	});

	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		spawnMock.mockClear();
	});

	function createHandler(options?: {
		mode?: "pty" | "tmux";
		workspaceId?: string;
	}) {
		const worktreePath = mkdtempSync(join(tmpdir(), "superset-host-service-"));
		let registeredHandler:
			| ((context: {
					req: { param: (name: string) => string };
			  }) => ReturnType<
					Parameters<
						Parameters<
							typeof registerWorkspaceTerminalRoute
						>[0]["upgradeWebSocket"]
					>[0]
			  >)
			| undefined;

		registerWorkspaceTerminalRoute({
			app: {
				get: (_path, handler) => {
					registeredHandler = handler;
					return {} as never;
				},
			} as never,
			db: {
				query: {
					workspaces: {
						findFirst: () => ({
							sync: () => ({
								id: options?.workspaceId ?? "workspace-1",
								worktreePath,
							}),
						}),
					},
				},
			} as never,
			mode: options?.mode,
			upgradeWebSocket: (handler) => handler,
		});

		if (!registeredHandler) {
			throw new Error("terminal route handler was not registered");
		}

		return {
			handlers: registeredHandler({
				req: {
					param: () => options?.workspaceId ?? "workspace-1",
				},
			}),
			worktreePath,
		};
	}

	it("spawns tmux with a stable session name for SSH-backed terminals", () => {
		const { handlers, worktreePath } = createHandler({
			mode: "tmux",
			workspaceId: "workspace:1",
		});

		handlers.onOpen(null, {
			close: mock(() => undefined),
			readyState: 1,
			send: mock(() => undefined),
		});

		const [command, args, options] = spawnMock.mock.calls[0] ?? [];
		expect(command).toBe("tmux");
		expect(args).toEqual([
			"new-session",
			"-A",
			"-s",
			"superset-workspace-workspace-1",
			"-c",
			worktreePath,
		]);
		expect(options).toMatchObject({
			cols: 120,
			cwd: worktreePath,
			rows: 32,
		});
	});

	it("uses the configured shell for non-SSH terminals and tears down on close", () => {
		process.env.SHELL = "/bin/bash";
		const { handlers } = createHandler({ mode: "pty" });
		const socket = {
			close: mock(() => undefined),
			readyState: 1,
			send: mock(() => undefined),
		};

		handlers.onOpen(null, socket);
		handlers.onClose();

		const [command, args] = spawnMock.mock.calls[0] ?? [];
		const terminal = spawnMock.mock.results[0]?.value as MockPty;
		expect(command).toBe("/bin/bash");
		expect(args).toEqual([]);
		expect(terminal.kill).toHaveBeenCalled();
	});
});
