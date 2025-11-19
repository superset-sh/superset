import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@superset/ui/tooltip";
import { Circle } from "lucide-react";
import { useEffect, useState } from "react";
import type { Worktree } from "shared/types";

interface PortIndicatorProps {
	worktree: Worktree;
	workspaceId: string;
	isActive: boolean;
}

export function PortIndicator({
	worktree,
	workspaceId,
	isActive,
}: PortIndicatorProps) {
	const [proxyStatus, setProxyStatus] = useState<
		Array<{
			canonical: number;
			target?: number;
			service?: string;
			active: boolean;
		}>
	>([]);

	// Fetch proxy status periodically
	useEffect(() => {
		const fetchProxyStatus = async () => {
			try {
				const status = await window.ipcRenderer.invoke("proxy-get-status");
				setProxyStatus(status || []);
			} catch (error) {
				console.error("Failed to fetch proxy status:", error);
			}
		};

		// Initial fetch
		fetchProxyStatus();

		// Refresh every 3 seconds
		const interval = setInterval(fetchProxyStatus, 3000);

		return () => clearInterval(interval);
	}, []);

	// Get detected ports for this worktree
	const detectedPorts = worktree.detectedPorts || {};
	const hasDetectedPorts = Object.keys(detectedPorts).length > 0;

	// Get active proxy mappings for this worktree (if it's the active one)
	const activeProxies = isActive
		? proxyStatus.filter((p) => p.active && p.target)
		: [];

	if (!hasDetectedPorts && activeProxies.length === 0) {
		return null; // Don't show anything if no ports
	}

	return (
		<TooltipProvider delayDuration={700}>
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="flex items-center gap-1 text-xs">
						{isActive && activeProxies.length > 0 ? (
							<>
								<Circle size={8} className="fill-green-500 text-green-500" />
								<span className="text-green-500 font-medium">
									{activeProxies.map((p, i) => (
										<span key={p.canonical}>
											{i > 0 && ", "}:{p.canonical}→:{p.target}
											{p.service && ` (${p.service})`}
										</span>
									))}
								</span>
							</>
						) : hasDetectedPorts ? (
							<>
								<Circle size={8} className="fill-gray-500 text-gray-500" />
								<span className="text-gray-500">
									{Object.entries(detectedPorts)
										.map(([service, port]) => `${service}:${port}`)
										.join(", ")}
								</span>
							</>
						) : null}
					</div>
				</TooltipTrigger>
				<TooltipContent>
					{isActive && activeProxies.length > 0
						? "Port forwarded"
						: "Port detected"}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
