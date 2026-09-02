"use client";

import { Trans } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import {
	HiMiniArrowDownTray,
	HiMiniClock,
	HiMiniEnvelope,
} from "react-icons/hi2";
import { track } from "@/lib/analytics";
import { isMacPlatform, Platform, usePlatform } from "../../hooks/useOS";

interface DownloadButtonProps {
	size?: "sm" | "md";
	className?: string;
	onJoinWaitlist?: () => void;
}

const INTERSTITIAL_PATH = "/download";

export function DownloadButton({
	size = "md",
	className = "",
	onJoinWaitlist,
}: DownloadButtonProps) {
	const router = useRouter();
	const { platform } = usePlatform();

	const sizeClasses =
		size === "sm"
			? "px-3 sm:px-4 py-2 font-mono text-xs uppercase tracking-wider"
			: "px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base";

	const buttonClasses = `group bg-foreground text-background ${sizeClasses} font-normal transition-colors hover:bg-brand hover:text-white flex items-center gap-2 whitespace-nowrap shrink-0 ${className}`;

	// slide-through swap: arrow exits below while a clone drops in from above
	const downloadIcon = (
		<span className="relative size-4 overflow-hidden">
			<HiMiniArrowDownTray className="size-4 transition-transform duration-300 ease-out group-hover:translate-y-full" />
			<HiMiniArrowDownTray className="absolute inset-0 size-4 -translate-y-full transition-transform duration-300 ease-out group-hover:translate-y-0" />
		</span>
	);

	const goToInterstitial = () => {
		track("download_clicked");
		router.push(INTERSTITIAL_PATH);
	};

	if (platform === Platform.Mobile) {
		return (
			<button
				type="button"
				className={buttonClasses}
				onClick={goToInterstitial}
			>
				<Trans id="marketing.download.emailLink">Email me a link</Trans>
				<HiMiniEnvelope className="size-4" />
			</button>
		);
	}

	if (isMacPlatform(platform) || platform === Platform.Unknown) {
		return (
			<button
				type="button"
				className={buttonClasses}
				onClick={goToInterstitial}
			>
				<span className="hidden sm:inline">
					<Trans id="marketing.download.forMac">Download for macOS</Trans>
				</span>
				<span className="sm:hidden">
					<Trans id="marketing.download.short">Download</Trans>
				</span>
				{downloadIcon}
			</button>
		);
	}

	return (
		<button
			type="button"
			className={buttonClasses}
			onClick={() => {
				track("waitlist_clicked");
				onJoinWaitlist?.();
			}}
		>
			<Trans id="marketing.download.joinWaitlist">Join Waitlist</Trans>
			<HiMiniClock className="size-4" />
		</button>
	);
}
