export function InfoRow({
	label,
	children,
}: {
	label: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-[8rem_1fr] items-start gap-4 py-2.5">
			<span className="text-sm text-muted-foreground">{label}</span>
			<span className="min-w-0 text-sm text-foreground">{children}</span>
		</div>
	);
}
