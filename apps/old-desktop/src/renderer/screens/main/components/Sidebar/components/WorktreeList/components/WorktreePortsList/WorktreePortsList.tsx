import { Button } from "@superset/ui/button";
import { ExternalLink, Network } from "lucide-react";
import { useEffect, useState } from "react";
import type { Worktree } from "shared/types";

interface WorktreePortsListProps {
	worktree: Worktree;
	workspaceId: string;
}

interface ProxyStatus {
	canonical: number;
	target?: number;
	service?: string;
	active: boolean;
}

export function WorktreePortsList({
	worktree,
	workspaceId,
}: WorktreePortsListProps) {
	const [proxyStatus, setProxyStatus] = useState<ProxyStatus[]>([]);

	// Fetch proxy status
	useEffect(() => {
		const fetchProxyStatus = async () => {
			try {
				const status = await window.ipcRenderer.invoke("proxy-get-status");
				setProxyStatus(status || []);
			} catch (error) {
				console.error("Failed to fetch proxy status:", error);
			}
		};

		fetchProxyStatus();
		const interval = setInterval(fetchProxyStatus, 3000);
		return () => clearInterval(interval);
	}, []);

	const detectedPorts = worktree.detectedPorts || {};
	const portEntries = Object.entries(detectedPorts);

	if (portEntries.length === 0) {
		return null;
	}

	// Get active proxies
	const activeProxies = proxyStatus.filter((p) => p.active && p.target);
	const proxyMap = new Map(activeProxies.map((p) => [p.target, p.canonical]));

	const handleOpenPort = (port: number) => {
		const canonicalPort = proxyMap.get(port);
		const url = canonicalPort
			? `http://localhost:${canonicalPort}`
			: `http://localhost:${port}`;

		window.ipcRenderer.invoke("open-external", url);
	};

	return (
		<div className="ml-6 px-2 py-2 space-y-1">
			{portEntries.map(([service, port]) => {
				const canonicalPort = proxyMap.get(port);
				const isForwarded = canonicalPort !== undefined;

				return (
					<button
						key={`${service}-${port}`}
						type="button"
						onClick={() => handleOpenPort(port)}
						className="group flex items-center gap-2 w-full h-7 px-2 text-xs rounded-md hover:bg-neutral-800 transition-colors"
					>
						<Network size={12} className="text-gray-400" />
						<div className="flex-1 flex items-center gap-2 text-left">
							<span className="text-gray-300">{service}</span>
							<span className="text-gray-500 font-mono text-[10px]">
								{isForwarded ? (
									<>
										:{canonicalPort}→:{port}
									</>
								) : (
									<>:{port}</>
								)}
							</span>
						</div>
						<ExternalLink
							size={11}
							className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
						/>
					</button>
				);
			})}
		</div>
	);
}
