"use client";

import { DOWNLOAD_URL_MAC_ARM64 } from "@superset/shared/constants";
import { Download } from "lucide-react";
import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiMiniClock } from "react-icons/hi2";
import { usePlatform } from "../../hooks/useOS";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";

interface HeaderCTAProps {
	isLoggedIn: boolean;
	dashboardUrl: string;
}

export function HeaderCTA({ isLoggedIn, dashboardUrl }: HeaderCTAProps) {
	const { os, isMobile } = usePlatform();
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
	const portalRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		portalRef.current = document.body;
	}, []);

	const showDownload = !isMobile && (os === "macos" || os === "unknown");

	const dashboardLink = isLoggedIn && (
		<a
			href={dashboardUrl}
			className="px-4 py-2 text-sm font-normal text-muted-foreground hover:text-foreground transition-colors text-center"
		>
			Dashboard
		</a>
	);

	const waitlistModal = portalRef.current
		? createPortal(
				<WaitlistModal
					isOpen={isWaitlistOpen}
					onClose={() => setIsWaitlistOpen(false)}
				/>,
				portalRef.current,
			)
		: null;

	if (isMobile) {
		return (
			<>
				{dashboardLink}
				<DownloadButton
					size="sm"
					onJoinWaitlist={() => setIsWaitlistOpen(true)}
				/>
				{waitlistModal}
			</>
		);
	}

	return (
		<>
			{dashboardLink}
			{showDownload ? (
				<a
					href={DOWNLOAD_URL_MAC_ARM64}
					className="px-4 py-2 text-sm font-normal bg-foreground text-background hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
					onClick={() => posthog.capture("download_clicked")}
				>
					Download for macOS
					<Download className="size-4" aria-hidden="true" />
				</a>
			) : (
				<button
					type="button"
					className="px-4 py-2 text-sm font-normal bg-foreground text-background hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
					onClick={() => {
						posthog.capture("waitlist_clicked");
						setIsWaitlistOpen(true);
					}}
				>
					Join Waitlist
					<HiMiniClock className="size-4" aria-hidden="true" />
				</button>
			)}
			{waitlistModal}
		</>
	);
}
