import fs from "node:fs";
import path from "node:path";
import { writeFileIfChanged } from "./agent-wrappers-common";

/**
 * Shared engine for agents whose global config is a TOML file holding a
 * Superset-owned block between start/end markers (Kimi, Vibe, Grok compat).
 * No TOML parser needed: we own the block content, user config outside the
 * markers is preserved verbatim.
 */
export interface ManagedTomlBlockSpec {
	markerStart: string;
	markerEnd: string;
	getFilePath(): string;
	/** File label for setup logs and the delete-file log, e.g. "Kimi config.toml". */
	fileLabel: string;
	/** Label for teardown logs, e.g. "Kimi managed hooks". */
	removeLabel: string;
	fileMode: number;
	/**
	 * Orphan recovery: whether a TOML table (header line + body, up to the next
	 * header) inside a truncated managed block is Superset-owned.
	 */
	isManagedTable(tableLines: string[]): boolean;
	/**
	 * Full managed block including both markers, or "" when nothing should be
	 * registered (e.g. Grok when the user already defines every compat table).
	 */
	buildBlock(base: string): string;
}

function isTomlTableHeader(line: string): boolean {
	return /^\s*\[/.test(line);
}

/**
 * Recover from an interrupted write whose end marker is missing. Managed
 * tables are removed, while a later user-owned table and its leading comments
 * are retained.
 */
function stripOrphanedManagedBlock(
	spec: ManagedTomlBlockSpec,
	base: string,
	start: number,
): string {
	const before = base.slice(0, start);
	const lines = base.slice(start).split("\n");
	let cut = lines.length;

	for (let index = 1; index < lines.length; index++) {
		if (!isTomlTableHeader(lines[index] ?? "")) continue;
		let end = index + 1;
		while (end < lines.length && !isTomlTableHeader(lines[end] ?? "")) end++;
		if (spec.isManagedTable(lines.slice(index, end))) {
			index = end - 1;
			continue;
		}

		cut = index;
		break;
	}

	while (
		cut > 1 &&
		((lines[cut - 1] ?? "").trim() === "" ||
			(lines[cut - 1] ?? "").trimStart().startsWith("#"))
	) {
		cut--;
	}

	return before + lines.slice(cut).join("\n");
}

function stripManagedBlock(
	spec: ManagedTomlBlockSpec,
	existing: string,
): string {
	const start = existing.indexOf(spec.markerStart);
	if (start === -1) return existing;
	const end = existing.indexOf(spec.markerEnd, start);
	return end !== -1
		? existing.slice(0, start) + existing.slice(end + spec.markerEnd.length)
		: stripOrphanedManagedBlock(spec, existing, start);
}

/**
 * Merged content: prior managed block stripped, fresh block appended.
 * Returns "" when the file would contain nothing at all.
 */
export function getManagedTomlContent(
	spec: ManagedTomlBlockSpec,
	existing: string,
): string {
	const base = stripManagedBlock(spec, existing).replace(/\s+$/, "");
	const block = spec.buildBlock(base);
	if (block === "") {
		return base.length > 0 ? `${base}\n` : "";
	}
	return base.length > 0 ? `${base}\n\n${block}\n` : `${block}\n`;
}

export function ensureManagedTomlBlock(spec: ManagedTomlBlockSpec): void {
	const filePath = spec.getFilePath();
	const existing = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8")
		: "";
	const content = getManagedTomlContent(spec, existing);
	if (content === "") return;
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const changed = writeFileIfChanged(filePath, content, spec.fileMode);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} ${spec.fileLabel}`,
	);
}

/**
 * Removes the marker-owned block, preserving user config. Deletes the file
 * when nothing but the managed block was in it. No-op when the file does not
 * exist.
 */
export function removeManagedTomlBlock(spec: ManagedTomlBlockSpec): void {
	const filePath = spec.getFilePath();
	if (!fs.existsSync(filePath)) return;
	const existing = fs.readFileSync(filePath, "utf-8");
	const base = stripManagedBlock(spec, existing).replace(/\s+$/, "");
	if (base.length === 0) {
		fs.unlinkSync(filePath);
		console.log(`[agent-setup] Removed ${spec.fileLabel} (managed block only)`);
		return;
	}
	const changed = writeFileIfChanged(filePath, `${base}\n`, spec.fileMode);
	console.log(
		`[agent-setup] ${changed ? "Removed" : "Verified no"} ${spec.removeLabel}`,
	);
}
