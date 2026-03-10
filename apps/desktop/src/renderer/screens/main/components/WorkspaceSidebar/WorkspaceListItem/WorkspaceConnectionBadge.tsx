import { cn } from "@superset/ui/utils";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface WorkspaceConnectionBadgeProps {
	sshHostId: string;
	className?: string;
}

export function WorkspaceConnectionBadge({
	sshHostId,
	className,
}: WorkspaceConnectionBadgeProps) {
	const { data } = electronTrpc.sshHosts.getConnectionStatus.useQuery({
		id: sshHostId,
	});

	const isConnected = data?.state === "connected";

	return (
		<span
			className={cn(
				"flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] leading-none shrink-0",
				isConnected ? "bg-emerald-500/10" : "bg-destructive/10",
				className,
			)}
		>
			<span
				className={cn(
					"inline-flex size-1.5 rounded-full",
					isConnected ? "bg-emerald-500" : "bg-destructive",
				)}
			/>
			<span
				className={cn(
					"font-mono tabular-nums leading-none",
					isConnected ? "text-emerald-500" : "text-destructive",
				)}
			>
				SSH
			</span>
		</span>
	);
}
