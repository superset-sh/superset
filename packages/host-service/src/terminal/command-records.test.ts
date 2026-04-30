import { describe, expect, it } from "bun:test";
import {
	COMMAND_OUTPUT_HEAD_BYTES,
	COMMAND_OUTPUT_TAIL_BYTES,
	COMMAND_RECORD_LIMIT,
	TerminalCommandRecordManager,
} from "./command-records";

describe("TerminalCommandRecordManager", () => {
	it("correlates the next command start with queued command metadata", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		manager.queueExpectedCommand({
			commandId: "command-1",
			command: "bun test",
			source: "agent",
		});
		const record = manager.startCommand({
			now: Date.now(),
			cwd: "/repo",
			gitBranch: "main",
		});

		expect(record.id).toBe("command-1");
		expect(record.command).toBe("bun test");
		expect(record.source).toBe("agent");
		expect(record.cwd).toBe("/repo");
		expect(record.gitBranch).toBe("main");
	});

	it("keeps short output in head and leaves tail empty", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		manager.startCommand({ now: 1, cwd: null });
		manager.appendOutput("one\ntwo\n");
		const record = manager.finishCommand({ now: 2, exitCode: 0 });

		expect(record?.outputHead).toBe("one\ntwo");
		expect(record?.outputTail).toBe("");
		expect(record?.truncatedLineCount).toBe(0);
		expect(record?.status).toBe("succeeded");
	});

	it("uses the submitted interactive command when no queued command matches", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		const record = manager.startCommand({
			now: 1000,
			cwd: null,
			command: "echo manual",
		});

		expect(record.command).toBe("echo manual");
		expect(record.source).toBe("user");
	});

	it("retains blank output lines without marking output truncated", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		manager.startCommand({ now: 1, cwd: null });
		manager.appendOutput("one\n\nthree\n");
		const record = manager.finishCommand({ now: 2, exitCode: 0 });

		expect(record?.outputHead).toBe("one\n\nthree");
		expect(record?.outputTail).toBe("");
		expect(record?.outputLineCount).toBe(3);
		expect(record?.truncatedLineCount).toBe(0);
	});

	it("bounds long output with non-overlapping head and tail", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		manager.startCommand({ now: 1, cwd: null });
		manager.appendOutput(
			`${Array.from({ length: 650 }, (_, index) => `line-${index + 1}`).join(
				"\n",
			)}\n`,
		);
		const record = manager.finishCommand({ now: 2, exitCode: 1 });

		expect(record?.outputLineCount).toBe(650);
		expect(record?.outputHead.split("\n")).toHaveLength(200);
		expect(record?.outputTail.split("\n")).toHaveLength(400);
		expect(record?.outputHead).toContain("line-1");
		expect(record?.outputHead).not.toContain("line-250");
		expect(record?.outputTail).toContain("line-650");
		expect(record?.truncatedLineCount).toBe(50);
		expect(record?.status).toBe("failed");
	});

	it("strips ANSI before retaining output summaries", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		manager.startCommand({ now: 1, cwd: null });
		manager.appendOutput("\x1b[31mred\x1b[0m\n");
		const record = manager.finishCommand({ now: 2, exitCode: null });

		expect(record?.outputHead).toBe("red");
		expect(record?.status).toBe("unknown");
	});

	it("strips OSC title/path sequences before retaining output summaries", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		manager.startCommand({ now: 1, cwd: null });
		manager.appendOutput(
			"AGENTS.md\n\x1b]2;user@host:/repo\x07\x1b]1;repo\x07\x1b]7;file://host/repo\x07",
		);
		const record = manager.finishCommand({ now: 2, exitCode: 0 });

		expect(record?.outputHead).toBe("AGENTS.md");
	});

	it("drops a prompt decoration line when prompt markers close older records", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		manager.startCommand({ now: 1, cwd: null });
		manager.appendOutput("AGENTS.md\n% \x1b]2;user@host:/repo\x07");
		const record = manager.finishActiveFromPrompt(2);

		expect(record?.outputHead).toBe("AGENTS.md");
	});

	it("caps retained output bytes per record", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		manager.startCommand({ now: 1, cwd: null });
		manager.appendOutput(`${"🙂".repeat(5000)}\n`.repeat(300));
		const record = manager.finishCommand({ now: 2, exitCode: 0 });
		const retainedBytes = Buffer.byteLength(
			`${record?.outputHead ?? ""}${record?.outputTail ?? ""}`,
			"utf8",
		);

		expect(retainedBytes).toBeLessThanOrEqual(
			COMMAND_OUTPUT_HEAD_BYTES + COMMAND_OUTPUT_TAIL_BYTES,
		);
	});

	it("retrieves a full record by id", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		manager.queueExpectedCommand({
			commandId: "command-1",
			command: "echo ok",
			source: "system",
		});
		manager.startCommand({ now: 1, cwd: null });
		manager.appendOutput("ok\n");
		manager.finishCommand({ now: 2, exitCode: 0 });

		expect(manager.getRecord("command-1")?.outputHead).toBe("ok");
		expect(manager.getRecord("missing")).toBeNull();
	});

	it("keeps only the configured number of recent records", () => {
		const manager = new TerminalCommandRecordManager({
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
		});

		for (let index = 0; index < COMMAND_RECORD_LIMIT + 2; index += 1) {
			manager.queueExpectedCommand({
				commandId: `command-${index}`,
				command: `echo ${index}`,
				source: "system",
			});
			manager.startCommand({ now: index, cwd: null });
			manager.finishCommand({ now: index + 1, exitCode: 0 });
		}

		const records = manager.listRecords();

		expect(records).toHaveLength(COMMAND_RECORD_LIMIT);
		expect(records[0]?.id).toBe("command-2");
		expect(records.at(-1)?.id).toBe(`command-${COMMAND_RECORD_LIMIT + 1}`);
	});
});
