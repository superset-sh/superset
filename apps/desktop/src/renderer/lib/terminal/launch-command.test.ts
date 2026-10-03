import { describe, expect, it, mock } from "bun:test";
import {
	ATTACH_ATTEMPT_LIMIT,
	buildTerminalCommand,
	ensureTerminalAttached,
	launchCommandInPane,
	writeCommandsInPane,
} from "./launch-command";
import {
	clearTerminalSessionReady,
	markTerminalSessionReady,
	rejectTerminalSessionReady,
} from "./session-readiness";

describe("launchCommandInPane", () => {
	it("creates a terminal session and writes the command with a newline", async () => {
		const createOrAttach = mock(async () => ({}));
		const write = mock(async () => ({}));

		await launchCommandInPane({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
			command: "echo hello",
			createOrAttach,
			write,
		});

		expect(createOrAttach).toHaveBeenCalledWith({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
			joinPending: true,
		});
		expect(write).toHaveBeenCalledWith({
			paneId: "pane-1",
			data: "echo hello\n",
			throwOnError: true,
		});
	});

	it("forwards cwd when launching a command into a new terminal session", async () => {
		const createOrAttach = mock(async () => ({}));
		const write = mock(async () => ({}));

		await launchCommandInPane({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
			command: "echo hello",
			cwd: "./apps/desktop",
			createOrAttach,
			write,
		});

		expect(createOrAttach).toHaveBeenCalledWith({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
			cwd: "./apps/desktop",
			joinPending: true,
		});
	});

	it("does not append a second newline when command already has one", async () => {
		const createOrAttach = mock(async () => ({}));
		const write = mock(async () => ({}));

		await launchCommandInPane({
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
			command: "echo hello\n",
			createOrAttach,
			write,
		});

		expect(write).toHaveBeenCalledWith({
			paneId: "pane-1",
			data: "echo hello\n",
			throwOnError: true,
		});
	});

	it("waits for the mounted session before writing when requested", async () => {
		const paneId = "pane-mounted-session-ready";
		const createOrAttach = mock(async () => ({}));
		const write = mock(async () => ({}));

		const launchPromise = launchCommandInPane({
			paneId,
			tabId: "tab-1",
			workspaceId: "ws-1",
			command: "echo hello",
			createOrAttach,
			write,
			waitForMountedSession: true,
		});

		expect(createOrAttach).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();

		markTerminalSessionReady(paneId);
		await launchPromise;
		clearTerminalSessionReady(paneId);

		expect(write).toHaveBeenCalledWith({
			paneId,
			data: "echo hello\n",
			throwOnError: true,
		});
	});

	it("propagates mounted-session readiness failures", async () => {
		const paneId = "pane-mounted-session-failure";
		const createOrAttach = mock(async () => ({}));
		const write = mock(async () => ({}));

		const launchPromise = launchCommandInPane({
			paneId,
			tabId: "tab-1",
			workspaceId: "ws-1",
			command: "echo hello",
			createOrAttach,
			write,
			waitForMountedSession: true,
		});

		rejectTerminalSessionReady(paneId, new Error("attach failed"));

		await expect(launchPromise).rejects.toThrow("attach failed");
		expect(createOrAttach).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
	});
});

describe("buildTerminalCommand", () => {
	it("joins commands with shell separators", () => {
		expect(buildTerminalCommand(["echo one", "echo two"])).toBe(
			"echo one && echo two",
		);
	});

	it("returns null for empty commands", () => {
		expect(buildTerminalCommand([])).toBeNull();
		expect(buildTerminalCommand(null)).toBeNull();
		expect(buildTerminalCommand(undefined)).toBeNull();
	});
});

describe("writeCommandsInPane", () => {
	it("writes joined command with newline", async () => {
		const write = mock(async () => ({}));

		await writeCommandsInPane({
			paneId: "pane-1",
			commands: ["echo one", "echo two"],
			write,
		});

		expect(write).toHaveBeenCalledWith({
			paneId: "pane-1",
			data: "echo one && echo two\n",
			throwOnError: true,
		});
	});

	it("does not write when commands are empty", async () => {
		const write = mock(async () => ({}));

		await writeCommandsInPane({
			paneId: "pane-1",
			commands: [],
			write,
		});

		expect(write).not.toHaveBeenCalled();
	});
});

describe("ensureTerminalAttached cancellation retries", () => {
	const canceled = () => new Error("TERMINAL_ATTACH_CANCELED");

	it("retries when the owner of the joined attach cancels it", async () => {
		let calls = 0;
		const createOrAttach = mock(async () => {
			calls += 1;
			if (calls === 1) throw canceled();
			return {};
		});
		const write = mock(async () => ({}));

		await launchCommandInPane({
			paneId: "pane-canceled-once",
			tabId: "tab-1",
			workspaceId: "ws-1",
			command: "claude",
			createOrAttach,
			write,
		});

		expect(calls).toBe(2);
		expect(write).toHaveBeenCalledWith({
			paneId: "pane-canceled-once",
			data: "claude\n",
			throwOnError: true,
		});
	});

	it("surfaces the cancellation once the retry budget is spent", async () => {
		const createOrAttach = mock(async () => {
			throw canceled();
		});
		const write = mock(async () => ({}));

		await expect(
			launchCommandInPane({
				paneId: "pane-canceled-always",
				tabId: "tab-1",
				workspaceId: "ws-1",
				command: "claude",
				createOrAttach,
				write,
			}),
		).rejects.toThrow("TERMINAL_ATTACH_CANCELED");

		expect(createOrAttach).toHaveBeenCalledTimes(ATTACH_ATTEMPT_LIMIT);
		expect(write).not.toHaveBeenCalled();
	});

	it("does not retry a pane whose session was killed", async () => {
		const createOrAttach = mock(async () => {
			throw new Error("TERMINAL_SESSION_KILLED");
		});
		const write = mock(async () => ({}));

		await expect(
			launchCommandInPane({
				paneId: "pane-killed",
				tabId: "tab-1",
				workspaceId: "ws-1",
				command: "claude",
				createOrAttach,
				write,
			}),
		).rejects.toThrow("TERMINAL_SESSION_KILLED");

		expect(createOrAttach).toHaveBeenCalledTimes(1);
		expect(write).not.toHaveBeenCalled();
	});

	it("does not retry unrelated attach failures", async () => {
		const createOrAttach = mock(async () => {
			throw new Error("WORKTREE_GONE");
		});
		const write = mock(async () => ({}));

		await expect(
			launchCommandInPane({
				paneId: "pane-worktree-gone",
				tabId: "tab-1",
				workspaceId: "ws-1",
				command: "claude",
				createOrAttach,
				write,
			}),
		).rejects.toThrow("WORKTREE_GONE");

		expect(createOrAttach).toHaveBeenCalledTimes(1);
		expect(write).not.toHaveBeenCalled();
	});

	it("keeps joining the pending attach on every retry", async () => {
		const inputs: Array<{ joinPending?: boolean }> = [];
		const createOrAttach = async (input: { joinPending?: boolean }) => {
			inputs.push(input);
			if (inputs.length === 1) throw canceled();
			return {};
		};

		await ensureTerminalAttached({
			paneId: "pane-join-flag",
			tabId: "tab-1",
			workspaceId: "ws-1",
			createOrAttach,
		});

		expect(inputs).toHaveLength(2);
		for (const input of inputs) {
			expect(input.joinPending).toBe(true);
		}
	});
});
