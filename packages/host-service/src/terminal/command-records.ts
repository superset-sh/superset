import { randomUUID } from "node:crypto";
import {
	TERMINAL_COMMAND_RECORD_LIMIT,
	type TerminalCommandRecord,
	type TerminalCommandSource,
	type TerminalCommandStatus,
} from "@superset/shared/terminal-command-record";

export const COMMAND_RECORD_LIMIT = TERMINAL_COMMAND_RECORD_LIMIT;
export const COMMAND_OUTPUT_HEAD_LINES = 200;
export const COMMAND_OUTPUT_TAIL_LINES = 400;
export const COMMAND_OUTPUT_MAX_LINE_CHARS = 4096;
export const COMMAND_OUTPUT_HEAD_BYTES = 192 * 1024;
export const COMMAND_OUTPUT_TAIL_BYTES = 320 * 1024;
export const COMMAND_CORRELATION_WINDOW_MS = 30_000;

export interface ExpectedTerminalCommand {
	commandId?: string;
	command: string;
	source: Exclude<TerminalCommandSource, "user">;
	sentAt: number;
}

interface InternalTerminalCommandRecord extends TerminalCommandRecord {
	headLines: string[];
	tailLines: string[];
	headBytes: number;
	tailBytes: number;
	partialLine: string;
}

export interface StartCommandOptions {
	now: number;
	cwd: string | null;
	gitBranch?: string | null;
	command?: string | null;
}

export interface FinishCommandOptions {
	now: number;
	exitCode: number | null;
}

function stripAnsi(value: string): string {
	return value
		.replace(
			// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI/OSC stripping requires control bytes.
			/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x9d[^\x07\x9c]*(?:\x07|\x9c)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-Z\\-_]/g,
			"",
		)
		.replace(/[\x80-\x9f]/g, "");
}

function isPromptDecoration(line: string): boolean {
	const normalized = stripAnsi(line).trim();
	return /^[%>$#❯➜]+$/.test(normalized);
}

function trimLine(line: string): string {
	const chars = Array.from(line);
	if (chars.length <= COMMAND_OUTPUT_MAX_LINE_CHARS) return line;
	return `${chars.slice(0, COMMAND_OUTPUT_MAX_LINE_CHARS).join("")}...`;
}

function getRetainedLineBytes(line: string): number {
	return Buffer.byteLength(`${line}\n`, "utf8");
}

function trimLineToByteBudget(line: string, budget: number): string | null {
	if (budget <= 0) return null;
	if (getRetainedLineBytes(line) <= budget) return line;

	let result = "";
	for (const char of line) {
		const next = `${result}${char}`;
		if (getRetainedLineBytes(next) > budget) break;
		result = next;
	}
	return result || null;
}

function toPublicRecord(
	record: InternalTerminalCommandRecord,
): TerminalCommandRecord {
	const allRetainedLines = [...record.headLines, ...record.tailLines];
	const includeTail = record.outputLineCount > allRetainedLines.length;
	const headLines = includeTail ? record.headLines : allRetainedLines;
	const tailLines = includeTail ? record.tailLines : [];

	return {
		id: record.id,
		terminalId: record.terminalId,
		workspaceId: record.workspaceId,
		sequence: record.sequence,
		command: record.command,
		source: record.source,
		cwd: record.cwd,
		gitBranch: record.gitBranch,
		startedAt: record.startedAt,
		endedAt: record.endedAt,
		status: record.status,
		exitCode: record.exitCode,
		outputHead: headLines.join("\n"),
		outputTail: tailLines.join("\n"),
		outputLineCount: record.outputLineCount,
		truncatedLineCount: Math.max(
			0,
			record.outputLineCount - allRetainedLines.length,
		),
		byteCount: record.byteCount,
	};
}

export class TerminalCommandRecordManager {
	private readonly terminalId: string;
	private readonly workspaceId: string;
	private records: InternalTerminalCommandRecord[] = [];
	private expectedCommands: ExpectedTerminalCommand[] = [];
	private activeRecord: InternalTerminalCommandRecord | null = null;
	private nextSequence = 1;

	constructor(params: { terminalId: string; workspaceId: string }) {
		this.terminalId = params.terminalId;
		this.workspaceId = params.workspaceId;
	}

	queueExpectedCommand(command: Omit<ExpectedTerminalCommand, "sentAt">): void {
		this.pruneStaleExpectedCommands(Date.now());
		this.expectedCommands.push({ ...command, sentAt: Date.now() });
		if (this.expectedCommands.length <= 20) return;

		const dropped = this.expectedCommands.shift();
		console.warn(
			`[terminal] dropped queued command correlation id=${dropped?.commandId ?? "unknown"} terminalId=${this.terminalId}`,
		);
	}

	startCommand(options: StartCommandOptions): TerminalCommandRecord {
		if (this.activeRecord) {
			this.finishCommand({ now: options.now, exitCode: null });
		}

		this.pruneStaleExpectedCommands(options.now);
		const expected = this.expectedCommands.shift();
		const record: InternalTerminalCommandRecord = {
			id: expected?.commandId ?? randomUUID(),
			terminalId: this.terminalId,
			workspaceId: this.workspaceId,
			sequence: this.nextSequence,
			command: expected?.command ?? options.command ?? "",
			source: expected?.source ?? "user",
			cwd: options.cwd,
			gitBranch: options.gitBranch ?? null,
			startedAt: options.now,
			endedAt: null,
			status: "running",
			exitCode: null,
			outputHead: "",
			outputTail: "",
			outputLineCount: 0,
			truncatedLineCount: 0,
			byteCount: 0,
			headLines: [],
			tailLines: [],
			headBytes: 0,
			tailBytes: 0,
			partialLine: "",
		};
		this.nextSequence += 1;
		this.activeRecord = record;
		this.records.push(record);
		this.pruneRecords();
		return toPublicRecord(record);
	}

	appendOutput(chunk: string): TerminalCommandRecord | null {
		if (!this.activeRecord) return null;
		const plain = stripAnsi(chunk).replaceAll("\r", "");
		if (!plain) return toPublicRecord(this.activeRecord);

		this.activeRecord.byteCount += Buffer.byteLength(plain, "utf8");
		const pieces = plain.split("\n");
		pieces[0] = `${this.activeRecord.partialLine}${pieces[0] ?? ""}`;

		for (let i = 0; i < pieces.length - 1; i++) {
			this.appendLine(this.activeRecord, pieces[i] ?? "");
		}

		this.activeRecord.partialLine = pieces[pieces.length - 1] ?? "";
		return toPublicRecord(this.activeRecord);
	}

	finishCommand(options: FinishCommandOptions): TerminalCommandRecord | null {
		const record = this.activeRecord;
		if (!record) return null;

		if (record.partialLine) {
			this.appendLine(record, record.partialLine);
			record.partialLine = "";
		}

		record.endedAt = options.now;
		record.exitCode = options.exitCode;
		if (options.exitCode === 0) {
			record.status = "succeeded";
		} else if (options.exitCode === null) {
			record.status = "unknown";
		} else {
			record.status = "failed";
		}

		this.activeRecord = null;
		return toPublicRecord(record);
	}

	finishActiveFromPrompt(now: number): TerminalCommandRecord | null {
		if (!this.activeRecord) return null;
		if (this.activeRecord.partialLine) {
			if (isPromptDecoration(this.activeRecord.partialLine)) {
				this.activeRecord.partialLine = "";
			}
		}
		return this.finishCommand({ now, exitCode: null });
	}

	handlePtyExit(now: number): TerminalCommandRecord | null {
		return this.finishCommand({ now, exitCode: null });
	}

	listRecords(options: { limit?: number } = {}): TerminalCommandRecord[] {
		const limit = Math.max(
			1,
			Math.min(COMMAND_RECORD_LIMIT, options.limit ?? COMMAND_RECORD_LIMIT),
		);
		return this.records.slice(-limit).map(toPublicRecord);
	}

	getRecord(recordId: string): TerminalCommandRecord | null {
		const record = this.records.find((candidate) => candidate.id === recordId);
		return record ? toPublicRecord(record) : null;
	}

	private appendLine(
		record: InternalTerminalCommandRecord,
		line: string,
	): void {
		const normalized = trimLine(line);
		record.outputLineCount += 1;

		if (
			record.headLines.length < COMMAND_OUTPUT_HEAD_LINES &&
			record.headBytes < COMMAND_OUTPUT_HEAD_BYTES
		) {
			const retained = trimLineToByteBudget(
				normalized,
				COMMAND_OUTPUT_HEAD_BYTES - record.headBytes,
			);
			if (retained !== null) {
				record.headLines.push(retained);
				record.headBytes += getRetainedLineBytes(retained);
				return;
			}
			record.headBytes = COMMAND_OUTPUT_HEAD_BYTES;
		}

		const retained = trimLineToByteBudget(
			normalized,
			COMMAND_OUTPUT_TAIL_BYTES,
		);
		if (retained === null) return;
		const retainedBytes = getRetainedLineBytes(retained);

		while (
			record.tailLines.length >= COMMAND_OUTPUT_TAIL_LINES ||
			record.tailBytes + retainedBytes > COMMAND_OUTPUT_TAIL_BYTES
		) {
			const removed = record.tailLines.shift();
			if (removed === undefined) break;
			record.tailBytes -= getRetainedLineBytes(removed);
		}
		record.tailLines.push(retained);
		record.tailBytes += retainedBytes;
	}

	private pruneRecords(): void {
		while (this.records.length > COMMAND_RECORD_LIMIT) {
			// The active record is always the newest record, so count pruning only
			// removes completed older records.
			this.records.shift();
		}
	}

	private pruneStaleExpectedCommands(now: number): void {
		while (this.expectedCommands.length > 0) {
			const first = this.expectedCommands[0];
			if (!first || now - first.sentAt <= COMMAND_CORRELATION_WINDOW_MS) return;
			const dropped = this.expectedCommands.shift();
			console.warn(
				`[terminal] dropped stale command correlation id=${dropped?.commandId ?? "unknown"} terminalId=${this.terminalId}`,
			);
		}
	}
}

export type {
	TerminalCommandRecord,
	TerminalCommandSource,
	TerminalCommandStatus,
};
