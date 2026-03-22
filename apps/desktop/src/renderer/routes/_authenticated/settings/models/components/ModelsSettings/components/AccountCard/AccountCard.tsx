import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface AccountCardProps {
	title: string;
	subtitle: string;
	badge?: string;
	badgeVariant?: "secondary" | "outline" | "destructive";
	actions?: ReactNode;
	muted?: boolean;
}

export function AccountCard({
	title,
	subtitle,
	badge,
	badgeVariant = "secondary",
	actions,
	muted = false,
}: AccountCardProps) {
	return (
		<div
			className={cn(
				"rounded-xl border bg-card px-4 py-4",
				muted && "border-dashed bg-muted/20",
			)}
		>
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold">{title}</p>
					<p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
					{actions}
				</div>
			</div>
		</div>
	);
}
