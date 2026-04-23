import { cn } from "@superset/ui/lib/utils";
import type { ComponentType } from "react";

const VARIANT_CLASSES = {
	default: "",
	success: "text-emerald-500",
	danger: "text-destructive",
} as const;

export type ToolStatusBadgeVariant = keyof typeof VARIANT_CLASSES;

interface ToolStatusBadgeProps {
	icon: ComponentType<{ className?: string }>;
	label: string;
	variant?: ToolStatusBadgeVariant;
}

export function ToolStatusBadge({
	icon: Icon,
	label,
	variant = "default",
}: ToolStatusBadgeProps) {
	return (
		<span
			className={cn(
				"ml-2 flex items-center gap-1 font-medium uppercase tracking-wide",
				VARIANT_CLASSES[variant],
			)}
		>
			<Icon className="h-3 w-3 shrink-0" />
			{label}
		</span>
	);
}
