import { cn } from "@superset/ui/utils";

interface DeviceOptionLabelProps {
	icon: React.ReactNode;
	label: string;
	count: number;
	isOnline?: boolean;
}

export function DeviceOptionLabel({
	icon,
	label,
	count,
	isOnline,
}: DeviceOptionLabelProps) {
	return (
		<span className="flex w-full min-w-0 items-center gap-2">
			{icon}
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{isOnline !== undefined ? (
				<span
					aria-hidden
					className={cn(
						"inline-block size-1.5 rounded-full",
						isOnline ? "bg-emerald-500" : "bg-muted-foreground/40",
					)}
				/>
			) : null}
			<span className="tabular-nums text-xs text-muted-foreground">
				{count}
			</span>
		</span>
	);
}
