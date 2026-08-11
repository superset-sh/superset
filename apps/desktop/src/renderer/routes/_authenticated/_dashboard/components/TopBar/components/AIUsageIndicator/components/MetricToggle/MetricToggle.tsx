export function MetricToggle({
	label,
	description,
	active,
	onClick,
}: {
	label: string;
	description: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			aria-label={description}
			title={description}
			onClick={onClick}
			className="rounded border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground aria-pressed:bg-foreground/[0.08] aria-pressed:text-foreground"
		>
			{label}
		</button>
	);
}
