import { memo, useCallback, useState, useSyncExternalStore } from "react";
import { browserRuntimeRegistry } from "../../browserRuntimeRegistry";

interface BrowserTabLabelProps {
	paneId: string;
	fallbackTitle: string;
}

function deriveDisplayTitle(
	pageTitle: string,
	currentUrl: string,
	fallbackTitle: string,
): string {
	if (pageTitle) return pageTitle;
	if (currentUrl && currentUrl !== "about:blank") {
		try {
			return new URL(currentUrl).hostname || fallbackTitle;
		} catch {
			return fallbackTitle;
		}
	}
	return fallbackTitle;
}

function BrowserTabLabelImpl({ paneId, fallbackTitle }: BrowserTabLabelProps) {
	const state = useSyncExternalStore(
		useCallback(
			(cb) => browserRuntimeRegistry.onStateChange(paneId, cb),
			[paneId],
		),
		useCallback(() => browserRuntimeRegistry.getState(paneId), [paneId]),
	);

	const [brokenFaviconUrl, setBrokenFaviconUrl] = useState<string | null>(null);
	const faviconUrl = state.faviconUrl;
	const showFavicon = !!faviconUrl && faviconUrl !== brokenFaviconUrl;

	const title = deriveDisplayTitle(
		state.pageTitle,
		state.currentUrl,
		fallbackTitle,
	);

	return (
		<span className="flex min-w-0 flex-1 items-center gap-1.5">
			{showFavicon && (
				<img
					src={faviconUrl ?? undefined}
					alt=""
					className="size-3.5 shrink-0"
					onError={() => setBrokenFaviconUrl(faviconUrl ?? null)}
				/>
			)}
			<span className="min-w-0 flex-1 truncate">{title}</span>
		</span>
	);
}

export const BrowserTabLabel = memo(BrowserTabLabelImpl);
