export function LeaderboardPanel({
	title,
	meta,
	children,
	className,
}: {
	title: React.ReactNode;
	meta?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section
			className={`rounded-[2px] border border-border bg-background p-5 ${className ?? ""}`}
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
				<h2 className="text-sm font-medium text-foreground">{title}</h2>
				{meta && <span className="text-xs text-muted-foreground">{meta}</span>}
			</div>
			{children}
		</section>
	);
}
