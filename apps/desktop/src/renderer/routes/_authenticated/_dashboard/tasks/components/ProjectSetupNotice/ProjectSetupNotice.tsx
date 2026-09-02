import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface ProjectSetupNoticeProps {
	projectId: string;
	/** The launch target; null falls back to the local machine. */
	hostId: string | null;
	/** Close the owning popover before leaving the page. */
	onBeforeNavigate?: () => void;
}

/**
 * Inline escape hatch for the "project not set up on this host" blocker:
 * deep-links into the settings setup modal instead of leaving the user
 * with a disabled button and a toast.
 */
export function ProjectSetupNotice({
	projectId,
	hostId,
	onBeforeNavigate,
}: ProjectSetupNoticeProps) {
	const navigate = useNavigate();
	const { machineId } = useLocalHostService();
	return (
		<div className="mb-2 flex items-center justify-between gap-2">
			<p className="text-xs text-muted-foreground">
				<Trans id="tasks.projectSetupNotice.notSetUp">
					Not set up on this host.
				</Trans>
			</p>
			<Button
				type="button"
				variant="link"
				size="sm"
				className="h-auto shrink-0 p-0 text-xs text-amber-500"
				onClick={() => {
					onBeforeNavigate?.();
					void navigate({
						to: "/settings/projects/$projectId",
						params: { projectId },
						search: {
							hostId: hostId ?? machineId ?? undefined,
							focus: "setup",
						},
					});
				}}
			>
				<Trans id="tasks.projectSetupNotice.setUp">Set up project…</Trans>
			</Button>
		</div>
	);
}
