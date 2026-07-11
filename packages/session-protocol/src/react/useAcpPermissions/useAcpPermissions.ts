import { useMemo } from "react";
import type { RequestPermissionOutcome } from "../../acp";
import type { RespondToPermissionResult } from "../../api";
import type { PendingPermission } from "../../state";
import type { UseAcpSessionResult } from "../useAcpSession";

export interface UseAcpPermissionsResult {
	/** Permission requests currently blocking the agent, oldest first. */
	pending: PendingPermission[];
	respond(
		requestId: string,
		outcome: RequestPermissionOutcome,
	): Promise<RespondToPermissionResult>;
	/** Answers with the request's first allow_once option. */
	allowOnce(requestId: string): Promise<RespondToPermissionResult>;
	/** Answers with the request's first reject_once option. */
	rejectOnce(requestId: string): Promise<RespondToPermissionResult>;
}

/**
 * Convenience selector over useAcpSession for permission UI: the blocking
 * requests plus answer helpers. For anything beyond one-shot allow/reject
 * (e.g. allow_always), render the request's `options` and call `respond`.
 */
export function useAcpPermissions(
	session: UseAcpSessionResult,
): UseAcpPermissionsResult {
	const pending = session.state?.pendingPermissions;
	const { respondToPermission } = session.actions;
	return useMemo(() => {
		const requests = pending ?? [];
		const respond = (requestId: string, outcome: RequestPermissionOutcome) =>
			respondToPermission(requestId, outcome);
		const respondByKind = (
			requestId: string,
			kind: "allow_once" | "reject_once",
		): Promise<RespondToPermissionResult> => {
			const request = requests.find((p) => p.requestId === requestId);
			const option = request?.options.find((o) => o.kind === kind);
			if (!option) {
				return Promise.reject(
					new Error(`no ${kind} option on permission request ${requestId}`),
				);
			}
			return respond(requestId, {
				outcome: "selected",
				optionId: option.optionId,
			});
		};
		return {
			pending: requests,
			respond,
			allowOnce: (requestId) => respondByKind(requestId, "allow_once"),
			rejectOnce: (requestId) => respondByKind(requestId, "reject_once"),
		};
	}, [pending, respondToPermission]);
}
