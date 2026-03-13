import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuRotateCw,
	LuServer,
} from "react-icons/lu";

interface ServicesSectionProps {
	data:
		| {
				name: string;
				port: number;
				running: boolean;
				processAlive: boolean;
				uptimeSeconds: number | null;
				restartCommand: string;
		  }[]
		| undefined;
	isLoading: boolean;
	onRestart: (restartCommand: string) => void;
}

function formatUptime(seconds: number | null): string {
	if (seconds === null) return "";
	if (seconds < 60) return "< 1m";
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export function ServicesSection({
	data,
	isLoading,
	onRestart,
}: ServicesSectionProps) {
	const [collapsed, setCollapsed] = useState(false);

	return (
		<div className="overflow-hidden border-t border-border">
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className={cn(
					"flex w-full items-center gap-1.5 px-3 py-2",
					"text-xs font-medium uppercase tracking-wider text-muted-foreground",
					"hover:bg-accent/30 cursor-pointer transition-colors",
				)}
			>
				{collapsed ? (
					<LuChevronRight className="size-3 shrink-0" />
				) : (
					<LuChevronDown className="size-3 shrink-0" />
				)}
				<LuServer className="size-3 shrink-0" />
				<span>Services</span>
			</button>

			{!collapsed && (
				<div className="px-3 py-2 text-sm">
					{isLoading ? (
						<p className="text-muted-foreground">Loading...</p>
					) : !data || data.length === 0 ? (
						<p className="text-muted-foreground">No services detected</p>
					) : (
						<div className="space-y-1.5">
							{data.map((service) => (
								<div
									key={`${service.name}-${service.port}`}
									className="flex items-center gap-2"
								>
									<div
										className={cn(
											"size-2 rounded-full shrink-0",
											service.running
												? "bg-green-500"
												: service.processAlive
													? "bg-yellow-500"
													: "bg-red-500",
										)}
									/>
									<span className="truncate">{service.name}</span>
									<span className="text-muted-foreground shrink-0">
										({service.port})
									</span>
									{service.running && service.uptimeSeconds !== null && (
										<span className="text-muted-foreground text-xs ml-auto shrink-0">
											{formatUptime(service.uptimeSeconds)}
										</span>
									)}
									{!service.running && (
										<Button
											variant="ghost"
											size="icon"
											className="ml-auto size-6 shrink-0"
											onClick={() => onRestart(service.restartCommand)}
										>
											<LuRotateCw className="size-3" />
										</Button>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
