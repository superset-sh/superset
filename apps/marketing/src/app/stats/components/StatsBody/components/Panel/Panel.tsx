export function Panel({
	title,
	meta,
	children,
	className,
}: {
	title: string;
	meta?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={`border border-border p-5 ${className ?? ""}`}>
			<div className="flex items-baseline justify-between gap-4 mb-4">
				<h2 className="font-mono text-[0.68rem] uppercase tracking-[0.11em] text-muted-foreground">
					{title}
				</h2>
				{meta && (
					<span className="font-mono text-[0.62rem] uppercase tracking-[0.11em] text-muted-foreground/70">
						{meta}
					</span>
				)}
			</div>
			{children}
		</section>
	);
}
