import { parse, TomlError } from "smol-toml";
import type { z } from "zod";
import { type ProjectConfig, projectConfigSchema } from "./schema";

export interface ConfigError {
	message: string;
	line?: number;
	column?: number;
}

export type ParseProjectConfigResult =
	| { ok: true; config: ProjectConfig }
	| { ok: false; errors: ConfigError[] };

export function parseProjectConfig(text: string): ParseProjectConfigResult {
	let raw: unknown;
	try {
		raw = parse(text);
	} catch (error) {
		if (error instanceof TomlError) {
			return {
				ok: false,
				errors: [
					{
						message: error.message.split("\n")[0] ?? error.message,
						line: error.line,
						column: error.column,
					},
				],
			};
		}
		throw error;
	}
	const result = projectConfigSchema.safeParse(raw);
	if (result.success) return { ok: true, config: result.data };
	return {
		ok: false,
		errors: result.error.issues.map((issue) => toConfigError({ issue, text })),
	};
}

function toConfigError({
	issue,
	text,
}: {
	issue: z.core.$ZodIssue;
	text: string;
}): ConfigError {
	const path = [...issue.path.map(String)];
	const unknownKeys =
		issue.code === "unrecognized_keys" ? issue.keys : undefined;
	const keyPath = unknownKeys?.[0] ? [...path, unknownKeys[0]] : path;
	const where = keyPath.length > 0 ? `${keyPath.join(".")}: ` : "";
	const detail =
		issue.code === "invalid_key"
			? (issue.issues[0]?.message ?? issue.message)
			: issue.message;
	const message = unknownKeys
		? `${where}unknown key${unknownKeys.length > 1 ? "s" : ""} ${unknownKeys.join(", ")}`
		: `${where}${detail}`;
	return { message, line: findLine({ text, path: keyPath }) };
}

/** Best-effort line of a dotted path: its table header, or a key inside the nearest table. */
function findLine({
	text,
	path,
}: {
	text: string;
	path: string[];
}): number | undefined {
	if (path.length === 0) return undefined;
	const lines = text.split("\n");
	for (let split = path.length; split >= 1; split--) {
		const table = path.slice(0, split).join(".");
		const headerIndex = lines.findIndex((line) => line.trim() === `[${table}]`);
		if (headerIndex === -1) continue;
		const key = path[split];
		if (!key) return headerIndex + 1;
		for (let index = headerIndex + 1; index < lines.length; index++) {
			const line = lines[index]?.trim() ?? "";
			if (line.startsWith("[")) break;
			if (line.startsWith(`${key} `) || line.startsWith(`${key}=`)) {
				return index + 1;
			}
		}
		return headerIndex + 1;
	}
	return undefined;
}
