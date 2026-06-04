import type { ReactNode } from "react";
import { SectionTitle } from "../SectionTitle";

export function Section({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3">
			<SectionTitle>{title}</SectionTitle>
			<div className="flex flex-col">{children}</div>
		</section>
	);
}
