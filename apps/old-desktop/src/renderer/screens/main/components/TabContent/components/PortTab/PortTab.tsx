import { Button } from "@superset/ui/button";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { Tab, Worktree } from "shared/types";

interface PortTabProps {
	tab: Tab;
	worktree: Worktree;
	workspaceId: string;
}

interface ProxyStatus {
	canonical: number;
	target?: number;
	service?: string;
	active: boolean;
}

export function PortTab({ tab, worktree, workspaceId }: PortTabProps) {
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

	if (portEntries.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-gray-500">
				<p className="text-sm">No ports detected</p>
				<p className="text-xs mt-1">Start a dev server to see detected ports</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full p-4 overflow-auto">
			<div className="mb-4">
				<h2 className="text-lg font-semibold mb-1">Detected Ports</h2>
				<p className="text-xs text-gray-500">Click to open in your browser</p>
			</div>

			<div className="space-y-2">
				{portEntries.map(([service, port]) => {
					const canonicalPort = proxyMap.get(port);
					const isForwarded = canonicalPort !== undefined;

					return (
						<div
							key={`${service}-${port}`}
							className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
						>
							<div className="flex flex-col">
								<div className="flex items-center gap-2">
									<span className="font-medium">{service}</span>
									{isForwarded && (
										<span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
											Forwarded
										</span>
									)}
								</div>
								<div className="text-sm text-gray-600 mt-1">
									{isForwarded ? (
										<>
											<span className="font-mono">
												localhost:{canonicalPort}
											</span>
											<span className="text-gray-400 mx-1">→</span>
											<span className="font-mono">localhost:{port}</span>
										</>
									) : (
										<span className="font-mono">localhost:{port}</span>
									)}
								</div>
							</div>

							<Button
								size="sm"
								variant="outline"
								onClick={() => handleOpenPort(port)}
								className="flex items-center gap-2"
							>
								<ExternalLink size={14} />
								Open
							</Button>
						</div>
					);
				})}
			</div>

			{activeProxies.length > 0 && (
				<div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
					<p className="text-xs text-blue-800">
						<strong>Port Forwarding Active:</strong> Ports are accessible via
						canonical URLs for consistent development across worktrees.
					</p>
				</div>
			)}
		</div>
	);
}
