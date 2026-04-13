import { describe, expect, it, mock } from "bun:test";
import {
	buildTerminalCommand,
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
