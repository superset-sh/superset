import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { Metadata } from "next";
import { initServerI18n } from "@/app/i18n-server";
import { DownloadInterstitial } from "./components/DownloadInterstitial";
import { ReleaseList } from "./components/ReleaseList";
import { SurfaceCards } from "./components/SurfaceCards";
import { getDesktopReleases } from "./utils/getDesktopReleases";

export async function generateMetadata(): Promise<Metadata> {
	const _lang = await initServerI18n();
	return {
		title: i18n._(
			msg({
				message: "Download Superset",
			}),
		),
		description: i18n._(
			msg({
				message: "Your Superset download is starting.",
			}),
		),
		// The page fires the download on arrival, so it must not be a search
		// result someone lands on cold.
		robots: { index: false, follow: true },
	};
}

export default async function DownloadPage() {
	await initServerI18n();
	const releases = await getDesktopReleases();

	return (
		<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
			<DownloadInterstitial latestRelease={releases[0] ?? null} />
			<SurfaceCards />
			<div className="mt-12 sm:mt-16">
				<ReleaseList releases={releases} />
			</div>
		</main>
	);
}
