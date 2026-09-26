export interface ScriptTexts {
	setup: string;
	teardown: string;
	run: string;
}

export type ScriptFieldName = keyof ScriptTexts;

export interface ScriptPayload {
	setup: string[];
	teardown: string[];
	run: string[];
}

const EMPTY_PAYLOAD: ScriptPayload = { setup: [], teardown: [], run: [] };

function stringEntries(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((s: unknown): s is string => typeof s === "string")
		: [];
}

export function parseConfigContent(content: string | null): ScriptPayload {
	if (!content) return EMPTY_PAYLOAD;
	try {
		const parsed = JSON.parse(content);
		return {
			setup: stringEntries(parsed?.setup),
			teardown: stringEntries(parsed?.teardown),
			run: stringEntries(parsed?.run),
		};
	} catch {
		return EMPTY_PAYLOAD;
	}
}

export function toScriptTexts(payload: ScriptPayload): ScriptTexts {
	return {
		setup: payload.setup.join("\n"),
		teardown: payload.teardown.join("\n"),
		run: payload.run.join("\n"),
	};
}

export function trimScriptValue(value: string): string {
	return value.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
}

function toCommandsArray(value: string): string[] {
	const script = trimScriptValue(value);
	return script ? [script] : [];
}

function commandsForField(
	field: ScriptFieldName,
	values: ScriptTexts,
	loaded: ScriptPayload,
): string[] {
	const isUnedited = values[field] === loaded[field].join("\n");
	return isUnedited ? loaded[field] : toCommandsArray(values[field]);
}

/**
 * An edited field is saved as one entry holding the whole script, so the
 * runner receives it intact. Unedited fields keep the entries they were
 * loaded with, so editing one tab never rewrites another tab's config.
 */
export function buildPayload(
	values: ScriptTexts,
	loaded: ScriptPayload,
): ScriptPayload {
	return {
		setup: commandsForField("setup", values, loaded),
		teardown: commandsForField("teardown", values, loaded),
		run: commandsForField("run", values, loaded),
	};
}

function arraysEqual(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function payloadsEqual(a: ScriptPayload, b: ScriptPayload): boolean {
	return (
		arraysEqual(a.setup, b.setup) &&
		arraysEqual(a.teardown, b.teardown) &&
		arraysEqual(a.run, b.run)
	);
}
