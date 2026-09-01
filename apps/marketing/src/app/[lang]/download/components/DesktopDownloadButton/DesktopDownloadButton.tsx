"use client";

import { Trans } from "@lingui/react/macro";
import { HiMiniArrowDownTray } from "react-icons/hi2";
import { Platform, usePlatform } from "@/app/[lang]/hooks/useOS";
import { track } from "@/lib/analytics";
import { desktopUrlFor, hasDesktopBuild } from "../../utils/desktopUrlFor";

// Platform names are identifiers, not prose
const BUTTON_PLATFORM_LABEL: Partial<Record<Platform, string>> = {
	[Platform.MacAppleSilicon]: "macOS",
	[Platform.MacIntel]: "macOS",
	[Platform.Linux]: "Linux",
};

interface DesktopDownloadButtonProps {
	className?: string;
}

export function DesktopDownloadButton({
	className = "",
}: DesktopDownloadButtonProps) {
	const { platform } = usePlatform();
	// Bound to a name so the Lingui macro emits a stable `{platformName}`
	// placeholder. An inline expression gets an auto-numbered one that shifts
	// whenever the JSX moves, stranding the extracted message.
	const platformName = BUTTON_PLATFORM_LABEL[platform] ?? "macOS";

	// Windows has no published build yet, and a phone can't run the app. Both
	// point at the platform table below rather than handing over a binary that
	// won't run.
	if (!hasDesktopBuild(platform)) {
		return (
			<a
				href="#all-downloads"
				className={`group inline-flex items-center gap-2 border border-border bg-background px-4 py-2.5 text-foreground text-sm transition-colors hover:bg-muted ${className}`}
			>
				<Trans id="marketing.download.seeAllDownloads">See all downloads</Trans>
				<HiMiniArrowDownTray className="size-4" />
			</a>
		);
	}

	return (
		<a
			href={desktopUrlFor(platform)}
			onClick={() => track("download_manual_clicked", { platform })}
			className={`group inline-flex items-center gap-2 bg-foreground px-4 py-2.5 text-background text-sm transition-colors hover:bg-brand hover:text-white ${className}`}
		>
			<Trans id="marketing.download.downloadFor">
				Download for {platformName}
			</Trans>
			{/* slide-through swap: arrow exits below while a clone drops in above */}
			<span className="relative size-4 overflow-hidden">
				<HiMiniArrowDownTray className="size-4 transition-transform duration-300 ease-out group-hover:translate-y-full" />
				<HiMiniArrowDownTray className="absolute inset-0 size-4 -translate-y-full transition-transform duration-300 ease-out group-hover:translate-y-0" />
			</span>
		</a>
	);
}
