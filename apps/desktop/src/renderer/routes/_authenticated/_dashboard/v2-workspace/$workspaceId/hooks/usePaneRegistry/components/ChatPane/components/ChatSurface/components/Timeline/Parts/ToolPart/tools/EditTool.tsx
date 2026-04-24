/**
 * Edit / str_replace tool renderer. Shows filename + directory in the
 * trigger, with a +/- diff badge. The actual before/after diff renders
 * in a simple inline fallback for now — Phase 3 follow-up will wire
 * the FileDiff context slot to our review-tab diff component.
 */

import type { ToolPart } from "@superset/chat/shared";
import { FileEdit } from "lucide-react";
import { BasicTool } from "../BasicTool";
import { DiffChanges } from "../DiffChanges";
import { ToolErrorCard } from "../ToolErrorCard";
import {
	inputAsRecord,
	isToolError,
	pickString,
	statusFromToolState,
} from "../toolHelpers";

const PATH_KEYS = ["file_path", "filePath", "path", "filename"] as const;
const OLD_KEYS = ["old_string", "oldString", "old", "before"] as const;
const NEW_KEYS = ["new_string", "newString", "new", "after"] as const;

function splitPath(path: string): { dir: string; name: string } {
	const normalized = path.replace(/\\/g, "/");
	const slash = normalized.lastIndexOf("/");
	if (slash < 0) return { dir: "", name: normalized };
	return { dir: normalized.slice(0, slash + 1), name: normalized.slice(slash + 1) };
}

function countDiff(before: string, after: string): {
	additions: number;
	deletions: number;
} {
	const beforeLines = before.split(/\r?\n/).length;
	const afterLines = after.split(/\r?\n/).length;
	const delta = afterLines - beforeLines;
	if (delta >= 0) {
		return { additions: delta, deletions: 0 };
	}
	return { additions: 0, deletions: -delta };
}

export function EditTool({ part }: { part: ToolPart }) {
	const input = inputAsRecord(part.state);
	const path = pickString(input, PATH_KEYS) ?? "";
	const oldStr = pickString(input, OLD_KEYS) ?? "";
	const newStr = pickString(input, NEW_KEYS) ?? "";
	const { dir, name } = splitPath(path);
	const { additions, deletions } = countDiff(oldStr, newStr);

	if (isToolError(part) && part.state.kind === "error") {
		return (
			<ToolErrorCard
				tool="Edit"
				error={part.state.error.message}
				subtitle={path || undefined}
			/>
		);
	}

	return (
		<BasicTool
			icon={FileEdit}
			status={statusFromToolState(part.state)}
			defer
			trigger={{
				title: "Edit",
				subtitle: name,
				action:
					additions + deletions > 0 ? (
						<DiffChanges additions={additions} deletions={deletions} />
					) : null,
			}}
		>
			<EditContent dir={dir} name={name} before={oldStr} after={newStr} />
		</BasicTool>
	);
}

function EditContent({
	dir,
	name,
	before,
	after,
}: {
	dir: string;
	name: string;
	before: string;
	after: string;
}) {
	return (
		<div>
			{dir && (
				<div className="text-muted-foreground mb-2 font-mono text-[10px]">
					{dir}
					<span className="text-foreground">{name}</span>
				</div>
			)}
			<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
				<DiffColumn label="before" text={before} tone="deletion" />
				<DiffColumn label="after" text={after} tone="addition" />
			</div>
		</div>
	);
}

function DiffColumn({
	label,
	text,
	tone,
}: {
	label: string;
	text: string;
	tone: "addition" | "deletion";
}) {
	return (
		<div>
			<div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">
				{label}
			</div>
			<pre
				data-scrollable="true"
				className={`max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm border px-2 py-1 font-mono text-[11px] ${
					tone === "deletion"
						? "border-red-200 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/30"
						: "border-green-200 bg-green-50/40 dark:border-green-900/60 dark:bg-green-950/30"
				}`}
			>
				{text || <span className="text-muted-foreground">(empty)</span>}
			</pre>
		</div>
	);
}
