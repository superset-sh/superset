import { useEffect, useRef, useState } from "react";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import {
	consumeV1WelcomePending,
	isV1WelcomePending,
} from "renderer/lib/v1-migration/completion";
import { FlipNoticeCard } from "./components/FlipNoticeCard";

/**
 * Post-flip counterpart to V1FlipNotice: orients migrated users on their
 * first v2 boots. Armed at first gate completion, consumed only on dismiss
 * so it survives reloads until acknowledged. Never shows for v2-native
 * users or forced-flip machines (no completion → no flag).
 */
export function V2FlipWelcome() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const [visible, setVisible] = useState(false);
	const trackedRef = useRef(false);

	useEffect(() => {
		trackedRef.current = false;
		setVisible(!!organizationId && isV1WelcomePending(organizationId));
	}, [organizationId]);

	useEffect(() => {
		if (!visible || trackedRef.current) return;
		trackedRef.current = true;
		track("v2_flip_welcome_shown");
	}, [visible]);

	if (!visible || !organizationId) return null;

	const dismiss = () => {
		track("v2_flip_welcome_dismissed");
		consumeV1WelcomePending(organizationId);
		setVisible(false);
	};

	return (
		<FlipNoticeCard
			title="Welcome to the new Superset"
			body="Same Superset, upgraded. Everything came with you: projects and workspaces in the sidebar, and fresh terminals in each workspace's old folders."
			ctaLabel="Got it"
			onDismiss={dismiss}
		/>
	);
}
