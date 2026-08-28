import type { Metadata } from "next";
import { initServerI18n } from "@/app/i18n-server";
import { DownloadInterstitial } from "./components/DownloadInterstitial";

export const metadata: Metadata = {
	title: "Download Superset",
	description: "Your Superset download is starting.",
	robots: { index: false, follow: true },
};

export default function DownloadPage() {
	initServerI18n();

	return <DownloadInterstitial />;
}
