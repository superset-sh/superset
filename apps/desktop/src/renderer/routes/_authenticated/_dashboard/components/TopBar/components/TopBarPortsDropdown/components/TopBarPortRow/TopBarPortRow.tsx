import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { LuCopy, LuExternalLink, LuLoaderCircle, LuX } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useDashboardSidebarPortKill } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPort } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortsData";
import { usePortOpenActions } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/usePortOpenActions";
import { usePortForward } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/PortForwardsProvider";
import { formatPortRowLabel } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/utils/formatPortRowLabel";
import { PortForwardBusyActions } from "renderer/routes/_authenticated/_dashboard/components/PortForwardBusyActions";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";

interface TopBarPortRowProps {
	port: DashboardSidebarPort;
	// Close the dropdown after an action that moves focus elsewhere (opening
	// the port or jumping to its workspace).
	onNavigate: () => void;
}

/**
 * One port in the top-bar dropdown: a fixed mono port column, the label and
 * process, and a hover-revealed action cluster (open / copy / close).
 */
export function TopBarPortRow({ port, onNavigate }: TopBarPortRowProps) {
	const { t } = useLingui();
	const { isPending, killPort } = useDashboardSidebarPortKill();
	const { canOpenInBrowser, portUrl, openExternal, openPrimary } =
		usePortOpenActions(port);
	const { copyToClipboard } = useCopyToClipboard();
	const forward = usePortForward(port);
	const address = formatPortRowLabel({ port, forward });

	const description = [port.label, port.processName]
		.filter(Boolean)
		.join(" · ");

	const handleOpen = () => {
		openPrimary();
		onNavigate();
	};

	const handleOpenExternal = () => {
		openExternal();
		onNavigate();
	};

	// Only offered when `portUrl` reaches this machine: a local port, or a
	// remote one the main process forwards.
	const handleCopy = async () => {
		try {
			await copyToClipboard(portUrl);
			toast.success(
				t({
					message: `Copied ${portUrl.replace(/^https?:\/\//, "")}`,
				}),
			);
		} catch {
			toast.error(
				t({
					message: "Failed to copy to clipboard",
				}),
			);
		}
	};

	const handleClose = () => {
		if (isPending) return;
		void killPort(port);
	};

	return (
		<div
			className={cn(
				"group/port relative rounded-md transition-colors hover:bg-fill-hover",
				isPending && "opacity-60",
			)}
		>
			<button
				type="button"
				onClick={handleOpen}
				disabled={isPending}
				className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<span className="font-medium font-mono text-foreground text-xs tabular-nums">
					:{port.port}
				</span>
				<span
					className="truncate text-[11px] text-muted-foreground"
					title={address.title}
				>
					{description ? `${description} · ${address.text}` : address.text}
				</span>
			</button>
			{forward?.status.state === "busy" && (
				<div className="px-2 pb-1.5">
					<PortForwardBusyActions forward={forward} />
				</div>
			)}
			<div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-px rounded-md border border-border bg-popover/95 p-px opacity-0 transition-opacity focus-within:opacity-100 group-hover/port:opacity-100">
				{canOpenInBrowser && (
					<button
						type="button"
						aria-label={t({
							message: `Open localhost:${port.port} in external browser`,
						})}
						onClick={handleOpenExternal}
						className="rounded p-1 text-muted-foreground hover:bg-fill-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						<LuExternalLink className="size-3" strokeWidth={STROKE_WIDTH} />
					</button>
				)}
				{canOpenInBrowser && (
					<button
						type="button"
						aria-label={t({
							message: `Copy localhost:${port.port}`,
						})}
						onClick={() => void handleCopy()}
						className="rounded p-1 text-muted-foreground hover:bg-fill-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						<LuCopy className="size-3" strokeWidth={STROKE_WIDTH} />
					</button>
				)}
				<button
					type="button"
					aria-label={t({
						message: `Close port ${port.port}`,
					})}
					onClick={handleClose}
					disabled={isPending}
					className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					{isPending ? (
						<LuLoaderCircle
							className="size-3 animate-spin"
							strokeWidth={STROKE_WIDTH}
						/>
					) : (
						<LuX className="size-3" strokeWidth={STROKE_WIDTH} />
					)}
				</button>
			</div>
		</div>
	);
}
