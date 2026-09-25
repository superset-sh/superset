import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

/**
 * Shareable URL for an automation. Automations have no web UI, so the link
 * points at the web passthrough route (apps/web/src/app/automations) that
 * bounces back into the desktop app.
 */
function automationShareUrl(automationId: string): string {
	return `${env.NEXT_PUBLIC_WEB_URL}/automations/${automationId}`;
}

export function useCopyAutomationLink() {
	const { t } = useLingui();
	const { copyToClipboard } = useCopyToClipboard();

	return useCallback(
		(automationId: string) => {
			toast.promise(copyToClipboard(automationShareUrl(automationId)), {
				success: t({
					message: "Link copied",
				}),
				error: t({
					message: "Could not copy the link",
				}),
			});
		},
		[copyToClipboard, t],
	);
}
