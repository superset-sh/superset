import { readFile, rename, writeFile } from "node:fs/promises";

const ENV_ASSIGNMENT_PATTERN =
	/^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/;

export function escapeEnvValue(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("$", "\\$")
		.replaceAll("`", "\\`")
		.replaceAll("\n", "\\n");
}

export function formatEnvVar(key: string, value: string): string {
	return `${key}="${escapeEnvValue(value)}"`;
}

function parseEnvValue(rawValue: string): string {
	const trimmed = rawValue.trim();
	if (trimmed.length === 0) {
		return "";
	}

	if (trimmed.startsWith('"')) {
		const end = findClosingQuote(trimmed, '"');
		const quoted = end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
		return quoted
			.replaceAll("\\n", "\n")
			.replaceAll('\\"', '"')
			.replaceAll("\\$", "$")
			.replaceAll("\\`", "`")
			.replaceAll("\\\\", "\\");
	}

	if (trimmed.startsWith("'")) {
		const end = findClosingQuote(trimmed, "'");
		return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
	}

	const commentIndex = findUnquotedComment(trimmed);
	const value = commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex);
	return value.trimEnd();
}

function findClosingQuote(value: string, quote: '"' | "'"): number {
	for (let index = 1; index < value.length; index += 1) {
		if (quote === '"' && value[index] === "\\" && index + 1 < value.length) {
			index += 1;
			continue;
		}

		if (value[index] === quote) {
			return index;
		}
	}

	return -1;
}

function findUnquotedComment(value: string): number {
	for (let index = 0; index < value.length; index += 1) {
		if (value[index] !== "#") {
			continue;
		}

		if (index === 0 || /\s/.test(value[index - 1] ?? "")) {
			return index;
		}
	}

	return -1;
}

export function parseEnvFile(content: string): Record<string, string> {
	const parsed: Record<string, string> = {};
	const lines = content.split(/\r?\n/);

	for (const line of lines) {
		const match = ENV_ASSIGNMENT_PATTERN.exec(line);
		if (!match) {
			continue;
		}

		const key = match[1];
		if (!key) {
			continue;
		}

		const equalsIndex = line.indexOf("=");
		if (equalsIndex === -1) {
			continue;
		}

		parsed[key] = parseEnvValue(line.slice(equalsIndex + 1));
	}

	return parsed;
}

export async function upsertEnvVar(
	filePath: string,
	key: string,
	value: string,
): Promise<void> {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
		throw new Error(`Invalid env var key: ${key}`);
	}

	const replacement = formatEnvVar(key, value);
	let content = "";

	try {
		content = await readFile(filePath, "utf8");
	} catch (error) {
		if (!isNodeErrorWithCode(error, "ENOENT")) {
			throw error;
		}

		await writeFile(filePath, `${replacement}\n`, "utf8");
		return;
	}

	const endsWithNewline = content.endsWith("\n");
	const lines = content.split(/\r?\n/);
	if (endsWithNewline) {
		lines.pop();
	}

	let found = false;
	const nextLines: string[] = [];
	for (const line of lines) {
		const match = ENV_ASSIGNMENT_PATTERN.exec(line);
		if (match?.[1] === key) {
			if (!found) {
				nextLines.push(replacement);
				found = true;
			}
			continue;
		}

		nextLines.push(line);
	}

	if (!found) {
		nextLines.push(replacement);
	}

	const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
	await writeFile(tmpPath, `${nextLines.join("\n")}\n`, "utf8");
	await rename(tmpPath, filePath);
}

export function isNodeErrorWithCode(
	error: unknown,
	code: string,
): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error && error.code === code;
}
