import { HiDocument } from "react-icons/hi2";
import { useDiffColors } from "renderer/hooks/useDiffColors";
import type { DiffHeaderProps } from "../../types";

export function DiffHeader({
	filePath,
	additions,
	deletions,
	language,
}: DiffHeaderProps) {
	const colors = useDiffColors();

	return (
		<div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 sticky top-0 z-10">
			<div className="flex items-center gap-2 min-w-0">
				<HiDocument className="size-4 shrink-0 text-muted-foreground" />
				<span className="font-mono text-sm truncate">{filePath}</span>
				<span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
					{language}
				</span>
			</div>
			<div className="flex items-center gap-3 text-sm shrink-0">
				{additions > 0 && (
					<span style={{ color: colors.addedIndicator }}>+{additions}</span>
				)}
				{deletions > 0 && (
					<span style={{ color: colors.deletedIndicator }}>-{deletions}</span>
				)}
			</div>
		</div>
	);
}
