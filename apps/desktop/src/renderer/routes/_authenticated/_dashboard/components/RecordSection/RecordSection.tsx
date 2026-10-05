import type { ReactNode } from "react";

interface RecordSectionProps {
	title: ReactNode;
	children: ReactNode;
}

export function RecordSection({ title, children }: RecordSectionProps) {
	return (
		<section className="mt-10 max-w-[760px]">
			<h2 className="mb-3 text-[15px] font-semibold text-foreground">
				{title}
			</h2>
			{children}
		</section>
	);
}
