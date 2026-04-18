"use client";

export type ClickableFilePathProps = {
	/** Full file path, used for the aria-label. */
	path: string;
	/** Display text. Defaults to the basename of `path`. */
	display?: string;
	/** When provided, renders as an interactive element that calls this on click. */
	onOpen?: () => void;
	className?: string;
};

/**
 * Displays a file path (or its basename) with a hover highlight when clickable.
 *
 * Uses `<span role="button">` so it safely nests inside a `<button>` element
 * (e.g. CollapsibleTrigger) without producing invalid HTML.
 * stopPropagation prevents the outer CollapsibleTrigger from toggling.
 */
export function ClickableFilePath({
	path,
	display,
	onOpen,
	className,
}: ClickableFilePathProps) {
	const label =
		display ?? (path.includes("/") ? path.split("/").pop() || path : path);

	if (!onOpen) {
		return <span className={className}>{label}</span>;
	}

	return (
		// biome-ignore lint/a11y/useSemanticElements: must be a span so it can safely nest inside a <button> (CollapsibleTrigger) — see component doc comment
		<span
			role="button"
			tabIndex={0}
			aria-label={`Open ${path} in file pane`}
			className={`cursor-pointer underline-offset-2 transition-colors hover:text-foreground hover:underline ${className ?? ""}`}
			onClick={(e) => {
				e.stopPropagation();
				onOpen();
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					e.stopPropagation();
					onOpen();
				}
			}}
		>
			{label}
		</span>
	);
}
