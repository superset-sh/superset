import { msg } from "@lingui/core/macro";
import { useLingui as useTranslation } from "@lingui/react";
import { useEffect, useRef, useState } from "react";
import { track } from "renderer/lib/analytics";
import {
	consumeV1WelcomePending,
	isV1WelcomePending,
} from "renderer/lib/v1-migration/completion";
import {
	isStatusCardVisible,
	useV1MigrationStatusStore,
} from "renderer/stores/v1-migration-status";
import { FlipNoticeCard } from "./components/FlipNoticeCard";

/**
 * Post-flip counterpart to V1FlipNotice: orients migrated users on their
 * first v2 boots. Armed at first gate completion, consumed only on dismiss
 * so it survives reloads until acknowledged. Never shows for v2-native
 * users or forced-flip machines (no completion → no flag).
 */
export function V2FlipWelcome({ organizationId }: { organizationId: string }) {
	const { _: translate } = useTranslation();
	const [pending, setPending] = useState(false);
	const statusCardShowing = useV1MigrationStatusStore((state) =>
		isStatusCardVisible(state, organizationId),
	);
	const visible = pending && !statusCardShowing;
	const trackedRef = useRef(false);

	useEffect(() => {
		trackedRef.current = false;
		setPending(isV1WelcomePending(organizationId));
	}, [organizationId]);

	useEffect(() => {
		if (!visible || trackedRef.current) return;
		trackedRef.current = true;
		track("v2_flip_welcome_shown");
	}, [visible]);

	if (!visible) return null;

	const dismiss = () => {
		track("v2_flip_welcome_dismissed");
		consumeV1WelcomePending(organizationId);
		setPending(false);
	};

	return (
		<FlipNoticeCard
			title={translate(msg({ message: "Welcome to the new Superset" }))}
			body="Same Superset, upgraded. Everything came with you: projects and workspaces in the sidebar, and fresh terminals in each workspace's old folders."
			ctaLabel="Got it"
			onDismiss={dismiss}
		/>
	);
}
