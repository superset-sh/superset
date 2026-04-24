/**
 * Multi-file apply_patch tool renderer. Extracts the per-file entries
 * from the patch input and shows each as a nested Radix Accordion
 * item: sticky file header + lazy-mounted content. Ported conceptually
 * from OpenCode's message-part.tsx:2017-2206.
 *
 * Single-file patches skip the accordion.
 */

import type { ToolPart } from "@superset/chat/shared";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@superset/ui/accordion";
import { FileDiff } from "lucide-react";
import { BasicTool } from "../BasicTool";
import { DiffChanges } from "../DiffChanges";
import { ToolErrorCard } from "../ToolErrorCard";
import {
	inputAsRecord,
	isToolError,
	statusFromToolState,
} from "../toolHelpers";

interface PatchedFile {
	path: string;
	kind: "create" | "delete" | "modify" | "move";
	additions: number;
	deletions: number;
	oldContent?: string;
	newContent?: string;
}

function basename(path: string): string {
	if (!path) return "";
	const slash = path.lastIndexOf("/");
	return slash < 0 ? path : path.slice(slash + 1);
}
function dirname(path: string): string {
	if (!path) return "";
	const slash = path.lastIndexOf("/");
	return slash < 0 ? "" : path.slice(0, slash + 1);
}

function countLines(s: string): number {
	if (!s) return 0;
	return s.split(/\r?\n/).length;
}

function extractPatchedFiles(state: ToolPart["state"]): PatchedFile[] {
	const input = inputAsRecord(state);
	// Common shapes:
	//   { files: Array<{ path, type, content?, old_content?, new_content? }> }
	//   { patch: string }  // unified diff — best-effort skip
	const raw = input?.files;
	if (!Array.isArray(raw)) return [];

	const out: PatchedFile[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const rec = entry as Record<string, unknown>;
		const path =
			(typeof rec.path === "string" && rec.path) ||
			(typeof rec.file_path === "string" && rec.file_path) ||
			(typeof rec.filePath === "string" && rec.filePath) ||
			"";
		if (!path) continue;
		const typeStr =
			(typeof rec.type === "string" && rec.type) ||
			(typeof rec.operation === "string" && rec.operation) ||
			"modify";
		const kind: PatchedFile["kind"] =
			typeStr === "create" || typeStr === "add"
				? "create"
				: typeStr === "delete" || typeStr === "remove"
					? "delete"
					: typeStr === "move" || typeStr === "rename"
						? "move"
						: "modify";
		const oldContent =
			(typeof rec.old_content === "string" && rec.old_content) ||
			(typeof rec.oldContent === "string" && rec.oldContent) ||
			(typeof rec.before === "string" && rec.before) ||
			"";
		const newContent =
			(typeof rec.new_content === "string" && rec.new_content) ||
			(typeof rec.newContent === "string" && rec.newContent) ||
			(typeof rec.content === "string" && rec.content) ||
			(typeof rec.after === "string" && rec.after) ||
			"";
		const additions =
			kind === "delete"
				? 0
				: Math.max(0, countLines(newContent) - countLines(oldContent));
		const deletions =
			kind === "create"
				? 0
				: Math.max(0, countLines(oldContent) - countLines(newContent));
		out.push({ path, kind, additions, deletions, oldContent, newContent });
	}
	return out;
}

export function ApplyPatchTool({ part }: { part: ToolPart }) {
	const files = extractPatchedFiles(part.state);

	if (isToolError(part) && part.state.kind === "error") {
		return (
			<ToolErrorCard
				tool="Apply patch"
				error={part.state.error.message}
				subtitle={files.length > 0 ? `${files.length} files` : undefined}
			/>
		);
	}

	const totalAdd = files.reduce((s, f) => s + f.additions, 0);
	const totalDel = files.reduce((s, f) => s + f.deletions, 0);

	if (files.length === 0) {
		return (
			<BasicTool
				icon={FileDiff}
				status={statusFromToolState(part.state)}
				hideDetails
				trigger={{ title: "Apply patch", subtitle: "(no files)" }}
			/>
		);
	}

	// Single-file — render without the accordion nesting.
	if (files.length === 1) {
		const f = files[0] as PatchedFile;
		return (
			<BasicTool
				icon={FileDiff}
				status={statusFromToolState(part.state)}
				defer
				trigger={{
					title: "Apply patch",
					subtitle: f.path,
					action:
						f.additions + f.deletions > 0 ? (
							<DiffChanges additions={f.additions} deletions={f.deletions} />
						) : null,
				}}
			>
				<FileDiffColumns file={f} />
			</BasicTool>
		);
	}

	return (
		<BasicTool
			icon={FileDiff}
			status={statusFromToolState(part.state)}
			defer
			trigger={{
				title: "Apply patch",
				subtitle: `${files.length} files`,
				action:
					totalAdd + totalDel > 0 ? (
						<DiffChanges additions={totalAdd} deletions={totalDel} />
					) : null,
			}}
		>
			<Accordion type="multiple" className="w-full">
				{files.map((f) => (
					<AccordionItem
						key={f.path}
						value={f.path}
						className="border-border border-b last:border-b-0"
					>
						<AccordionTrigger className="hover:bg-muted/30 sticky top-0 z-10 bg-background px-2 py-1.5 text-xs">
							<div className="flex min-w-0 flex-1 items-center gap-2">
								<ChangeKindBadge kind={f.kind} />
								<span className="text-muted-foreground truncate font-mono">
									{dirname(f.path)}
								</span>
								<span className="text-foreground truncate font-mono">
									{basename(f.path)}
								</span>
								<DiffChanges additions={f.additions} deletions={f.deletions} />
							</div>
						</AccordionTrigger>
						<AccordionContent className="bg-muted/10 px-2 pb-2">
							<FileDiffColumns file={f} />
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</BasicTool>
	);
}

function ChangeKindBadge({ kind }: { kind: PatchedFile["kind"] }) {
	const { label, tone } =
		kind === "create"
			? { label: "new", tone: "text-green-600 dark:text-green-400" }
			: kind === "delete"
				? { label: "del", tone: "text-red-600 dark:text-red-400" }
				: kind === "move"
					? { label: "mov", tone: "text-muted-foreground" }
					: { label: "mod", tone: "text-muted-foreground" };
	return (
		<span
			className={`shrink-0 rounded border px-1 text-[10px] uppercase ${tone}`}
		>
			{label}
		</span>
	);
}

function FileDiffColumns({ file }: { file: PatchedFile }) {
	return (
		<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
			<DiffColumn label="before" text={file.oldContent ?? ""} tone="deletion" />
			<DiffColumn label="after" text={file.newContent ?? ""} tone="addition" />
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
