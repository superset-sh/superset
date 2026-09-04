import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { PortForward } from "shared/types";

interface PortForwardBusyActionsProps {
	forward: PortForward;
}

const BUTTON_CLASS =
	"shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-fill-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

/**
 * A remote port whose local port number is taken. The user picks: stop the
 * local process (only when Superset started it) or forward to another port.
 * Nothing here runs on its own — a silent remap would break apps that talk to
 * each other by port number.
 */
export function PortForwardBusyActions({
	forward,
}: PortForwardBusyActionsProps) {
	const { t } = useLingui();
	const killLocal = electronTrpc.portForwards.killLocalOwner.useMutation({
		onSuccess: (result) => {
			if (!result.success)
				toast.error(
					result.error ??
						t({
							message: "Could not stop it",
						}),
				);
		},
	});
	const retry = electronTrpc.portForwards.retryEphemeral.useMutation();
	if (forward.status.state !== "busy") return null;
	const owner = forward.status.localOwner;
	const pending = killLocal.isPending || retry.isPending;

	return (
		<span className="flex shrink-0 items-center gap-1">
			{owner && (
				<button
					type="button"
					disabled={pending}
					onClick={(e) => {
						e.stopPropagation();
						killLocal.mutate({ id: forward.id });
					}}
					className={BUTTON_CLASS}
				>
					<Trans>Stop local {owner.processName}</Trans>
				</button>
			)}
			<button
				type="button"
				disabled={pending}
				onClick={(e) => {
					e.stopPropagation();
					retry.mutate({ id: forward.id });
				}}
				className={BUTTON_CLASS}
			>
				<Trans>Use another port</Trans>
			</button>
		</span>
	);
}
