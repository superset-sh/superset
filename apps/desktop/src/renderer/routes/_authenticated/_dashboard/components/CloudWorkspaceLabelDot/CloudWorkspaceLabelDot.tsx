import { cn } from "@superset/ui/utils";

interface CloudWorkspaceLabelDotProps {
	color: string | null;
}

export function CloudWorkspaceLabelDot({ color }: CloudWorkspaceLabelDotProps) {
	return (
		<span
			className={cn(
				"inline-block size-2 shrink-0 rounded-full",
				!color && "bg-muted-foreground/50",
			)}
			style={color ? { backgroundColor: color } : undefined}
		/>
	);
}
