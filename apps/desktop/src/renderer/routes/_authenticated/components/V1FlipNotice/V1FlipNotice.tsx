import { Button } from "@superset/ui/button";
import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import {
	isV1MigrationComplete,
	V1_MIGRATION_COMPLETED_EVENT,
} from "renderer/lib/v1-migration/completion";

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

	return (
		<div className="fixed right-4 bottom-4 z-50 w-96 select-text rounded-lg border bg-background p-4 shadow-lg">
			<div className="flex items-start gap-3">
				<Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
				<div className="min-w-0 space-y-1.5">
					<p className="font-medium text-sm">The new Superset is ready</p>
					<p className="text-muted-foreground text-sm">
						Your projects, workspaces, and terminals have been moved to the new
						Superset experience. The next time you open the app, you'll see the
						new interface. Terminal scrollback and v1 chat history don't carry
						over.
					</p>
					<div className="pt-1">
						<Button
							size="sm"
							variant="secondary"
							onClick={() => {
								track("v1_flip_notice_dismissed");
								setDismissed(true);
							}}
						>
							Got it
						</Button>
					</div>
				</div>
				<button
					type="button"
					aria-label="Dismiss"
					className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
					onClick={() => {
						track("v1_flip_notice_dismissed");
						setDismissed(true);
					}}
				>
					<X className="size-4" />
				</button>
			</div>
		</div>
	);
}
