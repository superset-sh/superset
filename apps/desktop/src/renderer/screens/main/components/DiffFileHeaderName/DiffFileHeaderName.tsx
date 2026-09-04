import { splitPath } from "./utils/splitPath";

interface DiffFileHeaderNameProps {
	path: string;
}

/**
 * Filename-first header title for card-styled diffs: the name in the
 * foreground color, then the containing directory trailing off in the muted
 * color. Pierre's own header renders the full relative path as one string
 * (data-title); diffCardUnsafeCss hides that native title and surfaces this
 * split through renderHeaderFilenameSuffix instead, which sits right after
 * it in the DOM so the slot order is unchanged.
 */
export function DiffFileHeaderName({ path }: DiffFileHeaderNameProps) {
	const { dir, name } = splitPath(path);
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<span className="shrink-0 text-foreground">{name}</span>
			{dir && (
				<span className="min-w-0 truncate text-muted-foreground/70" title={dir}>
					{dir}
				</span>
			)}
		</span>
	);
}
