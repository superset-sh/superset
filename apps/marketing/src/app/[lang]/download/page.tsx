import { i18n } from "@superset/i18n";
import type { Metadata } from "next";
import { initServerI18n } from "@/app/i18n-server";
import { DownloadInterstitial } from "./components/DownloadInterstitial";

export async function generateMetadata(): Promise<Metadata> {
	const _lang = await initServerI18n();
	return {
		title: i18n._({
			id: "marketing.meta.download.title",
			message: "Download Superset",
		}),
		description: i18n._({
			id: "marketing.meta.download.description",
			message: "Your Superset download is starting.",
		}),
		robots: { index: false, follow: true },
	};
}

export default async function DownloadPage() {
	await initServerI18n();

	return <DownloadInterstitial />;
}
