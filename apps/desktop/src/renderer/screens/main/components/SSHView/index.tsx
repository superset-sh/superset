import { Server, X } from "lucide-react";
import { useCallback } from "react";
import { trpc } from "renderer/lib/trpc";
import { SSHTerminal } from "./SSHTerminal";

interface SSHViewProps {
	connectionId: string;
	onDisconnect: () => void;
}

export function SSHView({ connectionId, onDisconnect }: SSHViewProps) {
	const { data: connection } = trpc.ssh.getConnection.useQuery({
		id: connectionId,
	});
	const { data: isConnected = false } = trpc.ssh.isConnected.useQuery(
		{ connectionId },
		{ refetchInterval: 5000 },
	);
	const disconnect = trpc.ssh.disconnect.useMutation();

	const handleDisconnect = useCallback(() => {
		disconnect.mutate({ connectionId });
		onDisconnect();
	}, [connectionId, disconnect, onDisconnect]);

	if (!connection) {
		return (
			<div className="flex flex-1 items-center justify-center bg-background">
				<div className="text-muted-foreground">Loading connection...</div>
			</div>
		);
	}

	const connectionName =
		connection.name || `${connection.username}@${connection.host}`;

	return (
		<div className="flex flex-1 flex-col bg-tertiary">
			{/* SSH Header */}
			<div className="flex items-center justify-between px-4 py-2 bg-background border-b border-border">
				<div className="flex items-center gap-2">
					<Server className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm font-medium text-foreground">
						{connectionName}
					</span>
					<span
						className={`px-2 py-0.5 rounded text-xs ${
							isConnected
								? "bg-green-500/10 text-green-500"
								: "bg-red-500/10 text-red-500"
						}`}
					>
						{isConnected ? "Connected" : "Disconnected"}
					</span>
				</div>
				<button
					type="button"
					onClick={handleDisconnect}
					className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
				>
					<X className="h-3 w-3" />
					Disconnect
				</button>
			</div>

			{/* SSH Terminal */}
			<div className="flex-1 m-3 bg-background rounded overflow-hidden">
				<SSHTerminal
					tabId={`ssh-${connectionId}`}
					connectionId={connectionId}
					connectionName={connectionName}
					isFocused={true}
				/>
			</div>
		</div>
	);
}
