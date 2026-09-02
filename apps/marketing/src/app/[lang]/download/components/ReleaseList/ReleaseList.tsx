"use client";

import { Trans } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { COMPANY } from "@superset/shared/constants";
import { FaApple, FaLinux, FaWindows } from "react-icons/fa";
import {
	HiMiniArrowDownTray,
	HiMiniArrowRight,
	HiMiniChevronDown,
} from "react-icons/hi2";
import { track } from "@/lib/analytics";
import { formatReleaseDate } from "../../utils/formatReleaseDate";
import type { DesktopRelease } from "../../utils/getDesktopReleases";
import type { DownloadOs } from "../../utils/toReleasePlatforms";

const OS_ICONS: Record<
	DownloadOs,
	React.ComponentType<{ className?: string }>
> = {
	macOS: FaApple,
	Windows: FaWindows,
	Linux: FaLinux,
};

const BYTES_PER_MB = 1024 * 1024;

// Only the platforms that actually shipped get a column, so a release built for
// two never leaves a third cell sitting empty.
const PLATFORM_GRID_CLASS: Record<number, string> = {
	1: "md:grid-cols-1",
	2: "md:grid-cols-2",
	3: "md:grid-cols-3",
};

function formatSize(sizeBytes: number): string {
	// Unit symbol is not translated; the number is
	return `${formatNumber(sizeBytes / BYTES_PER_MB, { maximumFractionDigits: 0 })} MB`;
}

interface ReleaseListProps {
	releases: DesktopRelease[];
}

export function ReleaseList({ releases }: ReleaseListProps) {
	if (releases.length === 0) {
		// The catalog is best-effort: if GitHub is unreachable the page still has
		// the platform-aware button above, so point at the source instead of
		// rendering an empty shell.
		return (
			<section id="all-downloads" className="border-border border-t pt-12">
				<a
					href={`${COMPANY.GITHUB_URL}/releases`}
					className="inline-flex items-center gap-1 text-brand text-sm transition-colors hover:text-brand-light"
				>
					<Trans>All releases on GitHub</Trans>
					<HiMiniArrowRight className="size-3.5" />
				</a>
			</section>
		);
	}

	return (
		<section id="all-downloads" className="border-border border-t pt-12">
			<p className="max-w-2xl font-light text-foreground text-xl sm:text-2xl">
				<Trans>
					The Superset desktop app is available for macOS and Linux.
				</Trans>
			</p>

			<div className="mt-8">
				{releases.map((release, index) => (
					<details
						key={release.version}
						open={index === 0}
						className="group border-border border-t last:border-b"
					>
						<summary className="-mx-3 flex cursor-pointer list-none items-center justify-between gap-4 rounded-[2px] px-3 py-5 transition-colors hover:bg-muted/20 [&::-webkit-details-marker]:hidden">
							<span className="flex items-baseline gap-3">
								<span className="font-medium text-foreground text-lg">
									{release.version}
								</span>
								{index === 0 ? (
									<span className="rounded-[2px] border border-brand/40 bg-brand/10 px-2 py-0.5 font-mono text-brand text-xs">
										<Trans>Latest</Trans>
									</span>
								) : null}
								<span className="font-mono text-muted-foreground text-xs">
									{formatReleaseDate(release.publishedAt)}
								</span>
							</span>
							<HiMiniChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
						</summary>

						<div className="pb-6">
							<div
								className={`grid grid-cols-1 gap-px border border-border bg-border ${
									PLATFORM_GRID_CLASS[release.platforms.length] ??
									"md:grid-cols-3"
								}`}
							>
								{release.platforms.map((platform) => {
									const Icon = OS_ICONS[platform.os];
									return (
										<div key={platform.os} className="bg-background p-5">
											<h3 className="flex items-center gap-2 font-mono text-foreground text-xs uppercase tracking-wider">
												<Icon className="size-4" />
												{platform.os}
											</h3>
											<ul className="mt-4">
												{platform.assets.map((asset) => (
													<li
														key={asset.url}
														className="border-border border-t first:border-t-0"
													>
														<a
															href={asset.url}
															onClick={() =>
																track("download_asset_clicked", {
																	version: release.version,
																	asset: asset.label,
																})
															}
															className="group/asset -mx-2 flex items-center justify-between gap-3 rounded-[2px] px-2 py-3 text-muted-foreground text-sm transition-colors hover:bg-muted/20 hover:text-foreground"
														>
															<span>{asset.label}</span>
															<span className="flex shrink-0 items-center gap-2">
																<span className="font-mono text-muted-foreground text-xs">
																	{formatSize(asset.sizeBytes)}
																</span>
																<HiMiniArrowDownTray className="size-4 transition-colors group-hover/asset:text-brand" />
															</span>
														</a>
													</li>
												))}
											</ul>
										</div>
									);
								})}
							</div>

							<a
								href={release.notesUrl}
								className="mt-4 inline-flex items-center gap-1 text-brand text-sm transition-colors hover:text-brand-light"
							>
								<Trans>View release notes</Trans>
								<HiMiniArrowRight className="size-3.5" />
							</a>
						</div>
					</details>
				))}
			</div>

			<a
				href={`${COMPANY.GITHUB_URL}/releases`}
				className="mt-6 inline-flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground"
			>
				<Trans>All releases on GitHub</Trans>
				<HiMiniArrowRight className="size-3.5" />
			</a>
		</section>
	);
}
