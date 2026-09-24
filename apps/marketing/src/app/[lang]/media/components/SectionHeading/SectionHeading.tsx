import type { ReactNode } from "react";

interface SectionHeadingProps {
	id: string;
	children: ReactNode;
}

export function SectionHeading({ id, children }: SectionHeadingProps) {
	return (
		<h2
			id={id}
			className="border-border border-b pb-3 font-mono text-muted-foreground text-xs uppercase tracking-wider"
		>
			{children}
		</h2>
	);
}
