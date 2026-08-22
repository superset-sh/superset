import fs from "node:fs";
import path from "node:path";
import { writeFileIfChanged } from "./agent-wrappers-common";

/**
 * Shared merge/remove engine for agents whose global config is a JSON file
 * mapping event names to arrays of hook entries (Claude, Codex, Droid,
 * Mastra, Cursor, Gemini). A spec describes the parts that genuinely differ
 * per agent: where the file lives, where the event map sits, what entries we
 * register, and how to recognize/strip our own entries.
 */
export interface ManagedJsonHooksSpec<Entry> {
	/** File label for setup logs, e.g. "Claude settings.json". */
	fileLabel: string;
	/** Agent label for teardown logs, e.g. "Claude". */
	agentLabel: string;
	getFilePath(): string;
	/**
	 * Key of the event→entries map on the root object, or null when the root
	 * object itself is the event map (Mastra).
	 */
	eventsContainerKey: string | null;
	/** Managed entries appended per event after stale ones are stripped. */
	desiredEntriesByEvent: Record<string, Entry[]>;
	/**
	 * Strips Superset-managed content from one existing entry. Returns the
	 * entry unchanged when it is user-owned, a cleaned copy when it mixed user
	 * and managed inner hooks, or null when nothing user-owned remains.
	 */
	cleanEntry(entry: Entry): Entry | null;
	/** Root defaults enforced on merge (e.g. Cursor's `version: 1`). */
	applyRootDefaults?(root: Record<string, unknown>): void;
	/** Whether teardown deletes the events container key once empty. */
	dropEmptyContainerOnRemove?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRootForMerge<Entry>(
	spec: ManagedJsonHooksSpec<Entry>,
): Record<string, unknown> | null {
	const filePath = spec.getFilePath();
	if (!fs.existsSync(filePath)) return {};
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		if (!isPlainObject(parsed)) {
			console.warn(
				`[agent-setup] Expected ${filePath} to contain a JSON object; skipping ${spec.agentLabel} hook merge`,
			);
			return null;
		}
		return parsed;
	} catch (error) {
		console.warn(
			`[agent-setup] Could not parse existing ${filePath}; skipping ${spec.agentLabel} hook merge:`,
			error,
		);
		return null;
	}
}

/**
 * Strips managed entries from every event via cleanEntry. Event keys that end
 * up empty keep their position when we still manage that event (so re-adding
 * does not reorder the file) and are dropped otherwise.
 */
function stripManagedEntries<Entry>(
	events: Record<string, unknown>,
	spec: ManagedJsonHooksSpec<Entry>,
	{ keepManagedEventKeys }: { keepManagedEventKeys: boolean },
): void {
	for (const [eventName, value] of Object.entries(events)) {
		if (!Array.isArray(value)) continue;
		const kept = value.flatMap((entry) => {
			// Foreign junk (null, strings, …) is preserved verbatim, never
			// handed to cleanEntry — a malformed entry must not abort the merge.
			if (entry === null || typeof entry !== "object") return [entry];
			const cleaned = spec.cleanEntry(entry as Entry);
			return cleaned === null ? [] : [cleaned];
		});
		if (
			kept.length === 0 &&
			!(keepManagedEventKeys && eventName in spec.desiredEntriesByEvent)
		) {
			delete events[eventName];
		} else {
			events[eventName] = kept;
		}
	}
}

/**
 * Merged config content: existing user entries preserved, stale managed
 * entries stripped everywhere (including events we no longer manage), and the
 * current managed entries appended per event. Returns null when the existing
 * file cannot be read as a JSON object — never clobber a file we can't parse.
 */
export function getManagedJsonHooksContent<Entry>(
	spec: ManagedJsonHooksSpec<Entry>,
): string | null {
	const root = readRootForMerge(spec);
	if (root === null) return null;
	spec.applyRootDefaults?.(root);

	let events: Record<string, unknown>;
	if (spec.eventsContainerKey === null) {
		events = root;
	} else {
		const container = root[spec.eventsContainerKey];
		events = isPlainObject(container) ? container : {};
		root[spec.eventsContainerKey] = events;
	}

	stripManagedEntries(events, spec, { keepManagedEventKeys: true });

	for (const [eventName, desired] of Object.entries(
		spec.desiredEntriesByEvent,
	)) {
		const current = events[eventName];
		const kept = Array.isArray(current) ? current : [];
		events[eventName] = [...kept, ...desired];
	}

	return JSON.stringify(root, null, 2);
}

export function ensureManagedJsonHooks<Entry>(
	spec: ManagedJsonHooksSpec<Entry>,
): void {
	const content = getManagedJsonHooksContent(spec);
	if (content === null) return;

	const filePath = spec.getFilePath();
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const changed = writeFileIfChanged(filePath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} ${spec.fileLabel}`,
	);
}

/**
 * Removes Superset-managed entries, preserving user entries byte-for-byte.
 * No-op when the file does not exist — teardown must never create files.
 */
export function removeManagedJsonHooks<Entry>(
	spec: ManagedJsonHooksSpec<Entry>,
): void {
	const filePath = spec.getFilePath();
	if (!fs.existsSync(filePath)) return;

	let root: unknown;
	try {
		root = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		console.warn(
			`[agent-setup] Could not parse existing ${filePath}; skipping ${spec.agentLabel} hook removal`,
		);
		return;
	}
	if (!isPlainObject(root)) return;

	let events: Record<string, unknown>;
	if (spec.eventsContainerKey === null) {
		events = root;
	} else {
		const container = root[spec.eventsContainerKey];
		if (!isPlainObject(container)) return;
		events = container;
	}

	stripManagedEntries(events, spec, { keepManagedEventKeys: false });

	if (
		spec.eventsContainerKey !== null &&
		spec.dropEmptyContainerOnRemove &&
		Object.keys(events).length === 0
	) {
		delete root[spec.eventsContainerKey];
	}

	const changed = writeFileIfChanged(
		filePath,
		JSON.stringify(root, null, 2),
		0o644,
	);
	console.log(
		`[agent-setup] ${changed ? "Removed" : "Verified no"} ${spec.agentLabel} managed hooks`,
	);
}

/**
 * Entry cleaner for the nested definition shape shared by Claude, Codex, and
 * Droid: `{ matcher?, hooks: [{ type, command }] }`. Filters managed inner
 * hooks, preserving user hooks that share a definition with ours.
 */
export function cleanNestedHookDefinition<
	D extends { hooks?: Array<{ command: string }> },
>(definition: D, isManagedCommand: (command: string) => boolean): D | null {
	if (!Array.isArray(definition.hooks)) return definition;
	const kept = definition.hooks.filter(
		(hook) => !isManagedCommand(hook.command),
	);
	if (kept.length === definition.hooks.length) return definition;
	if (kept.length === 0) return null;
	return { ...definition, hooks: kept };
}

/**
 * Builds the desired one-entry-per-event map for the nested definition shape.
 */
export function buildNestedDesiredEntries<D>(
	events: Record<string, { matcher?: string }>,
	command: string,
): Record<string, D[]> {
	return Object.fromEntries(
		Object.entries(events).map(([eventName, { matcher }]) => [
			eventName,
			[
				{
					...(matcher !== undefined ? { matcher } : {}),
					hooks: [{ type: "command", command }],
				} as D,
			],
		]),
	);
}
