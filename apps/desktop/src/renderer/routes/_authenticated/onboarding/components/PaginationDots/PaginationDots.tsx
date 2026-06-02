import { cn } from "@superset/ui/utils";

interface PaginationDotsProps {
	current: number;
	total: number;
}

export function PaginationDots({ current, total }: PaginationDotsProps) {
	const dots = Array.from({ length: total }, (_, i) => `dot-${i}`);
	return (
		<div className="flex items-center gap-1.5">
			{dots.map((id, i) => (
				<span
					key={id}
					aria-hidden
					className={cn(
						"size-1.5 rounded-full transition-colors",
						i === current ? "bg-foreground" : "bg-muted-foreground/30",
					)}
				/>
			))}
		</div>
	);
}
