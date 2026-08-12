import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	DEFAULT_FILE_TREE_HIDDEN_PATTERNS,
	MAX_FILE_TREE_HIDDEN_PATTERN_LENGTH,
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
	const { data, isError, refetch } =
		electronTrpc.settings.getFileTreeHiddenPatterns.useQuery();
	// Never edit against an unknown list: saving an empty fallback would wipe
	// the stored patterns.
	const isUnavailable = isError || data === undefined;
	const setPatterns =
		electronTrpc.settings.setFileTreeHiddenPatterns.useMutation({
			onSuccess: () => {
				void utils.settings.getFileTreeHiddenPatterns.invalidate();
			},
			onError: (error) => toast.error(error.message),
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
		if (draft === null || isUnavailable) return;
		const patterns = toPatterns(draft);
		if (
			patterns.some(
				(pattern) => pattern.length > MAX_FILE_TREE_HIDDEN_PATTERN_LENGTH,
			)
		) {
			toast.error(
				`Patterns must be ${MAX_FILE_TREE_HIDDEN_PATTERN_LENGTH} characters or fewer`,
			);
			return;
		}
		setPatterns.mutate({ patterns });
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
				disabled={isUnavailable || setPatterns.isPending}
				value={value}
				onChange={(event) => setDraft(event.target.value)}
			/>

			{isError && (
				<div className="mt-2 flex items-center gap-2 text-xs text-destructive">
					<span>Could not load hidden file patterns.</span>
					<Button
						variant="outline"
						size="sm"
						className="h-7 text-xs"
						onClick={() => void refetch()}
					>
						Retry
					</Button>
				</div>
			)}

			<div className="mt-2 flex items-center gap-2">
				<Button
					size="sm"
					onClick={commit}
					disabled={!isDirty || isUnavailable || setPatterns.isPending}
				>
					Save patterns
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 text-xs text-muted-foreground"
					disabled={isUnavailable || setPatterns.isPending}
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
