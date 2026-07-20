import { COMPANY } from "@superset/shared/constants";
import { ArrowUpRight } from "lucide-react";

interface ApplyCardProps {
	title: string;
	description: string;
	href?: string;
}

export function ApplyCard({
	title,
	description,
	href = COMPANY.CAREERS_URL,
}: ApplyCardProps) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="flex items-center gap-4 rounded-lg border border-dashed border-border p-4 no-underline transition-colors hover:border-foreground/30"
		>
			<span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-foreground">
				<ArrowUpRight className="size-5 text-background/70" />
			</span>

			<span className="flex flex-col gap-1">
				<span className="text-sm font-semibold text-foreground">{title}</span>
				<span className="text-sm text-muted-foreground">{description}</span>
			</span>
		</a>
	);
}
