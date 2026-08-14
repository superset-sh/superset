import type { CommitMetadata } from "@superset/host-service";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";

interface CommitMetadataHeaderProps {
	commit: CommitMetadata;
}

/**
 * Read-only metadata strip at the top of a commit diff pane: short hash,
 * parents (so a merge reads as one), the full message (subject + body),
 * authorship, and a relative date. Rendered only when the pane carries a
 * commit/range ref — the Changes tab's follower pane shows nothing here.
 */
export function CommitMetadataHeader({ commit }: CommitMetadataHeaderProps) {
	const ts = Date.parse(commit.date);
	const parents = commit.parents.map((p) => p.slice(0, 7));
	// %B is subject + body; split the first line off as the subject so a long
	// body doesn't crowd the title row.
	const newlineIdx = commit.message.indexOf("\n");
	const subject =
		newlineIdx === -1 ? commit.message : commit.message.slice(0, newlineIdx);
	const body =
		newlineIdx === -1 ? "" : commit.message.slice(newlineIdx + 1).trim();

	return (
		<div className="shrink-0 border-b border-border px-3 py-2">
			<div className="flex items-center gap-2 text-[11px]">
				<span className="font-mono text-muted-foreground tabular-nums">
					{commit.shortHash}
				</span>
				{parents.length > 0 && (
					<span
						className="font-mono text-muted-foreground/70 tabular-nums"
						title={commit.parents.join(", ") || undefined}
					>
						← {parents.join(" ")}
					</span>
				)}
				{Number.isNaN(ts) ? null : (
					<span
						className="ml-auto font-mono text-muted-foreground tabular-nums"
						title={commit.date}
					>
						{formatRelativeTime(ts)}
					</span>
				)}
			</div>
			{subject && (
				<div
					className="mt-1 truncate text-xs font-medium text-foreground"
					title={subject}
				>
					{subject}
				</div>
			)}
			{body && (
				<pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] text-muted-foreground">
					{body}
				</pre>
			)}
			<div className="mt-1 truncate text-[11px] text-muted-foreground">
				{commit.author}
				{commit.authorEmail ? ` <${commit.authorEmail}>` : ""}
			</div>
		</div>
	);
}
