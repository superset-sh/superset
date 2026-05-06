import { cn } from "@superset/ui/utils";

interface HostHeaderProps {
	name: string;
	isOnline: boolean;
	machineId: string;
}

export function HostHeader({ name, isOnline, machineId }: HostHeaderProps) {
	return (
		<div className="mb-8">
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"size-2 rounded-full",
						isOnline ? "bg-emerald-500" : "bg-muted-foreground/40",
					)}
				/>
				<h2 className="text-xl font-semibold">{name}</h2>
			</div>
			<p className="text-sm text-muted-foreground mt-1">
				{isOnline ? "Online" : "Offline"} ·{" "}
				<span className="font-mono">{machineId}</span>
			</p>
		</div>
	);
}
