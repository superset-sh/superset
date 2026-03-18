import { z } from "zod";

const mastraTextContentPartSchema = z.object({
	type: z.literal("text"),
	text: z.string(),
});

const mastraToolResultEnvelopeSchema = z.object({
	content: z
		.array(z.union([z.string(), mastraTextContentPartSchema]))
		.optional(),
	text: z.string().optional(),
	output: z.unknown().optional(),
	result: z.unknown().optional(),
	error: z.unknown().optional(),
});

const COMMAND_KEYS = ["command", "cmd", "command_line", "commandLine", "raw"];
const STDOUT_KEYS = [
	"content",
	"stdout",
	"stdout_text",
	"stdoutText",
	"output_text",
	"outputText",
	"text",
	"output",
	"result",
	"combined_output",
	"combinedOutput",
];
const STDERR_KEYS = [
	"stderr",
	"stderr_text",
	"stderrText",
	"error",
	"error_text",
	"errorText",
];
const EXIT_CODE_KEYS = ["exitCode", "exit_code", "code", "status_code"];
const TRAVERSAL_KEYS = ["output", "result"];

type UnknownRecord = Record<string, unknown>;

export interface ExecuteCommandViewModel {
	command: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
}

function toRecord(value: unknown): UnknownRecord | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as UnknownRecord;
	}
	return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function safeJsonStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return undefined;
	}
}

function toText(
	value: unknown,
	seen = new WeakSet<object>(),
): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		const parts = value
			.map((item) => toText(item, seen))
			.filter((item): item is string =>
				Boolean(item && item.trim().length > 0),
			);
		return parts.length > 0 ? parts.join("\n") : undefined;
	}
	if (typeof value === "object" && value !== null) {
		if (seen.has(value)) return undefined;
		seen.add(value);

		const parsedEnvelope = mastraToolResultEnvelopeSchema.safeParse(value);
		if (parsedEnvelope.success) {
			const content = parsedEnvelope.data.content;
			if (content && content.length > 0) {
				const text = content
					.map((part) => (typeof part === "string" ? part : part.text))
					.filter((part) => part.trim().length > 0)
					.join("\n");
				if (text.trim().length > 0) return text;
			}

			for (const nested of [
				parsedEnvelope.data.text,
				parsedEnvelope.data.output,
				parsedEnvelope.data.result,
				parsedEnvelope.data.error,
			]) {
				const text = toText(nested, seen);
				if (text && text.trim().length > 0) return text;
			}
		}

		const record = value as UnknownRecord;
		for (const key of ["message", "output_text", "outputText"]) {
			const text = toText(record[key], seen);
			if (text && text.trim().length > 0) return text;
		}
	}
	return undefined;
}

function firstText(values: unknown[]): string | undefined {
	for (const value of values) {
		const text = toText(value);
		if (text && text.trim().length > 0) return text;
	}
	return undefined;
}

function firstNumber(values: unknown[]): number | undefined {
	for (const value of values) {
		const number = toFiniteNumber(value);
		if (number !== undefined) return number;
	}
	return undefined;
}

function collectRecordGraph(root: UnknownRecord): UnknownRecord[] {
	const queue: UnknownRecord[] = [root];
	const seen = new Set<UnknownRecord>();
	const records: UnknownRecord[] = [];

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || seen.has(current)) continue;
		seen.add(current);
		records.push(current);

		for (const key of TRAVERSAL_KEYS) {
			const nested = toRecord(current[key]);
			if (nested && !seen.has(nested)) {
				queue.push(nested);
			}
		}
	}

	return records;
}

function collectValuesByKeys({
	records,
	keys,
}: {
	records: UnknownRecord[];
	keys: string[];
}): unknown[] {
	const values: unknown[] = [];
	for (const record of records) {
		for (const key of keys) {
			values.push(record[key]);
		}
	}
	return values;
}

export function getExecuteCommandViewModel({
	args,
	result,
}: {
	args: UnknownRecord;
	result: UnknownRecord;
}): ExecuteCommandViewModel {
	const resultRecords = collectRecordGraph(result);

	const command =
		firstText([
			...collectValuesByKeys({
				records: [args, ...resultRecords],
				keys: COMMAND_KEYS,
			}),
		]) ?? "";

	let stdout = firstText([
		...collectValuesByKeys({
			records: resultRecords,
			keys: STDOUT_KEYS,
		}),
		result,
	]);
	if (!stdout) {
		const fallbackObject = toRecord(result.output) ?? toRecord(result.result);
		stdout = fallbackObject ? safeJsonStringify(fallbackObject) : undefined;
	}

	const stderr = firstText(
		collectValuesByKeys({
			records: resultRecords,
			keys: STDERR_KEYS,
		}),
	);

	const exitCode = firstNumber(
		collectValuesByKeys({
			records: resultRecords,
			keys: EXIT_CODE_KEYS,
		}),
	);

	return {
		command,
		stdout,
		stderr,
		exitCode,
	};
}
