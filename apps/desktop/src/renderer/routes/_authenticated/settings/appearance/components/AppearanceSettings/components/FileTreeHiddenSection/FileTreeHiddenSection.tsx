import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	DEFAULT_FILE_TREE_HIDDEN_PATTERNS,
	MAX_FILE_TREE_HIDDEN_PATTERNS,
} from "shared/file-tree-patterns";

function toText(patterns: string[]): string {
	return patterns.join("\n");
}

function toPatterns(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.slice(0, MAX_FILE_TREE_HIDDEN_PATTERNS);
}

export function FileTreeHiddenSection() {
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();
	const { data, isLoading } =
		electronTrpc.settings.getFileTreeHiddenPatterns.useQuery();
	const setPatterns =
		electronTrpc.settings.setFileTreeHiddenPatterns.useMutation({
			onSuccess: () => {
				void utils.settings.getFileTreeHiddenPatterns.invalidate();
			},
		});

	const [draft, setDraft] = useState<string | null>(null);
	const persisted = toText(data ?? []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: drop the local draft when persisted patterns change so a save or reset is reflected in the textarea
	useEffect(() => {
		setDraft(null);
	}, [persisted]);

	const value = draft ?? persisted;
	const isDirty = draft !== null && draft !== persisted;

	const commit = () => {
		if (draft === null) return;
		setPatterns.mutate({ patterns: toPatterns(draft) });
	};

	return (
		<section aria-labelledby="file-tree-hidden-title">
			<h3 id="file-tree-hidden-title" className="text-sm font-medium mb-1">
				<HighlightText text="Hidden files" query={searchQuery} />
			</h3>
			<p className="text-xs text-muted-foreground mb-3">
				One glob pattern per line. Matching files and folders are hidden from
				the workspace file tree. A pattern without a slash matches a name at any
				depth (<code>node_modules</code>), a leading slash anchors it to the
				workspace root (<code>/output</code>), and a trailing slash limits it to
				directories (<code>build/</code>).
			</p>

			<Textarea
				aria-label="Hidden file patterns"
				className="font-mono text-xs min-h-32"
				spellCheck={false}
				disabled={isLoading}
				value={value}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commit}
			/>

			<div className="mt-2 flex items-center gap-2">
				<Button size="sm" onClick={commit} disabled={!isDirty || isLoading}>
					Save patterns
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 text-xs text-muted-foreground"
					disabled={isLoading}
					onClick={() => {
						setDraft(null);
						setPatterns.mutate({
							patterns: DEFAULT_FILE_TREE_HIDDEN_PATTERNS,
						});
					}}
				>
					<RotateCcw className="size-3.5" />
					Reset to defaults
				</Button>
			</div>
		</section>
	);
}
