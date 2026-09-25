interface ShowcaseSectionProps {
	id: string;
	index: string;
	title: string;
	description: string;
	children: React.ReactNode;
}

export function ShowcaseSection({
	id,
	index,
	title,
	description,
	children,
}: ShowcaseSectionProps) {
	return (
		<section id={id} className="scroll-mt-24">
			<div className="mb-6 flex items-baseline gap-3 border-b border-border pb-4">
				<span className="font-mono text-xs text-muted-foreground">{index}</span>
				<h2 className="text-lg font-medium tracking-tight text-foreground">
					{title}
				</h2>
				<p className="hidden text-sm text-muted-foreground sm:block">
					{description}
				</p>
			</div>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
		</section>
	);
}
