"use client";

import { Trans } from "@lingui/react/macro";
import {
	DOWNLOAD_URL_MAC_ARM64,
	DOWNLOAD_URL_MAC_X64,
} from "@superset/shared/constants";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { SupersetLogo } from "@/app/[lang]/components/Header/components/SupersetLogo";
import { AppMockup } from "@/app/[lang]/components/HeroSection/components/AppMockup";
import { WaitlistForm } from "@/app/[lang]/components/WaitlistForm";
import { isMacPlatform, Platform, usePlatform } from "@/app/[lang]/hooks/useOS";
import { track } from "@/lib/analytics";
import { DownloadLinkForm } from "../DownloadLinkForm";

const AUTO_DOWNLOAD_DELAY_MS = 600;

function macUrlFor(platform: Platform): string {
	return platform === Platform.MacIntel
		? DOWNLOAD_URL_MAC_X64
		: DOWNLOAD_URL_MAC_ARM64;
}

export function DownloadInterstitial() {
	const { platform } = usePlatform();
	const firedRef = useRef(false);

	const isMac = isMacPlatform(platform);
	// Only auto-download on Mac (the only built binary). Mobile visitors can send
	// the link to their desktop; Windows/Linux visitors see the platform waitlist.
	const showEmailLink = platform === Platform.Mobile;
	const showWaitlist =
		!isMac && platform !== Platform.Unknown && !showEmailLink;

	useEffect(() => {
		if (firedRef.current) return;
		if (!isMac) return;

		firedRef.current = true;
		const url = macUrlFor(platform);
		track("download_started", { platform });

		window.setTimeout(() => {
			window.location.href = url;
		}, AUTO_DOWNLOAD_DELAY_MS);
	}, [isMac, platform]);

	return (
		<div className="relative isolate min-h-screen overflow-hidden bg-background px-6 py-10 sm:px-12 sm:py-14 lg:px-20 lg:py-20">
			<Link
				href="/"
				className="inline-flex items-center text-foreground transition-colors hover:text-foreground/80"
				aria-label="Superset"
			>
				<SupersetLogo />
			</Link>

			<div className="mt-20 grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
				<div className="flex flex-col gap-6">
					{showEmailLink ? (
						<>
							<h1
								className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl"
								style={{ fontFamily: "var(--font-ibm-plex-mono), monospace" }}
							>
								<Trans id="marketing.download.mobileTitle">
									Get Superset on your Mac
								</Trans>
							</h1>
							<p className="text-sm text-muted-foreground sm:text-base">
								<Trans id="marketing.download.mobileBody">
									Superset is a desktop app. Enter your email and we&apos;ll
									send you a download link to open on your Mac.
								</Trans>
							</p>
							<DownloadLinkForm />
						</>
					) : showWaitlist ? (
						<>
							<h1
								className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl"
								style={{ fontFamily: "var(--font-ibm-plex-mono), monospace" }}
							>
								<Trans id="marketing.download.waitlistTitle">
									Superset is Mac-only for now
								</Trans>
							</h1>
							<p className="text-sm text-muted-foreground sm:text-base">
								<Trans id="marketing.download.waitlistBody">
									We're bringing Superset to Windows &amp; Linux. Drop your
									email and we'll let you know the moment it's ready.
								</Trans>
							</p>
							<div className="max-w-sm">
								<WaitlistForm />
							</div>
						</>
					) : (
						<>
							<h1
								className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl"
								style={{ fontFamily: "var(--font-ibm-plex-mono), monospace" }}
							>
								<Trans id="marketing.download.autoTitle">
									You're about to get Superset
								</Trans>
							</h1>
							<p className="text-sm text-muted-foreground sm:text-base">
								<Trans id="marketing.download.autoBody">
									Your download will start automatically. If it didn't start,
									you can{" "}
									<a
										href={macUrlFor(platform)}
										onClick={() =>
											track("download_manual_clicked", { platform })
										}
										className="text-foreground underline underline-offset-4"
									>
										download now
									</a>
									.
								</Trans>
							</p>
						</>
					)}
				</div>

				<div
					aria-hidden="true"
					style={{
						maskImage:
							"linear-gradient(to right, transparent 0%, black 18%, black 100%)",
					}}
				>
					<AppMockup activeDemo="Orchestrate Parallel Agents" />
				</div>
			</div>
		</div>
	);
}
