import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { getBrowserLogo } from "@superset/ui/icons/browser-icons";
import { XIcon } from "lucide-react";
import { TbDownload } from "react-icons/tb";

interface ChromeImportBannerProps {
	/** Stable browser key of the detected import source, e.g. "chrome". */
	browserKey: string;
	/** Display name of the detected import source, e.g. "Google Chrome". */
	browserName: string;
	onImport: () => void;
	onDismiss: () => void;
}

/** Offers importing history/logins from the detected Chromium browser —
 * shown above the page, not just on the empty new-tab state, so it isn't
 * missed once the user has already navigated. */
export function ChromeImportBanner({
	browserKey,
	browserName,
	onImport,
	onDismiss,
}: ChromeImportBannerProps) {
	const { t } = useLingui();
	const logo = getBrowserLogo(browserKey);
	return (
		// relative z-20: on the blank-page state (which can now show alongside
		// this banner) the empty-state placeholder is an inset-0 z-10 overlay —
		// without a higher z-index it would paint over the banner.
		<div className="relative z-20 flex shrink-0 items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-foreground/90">
			{logo ? (
				<img src={logo} alt="" className="size-3.5 shrink-0" />
			) : (
				<TbDownload className="size-3.5 shrink-0 text-muted-foreground" />
			)}
			<span className="min-w-0 flex-1 truncate">
				<Trans>
					Import your browsing history and logins from {browserName}
				</Trans>
			</span>
			<Button
				variant="outline"
				size="sm"
				className="h-6 shrink-0 px-2 text-xs"
				onClick={onImport}
			>
				<Trans>Import</Trans>
			</Button>
			<button
				type="button"
				onClick={onDismiss}
				aria-label={t({
					message: "Dismiss",
				})}
				className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
			>
				<XIcon className="size-3.5" />
			</button>
		</div>
	);
}
