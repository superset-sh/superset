import type { ReactNode } from "react";

interface PrincipleProps {
	number: string;
	title: ReactNode;
	children: ReactNode;
	link?: ReactNode;
}

export function Principle({ number, title, children, link }: PrincipleProps) {
	return (
		<div className="border-border border-t py-6 sm:border-t-0 sm:pr-6 sm:[&+&]:border-l sm:[&+&]:pl-6">
			<span className="font-mono text-[11px] text-brand-light">{number}</span>
			<h3 className="mt-3 mb-2 text-[17px] leading-6 font-[450] tracking-[-0.015em] text-foreground">
				{title}
			</h3>
			<p className="m-0 text-[15px] leading-[1.6] text-muted-foreground">
				{children}
			</p>
			{link}
		</div>
	);
}
