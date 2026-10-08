import type { ReactNode } from "react";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function SystemLine({
	children,
	tone = "muted",
}: {
	children: ReactNode;
	tone?: "muted" | "error";
}) {
	return (
		<Text
			className={cn(
				"self-center px-8 py-1 text-center text-[11px] font-medium",
				tone === "error" ? "text-destructive" : "text-muted-foreground/80",
			)}
			numberOfLines={3}
		>
			{children}
		</Text>
	);
}
