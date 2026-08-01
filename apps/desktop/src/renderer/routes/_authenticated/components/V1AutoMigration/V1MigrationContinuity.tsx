import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	isTerminalStatus,
	ledgerKey,
	loadV1MigrationLedger,
} from "renderer/lib/v1-migration";
import {
	consumeV1ContinuityPending,
	peekV1ContinuityPending,
} from "renderer/lib/v1-migration/completion";

/**
 * Continuity of place: on the FIRST v2 launch after the auto-migration
 * flipped this machine, open the ledger-mapped counterpart of the user's
 * last active v1 workspace instead of the dashboard. One-shot per org — the
 * flag is consumed only once the restore succeeded (or there is provably
 * nothing to restore), so a transient failure retries next boot.
 */
export function V1MigrationContinuity() {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const attemptedOrgsRef = useRef<Set<string>>(new Set());
	const organizationId = session?.session?.activeOrganizationId ?? null;

	useEffect(() => {
		if (!organizationId || attemptedOrgsRef.current.has(organizationId)) {
			return;
		}
		attemptedOrgsRef.current.add(organizationId);
		if (!peekV1ContinuityPending(organizationId)) return;

		void (async () => {
			try {
				const v1Settings =
					await electronTrpcClient.migration.readV1Settings.query();
				const lastActive = v1Settings?.lastActiveWorkspaceId;
				if (lastActive) {
					const ledger = await loadV1MigrationLedger(organizationId);
					const row = ledger.get(ledgerKey("workspace", lastActive));
					if (row && isTerminalStatus(row.status) && row.v2Id) {
						await navigate({
							to: "/v2-workspace/$workspaceId",
							params: { workspaceId: row.v2Id },
						});
					}
				}
				consumeV1ContinuityPending(organizationId);
			} catch (err) {
				// Flag stays set — retried next boot.
				console.error("[v1-migration] continuity restore failed", err);
			}
		})();
	}, [organizationId, navigate]);

	return null;
}
