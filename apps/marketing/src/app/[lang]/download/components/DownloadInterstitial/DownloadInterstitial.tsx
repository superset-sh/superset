"use client";

import { Trans } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { DOWNLOAD_URL_MAC_X64 } from "@superset/shared/constants";
import { useEffect, useRef } from "react";
import { WaitlistForm } from "@/app/[lang]/components/WaitlistForm";
import { ArchSource, Platform, usePlatform } from "@/app/[lang]/hooks/useOS";
import { track } from "@/lib/analytics";
import { desktopUrlFor, shouldAutoDownload } from "../../utils/desktopUrlFor";
import { formatReleaseDate } from "../../utils/formatReleaseDate";
import type { DesktopRelease } from "../../utils/getDesktopReleases";
import type { ReleaseAssetKey } from "../../utils/toReleasePlatforms";
import { DesktopDownloadButton } from "../DesktopDownloadButton";
import { DownloadLinkForm } from "../DownloadLinkForm";

const AUTO_DOWNLOAD_DELAY_MS = 600;

// Platform identifiers, not prose — they read the same in every locale
const PLATFORM_LABELS: Record<Platform, string> = {
	[Platform.MacAppleSilicon]: "macOS · Apple Silicon",
	[Platform.MacIntel]: "macOS · Intel",
	[Platform.Windows]: "Windows",
	[Platform.Linux]: "Linux · x64",
	[Platform.Mobile]: "Mobile browser",
	[Platform.Unknown]: "macOS",
};

// Which artifact the spec block is describing, matched on key rather than on
// the human label so the copy can change without breaking the lookup.
const PLATFORM_ASSET_KEY: Partial<Record<Platform, ReleaseAssetKey>> = {
	[Platform.MacAppleSilicon]: "mac-arm64",
	[Platform.MacIntel]: "mac-x64",
	[Platform.Linux]: "linux-appimage-x64",
	[Platform.Unknown]: "mac-arm64",
};

const BYTES_PER_MB = 1024 * 1024;

const HEADING_CLASS =
	"text-3xl font-medium tracking-tight text-foreground sm:text-4xl";

interface DownloadInterstitialProps {
	latestRelease: DesktopRelease | null;
}

export function DownloadInterstitial({
	latestRelease,
}: DownloadInterstitialProps) {
	const { platform, archSource } = usePlatform();
	const firedRef = useRef(false);

	// The browser told us nothing about the chip, so Apple Silicon was assumed
	// rather than detected. Say that instead of labelling the guess as a
	// detection, and give Intel Macs a one-click way out.
	const archUnconfirmed = archSource === ArchSource.Default;

	// A phone can't run the app, so mobile visitors get a link to open on their
	// desktop. Windows has no published build and falls through to the waitlist.
	const showEmailLink = platform === Platform.Mobile;
	const canAutoDownload = !showEmailLink && shouldAutoDownload(platform);
	const showWaitlist = platform === Platform.Windows;

	useEffect(() => {
		if (firedRef.current) return;
		if (!canAutoDownload) return;

		const url = desktopUrlFor(platform);
		track("download_started", { platform, archSource });

		// Latched in the callback, not here: if `platform` resolved again before
		// the timer fired, latching early would strand the pending redirect on
		// the stale URL. Cleanup cancels it so the newest platform wins.
		const timer = window.setTimeout(() => {
			firedRef.current = true;
			window.location.href = url;
		}, AUTO_DOWNLOAD_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, [canAutoDownload, platform, archSource]);

	const assetKey = PLATFORM_ASSET_KEY[platform];
	const asset = assetKey
		? latestRelease?.platforms
				.flatMap((entry) => entry.assets)
				.find((entry) => entry.key === assetKey)
		: undefined;

	return (
		<section className="grid gap-10 pb-12 sm:pb-16 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-16">
			<div>
				<div className="mb-6 inline-flex w-max items-center gap-2 whitespace-nowrap rounded-[2px] border border-border bg-background/80 px-3 py-1.5 font-mono text-muted-foreground text-xs">
					<span className="shrink-0 text-brand">●</span>
					<span>
						{archUnconfirmed
							? PLATFORM_LABELS[Platform.Unknown]
							: PLATFORM_LABELS[platform]}
					</span>
				</div>

				{showEmailLink ? (
					<div className="max-w-2xl">
						<h1 className={HEADING_CLASS}>
							<Trans>Get Superset on your Mac</Trans>
						</h1>
						<p className="mt-3 text-muted-foreground sm:text-lg">
							<Trans>
								Superset is a desktop app. Enter your email and we&apos;ll send
								you a download link to open on your Mac.
							</Trans>
						</p>
						<div className="mt-6">
							<DownloadLinkForm />
						</div>
					</div>
				) : showWaitlist ? (
					<div className="max-w-2xl">
						<h1 className={HEADING_CLASS}>
							<Trans>Superset isn't on Windows yet</Trans>
						</h1>
						<p className="mt-3 text-muted-foreground sm:text-lg">
							<Trans>
								The desktop app runs on macOS and Linux today. Drop your email
								and we'll let you know the moment the Windows build ships.
							</Trans>
						</p>
						<div className="mt-6 max-w-sm">
							<WaitlistForm />
						</div>
					</div>
				) : (
					<div className="max-w-2xl">
						<h1 className={HEADING_CLASS}>
							<Trans>You're about to get Superset</Trans>
						</h1>
						<p className="mt-3 text-muted-foreground sm:text-lg">
							<Trans>
								Your download starts automatically. If it didn't, grab it here.
							</Trans>
						</p>
						<div className="mt-6">
							<DesktopDownloadButton />
						</div>
						{archUnconfirmed ? (
							<p className="mt-4 text-muted-foreground text-sm">
								<Trans>
									Your browser doesn't report which chip you have, so this is
									the Apple Silicon build. On an Intel Mac,{" "}
									<a
										href={DOWNLOAD_URL_MAC_X64}
										onClick={() =>
											track("download_arch_switched", { platform, archSource })
										}
										className="text-foreground underline underline-offset-4"
									>
										get the Intel build
									</a>{" "}
									instead.
								</Trans>
							</p>
						) : null}
					</div>
				)}
			</div>

			{/* Answers what you are actually getting, and gives the empty half of
			    the row something to do. Hidden when there is nothing real to show. */}
			{asset && latestRelease ? (
				<dl className="divide-y divide-border border border-border font-mono text-xs md:min-w-[260px]">
					<div className="flex items-center justify-between gap-8 px-4 py-2.5">
						<dt className="text-muted-foreground">
							<Trans>Version</Trans>
						</dt>
						<dd className="text-foreground">{latestRelease.version}</dd>
					</div>
					<div className="flex items-center justify-between gap-8 px-4 py-2.5">
						<dt className="text-muted-foreground">
							<Trans>Size</Trans>
						</dt>
						<dd className="text-foreground">
							{formatNumber(asset.sizeBytes / BYTES_PER_MB, {
								maximumFractionDigits: 0,
							})}
							{" MB"}
						</dd>
					</div>
					<div className="flex items-center justify-between gap-8 px-4 py-2.5">
						<dt className="text-muted-foreground">
							<Trans>Published</Trans>
						</dt>
						<dd className="text-foreground">
							{formatReleaseDate(latestRelease.publishedAt)}
						</dd>
					</div>
				</dl>
			) : null}
		</section>
	);
}
