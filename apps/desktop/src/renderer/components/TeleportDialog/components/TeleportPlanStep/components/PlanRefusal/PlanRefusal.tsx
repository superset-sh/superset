import { Trans } from "@lingui/react/macro";
import type { TeleportRefusal } from "@superset/shared/teleport";

interface PlanRefusalProps {
	refusal: TeleportRefusal;
	hostName: string;
}

/**
 * Why the move cannot happen, and what to do instead.
 *
 * Both refusals are recoverable by the user in about ten seconds, so each
 * one says which action would clear it. A refusal that only states the
 * problem makes the feature look broken rather than careful.
 */
export function PlanRefusal({ refusal, hostName }: PlanRefusalProps) {
	return (
		<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
			{refusal.kind === "branch-checked-out" ? (
				<>
					<p className="font-medium">
						<Trans>
							{refusal.branch} is already checked out on {hostName}.
						</Trans>
					</p>
					<p className="mt-1 text-muted-foreground text-xs">
						<Trans>
							Close or switch that workspace there, then try again. Its path is{" "}
							{refusal.path}.
						</Trans>
					</p>
				</>
			) : (
				<>
					<p className="font-medium">
						<Trans>
							{hostName} has commits on {refusal.branch} that this device
							doesn't.
						</Trans>
					</p>
					<p className="mt-1 text-muted-foreground text-xs">
						<Trans>
							Teleporting would bury them. Pull from {hostName} first, or
							teleport in the other direction.
						</Trans>
					</p>
				</>
			)}
		</div>
	);
}
