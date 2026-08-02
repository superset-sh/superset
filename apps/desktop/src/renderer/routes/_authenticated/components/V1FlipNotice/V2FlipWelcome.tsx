import { Button } from "@superset/ui/button";
import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import {
	consumeV1WelcomePending,
	isV1WelcomePending,
} from "renderer/lib/v1-migration/completion";

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
		<div className="fixed right-4 bottom-4 z-50 w-96 select-text rounded-lg border bg-background p-4 shadow-lg">
			<div className="flex items-start gap-3">
				<Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
				<div className="min-w-0 space-y-1.5">
					<p className="font-medium text-sm">Welcome to the new Superset</p>
					<p className="text-muted-foreground text-sm">
						Everything came with you: your projects and workspaces are in the
						sidebar, and each workspace's terminals reopen in their old folders
						when you open it. If anything looks missing, Settings → Experimental
						→ Import from v1 can bring it over.
					</p>
					<div className="pt-1">
						<Button size="sm" variant="secondary" onClick={dismiss}>
							Got it
						</Button>
					</div>
				</div>
				<button
					type="button"
					aria-label="Dismiss"
					className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
					onClick={dismiss}
				>
					<X className="size-4" />
				</button>
			</div>
		</div>
	);
}
