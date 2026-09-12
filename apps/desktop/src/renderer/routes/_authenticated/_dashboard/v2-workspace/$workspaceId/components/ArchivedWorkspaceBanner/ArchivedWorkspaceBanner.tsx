import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatRelativeTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiMiniArchiveBox } from "react-icons/hi2";
import { useShelveWorkspace } from "renderer/hooks/host-service/useShelveWorkspace";

interface ArchivedWorkspaceBannerProps {
	workspaceId: string;
	workspaceName: string;
	/** Epoch ms its host will purge it. */
	deleteAt: number;
	/** Its host is blocked from purging it, so `deleteAt` can be in the past. */
	isPaused: boolean;
	/** Why the host paused the purge: "dirty" (uncommitted changes) or "unverifiable". */
	pauseReason: string | null;
}

/**
 * Opening an archived workspace never restores it (restoring is always
 * explicit), so the route says so up front: what state it is in, how long it
 * has left, and the one control that gets it back.
 */
export function ArchivedWorkspaceBanner({
	workspaceId,
	workspaceName,
	deleteAt,
	isPaused,
	pauseReason,
}: ArchivedWorkspaceBannerProps) {
	const { t } = useLingui();
	const { unshelve } = useShelveWorkspace(workspaceId);
	const [isRestoring, setIsRestoring] = useState(false);

	const message = isPaused
		? pauseReason === "dirty"
			? t({
					message:
						"This workspace is archived · deletion paused: uncommitted changes",
				})
			: t({
					message:
						"This workspace is archived · deletion paused: couldn't verify the worktree",
				})
		: deleteAt <= Date.now()
			? t({ message: "This workspace is archived · deletes soon" })
			: t({
					message: `This workspace is archived · deletes ${formatRelativeTime(deleteAt)}`,
				});

	const restore = async () => {
		setIsRestoring(true);
		try {
			await unshelve();
			toast.success(t({ message: `Restored "${workspaceName}" from archive` }));
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setIsRestoring(false);
		}
	};

	return (
		<div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
			<HiMiniArchiveBox className="size-4 shrink-0" />
			<span className="min-w-0 flex-1 truncate">{message}</span>
			<Button
				size="sm"
				variant="outline"
				disabled={isRestoring}
				onClick={() => void restore()}
			>
				{t({ message: "Restore" })}
			</Button>
		</div>
	);
}
