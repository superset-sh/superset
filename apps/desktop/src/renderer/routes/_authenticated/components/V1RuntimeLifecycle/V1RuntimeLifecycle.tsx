import { useEffect } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import {
	useIsV1FlipLocked,
	useIsV2CloudEnabled,
} from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { isV1MigrationCompleteAtBoot } from "renderer/lib/v1-migration/completion";

/** Tell main when the next-launch migration lock has actually taken effect. */
export function V1RuntimeLifecycle() {
	const organizationId = useActiveOrganizationId();
	const flipLocked = useIsV1FlipLocked();
	const v2Enabled = useIsV2CloudEnabled();
	const migratedAtBoot =
		flipLocked && isV1MigrationCompleteAtBoot(organizationId);

	useEffect(() => {
		if (!organizationId) return;
		let stopped = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const report = async () => {
			try {
				await electronTrpcClient.migration.reportV1Runtime.mutate({
					organizationId,
					migratedAtBoot,
					v2Enabled,
				});
			} catch (error) {
				console.warn("[v1-migration] runtime retirement will retry", error);
			}
			// Keep observing after success: another window can temporarily use v1
			// and close again. Main skips probes while retirement remains valid.
			// Also retries failed probes and multi-window vetoes.
			if (!stopped) timeout = setTimeout(report, 10_000);
		};
		void report();
		return () => {
			stopped = true;
			clearTimeout(timeout);
		};
	}, [organizationId, migratedAtBoot, v2Enabled]);
	return null;
}
