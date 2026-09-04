export function SectionHeader({
	label,
	count,
}: {
	label: React.ReactNode;
	count?: number;
}) {
	return (
		<div className="flex items-baseline gap-2 border-b border-border/60 pb-2">
			<h2 className="text-sm font-semibold text-foreground">{label}</h2>
			{count !== undefined && (
				<span className="text-sm text-muted-foreground">{count}</span>
			)}
		</div>
	);
}
