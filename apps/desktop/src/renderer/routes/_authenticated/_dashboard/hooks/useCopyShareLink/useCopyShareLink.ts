import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

/**
 * Copies a web URL whose page (apps/web/src/app) bounces into the desktop
 * app, so the link renders in chat clients that won't show a `superset://` one.
 */
export function useCopyShareLink() {
	const { t } = useLingui();
	const { copyToClipboard } = useCopyToClipboard();

	return useCallback(
		(path: string) => {
			toast.promise(copyToClipboard(`${env.NEXT_PUBLIC_WEB_URL}/${path}`), {
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
