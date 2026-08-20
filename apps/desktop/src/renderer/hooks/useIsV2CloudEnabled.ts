import { isV2OnlyUser } from "@superset/shared/v2-only-user";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import {
	isV1ForcedFlipActive,
	isV1MigrationCompleteAtBoot,
} from "renderer/lib/v1-migration/completion";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

/**
 * True for accounts created on/after V2_ONLY_USER_CUTOFF — these users
 * default to v2.
 */
export function useIsV2OnlyUser(): boolean {
	const { data: session } = authClient.useSession();
	return isV2OnlyUser(session?.user?.createdAt);
}

/**
 * True when v2 is locked on for this machine (org migration completed, or
 * the forced-flip backstop is active). The optInV2 override has no effect in
 * either state, so surfaces offering the v1/v2 switch must hide it instead
 * of rendering a control that silently snaps back.
 */
export function useIsV1FlipLocked(): boolean {
	const { data: session } = authClient.useSession();
	return (
		isV1MigrationCompleteAtBoot(session?.session?.activeOrganizationId) ||
		isV1ForcedFlipActive()
	);
}

/** Returns whether v2 is currently active for this user. */
export function useIsV2CloudEnabled(): boolean {
	const v2Only = useIsV2OnlyUser();
	const optInV2 = useV2LocalOverrideStore((s) => s.optInV2);
	const { data: session } = authClient.useSession();
	// Migrate-then-flip: once this machine's v1 data has fully migrated for
	// the org, v2 wins — including over an explicit opt-out (D5, sunset).
	// Read is boot-stable, so completion mid-session flips the NEXT launch.
	if (isV1MigrationCompleteAtBoot(session?.session?.activeOrganizationId)) {
		return true;
	}
	// Backstop: past the forced-flip version, machines whose migration never
	// completed (persistently failing entities) flip anyway; the headless
	// migrator keeps retrying post-flip and manual import remains available.
	if (isV1ForcedFlipActive()) {
		return true;
	}
	// Dev builds default to v2; an explicit opt-out (optInV2 === false) still wins.
	return optInV2 ?? (v2Only || env.NODE_ENV === "development");
}
