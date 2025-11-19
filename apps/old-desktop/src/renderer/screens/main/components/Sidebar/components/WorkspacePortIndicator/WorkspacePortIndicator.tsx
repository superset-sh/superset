import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@superset/ui/tooltip";
import { Circle } from "lucide-react";
import { useEffect, useState } from "react";
import type { Workspace } from "shared/types";

interface WorkspacePortIndicatorProps {
	workspace: Workspace;
}

export function WorkspacePortIndicator({
	workspace,
}: WorkspacePortIndicatorProps) {
	const [proxyStatus, setProxyStatus] = useState<
		Array<{
			canonical: number;
			target?: number;
			service?: string;
			active: boolean;
		}>
	>([]);

	// Check if workspace has port forwarding configured
	const hasPortForwarding = workspace.ports && workspace.ports.length > 0;

	if (!hasPortForwarding) {
		return null;
	}

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

	// Get active proxy mappings
	const activeProxies = proxyStatus.filter((p) => p.active && p.target);

	// Count total detected ports across all worktrees
	const totalDetectedPorts = workspace.worktrees.reduce((sum, worktree) => {
		const detectedPorts = worktree.detectedPorts || {};
		return sum + Object.keys(detectedPorts).length;
	}, 0);

	const hasActiveProxies = activeProxies.length > 0;
	const hasDetectedPorts = totalDetectedPorts > 0;

	if (!hasActiveProxies && !hasDetectedPorts) {
		return null;
	}

	return (
		<TooltipProvider delayDuration={700}>
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="flex items-center gap-1 text-xs">
						{hasActiveProxies ? (
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
									{totalDetectedPorts} port{totalDetectedPorts > 1 ? "s" : ""}{" "}
									detected
								</span>
							</>
						) : null}
					</div>
				</TooltipTrigger>
				<TooltipContent>
					{hasActiveProxies ? "Port forwarded" : "Port detected"}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
