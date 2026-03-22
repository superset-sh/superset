interface FileMentionChipProps {
	relativePath: string;
	disabled?: boolean;
	onClick: () => void;
}

export function FileMentionChip({
	relativePath,
	disabled,
	onClick,
}: FileMentionChipProps) {
	return (
		<button
			type="button"
			className="mx-0.5 inline-flex items-center gap-0.5 rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-xs text-primary transition-colors hover:bg-primary/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default disabled:opacity-60"
			onClick={onClick}
			disabled={disabled}
			aria-label={`Open file ${relativePath}`}
		>
			<span className="font-semibold text-primary">@</span>
			<span className="text-primary/95">{relativePath}</span>
		</button>
	);
}
