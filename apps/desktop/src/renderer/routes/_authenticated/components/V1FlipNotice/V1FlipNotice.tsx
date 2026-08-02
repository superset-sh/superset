import { useEffect, useRef, useState } from "react";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import {
	isV1MigrationComplete,
	V1_MIGRATION_COMPLETED_EVENT,
} from "renderer/lib/v1-migration/completion";
import { FlipNoticeCard } from "./components/FlipNoticeCard";

/**
 * One-time heads-up shown on the v1 surface only once this machine is
 * actually going to flip: the migration completed for the active org
 * (completion marker written, D5 makes the flip unconditional), so the very
 * next launch lands on v2. Precise by construction — flag-excluded users,
 * unflagged users, and machines whose gate never completes never see it.
 * Lifetime is naturally the rest of this session: after relaunch the v1
 * surface (and this component) no longer renders.
 */
export function V1FlipNotice() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const [complete, setComplete] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const trackedRef = useRef(false);

	useEffect(() => {
		if (!organizationId) return;
		setDismissed(false);
		trackedRef.current = false;
		const check = () => setComplete(isV1MigrationComplete(organizationId));
		check();
		window.addEventListener(V1_MIGRATION_COMPLETED_EVENT, check);
		return () =>
			window.removeEventListener(V1_MIGRATION_COMPLETED_EVENT, check);
	}, [organizationId]);

	const visible = !!organizationId && complete && !dismissed;

	useEffect(() => {
		if (!visible || trackedRef.current) return;
		trackedRef.current = true;
		track("v1_flip_notice_shown");
	}, [visible]);

	if (!visible) return null;

	const dismiss = () => {
		track("v1_flip_notice_dismissed");
		setDismissed(true);
	};

	return (
		<FlipNoticeCard
			title="A better Superset is ready"
			body="Superset has been upgraded: faster, cleaner, and built around your projects. Next launch opens the new interface, and everything you have comes along."
			ctaLabel="Got it"
			onDismiss={dismiss}
		/>
	);
}
