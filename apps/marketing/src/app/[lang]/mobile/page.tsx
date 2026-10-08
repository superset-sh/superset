import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import type { Metadata } from "next";
import Image from "next/image";
import { FaAndroid } from "react-icons/fa";
import { PhoneShowcase } from "@/app/[lang]/components/PhoneShowcase";
import { StoreBadges } from "@/app/[lang]/components/StoreBadges";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { AppStoreQr } from "./components/AppStoreQr";
import { MobileTestimonials } from "./components/MobileTestimonials";
import { MobileWaitlist } from "./components/MobileWaitlist";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Superset for iPhone and iPad" })),
		description: i18n._(
			msg({
				message:
					"Start coding agents, follow them live, and review the diff from your iPhone or iPad. Available on the App Store; Android is coming soon.",
			}),
		),
		alternates: localizedAlternates(lang, "/mobile"),
	};
}

export default async function MobilePage() {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return (
		<div className="overflow-x-clip">
			<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-20">
				<section className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
					<div>
						<p className="font-mono text-brand text-xs uppercase tracking-wider">
							<Trans>Superset for iPhone and iPad</Trans>
						</p>
						<h1 className="mt-4 font-medium text-4xl text-foreground tracking-tight sm:text-5xl">
							<Trans>
								Leave your desk.
								<br />
								Keep building.
							</Trans>
						</h1>
						<p className="mt-5 max-w-md text-lg text-muted-foreground leading-relaxed">
							<Trans>
								Start agents, follow them live, and review the diff from your
								iPhone or iPad. Your code stays on your machines.
							</Trans>
						</p>
						<div className="mt-8">
							<StoreBadges source="mobile_page" />
						</div>
						<div className="mt-6 flex items-center gap-4">
							<AppStoreQr />
							<p className="max-w-[15rem] text-muted-foreground text-xs leading-relaxed">
								<Trans>
									Requires iOS 26 or iPadOS 26 or later. Included with Superset
									Pro.
								</Trans>
							</p>
						</div>
					</div>
					<PhoneShowcase />
				</section>

				<MobileTestimonials />

				<section
					id="ipad"
					className="mt-12 grid scroll-mt-24 items-center gap-8 border border-border p-6 sm:mt-16 sm:p-8 md:grid-cols-2"
				>
					<div>
						<h2 className="font-mono text-brand text-xs uppercase tracking-wider">
							iPad
						</h2>
						<p className="mt-3 font-light text-foreground text-xl">
							<Trans>
								The same app runs natively on iPad, in portrait and landscape.
							</Trans>
						</p>
						<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
							<Trans>
								Pages open in a grid, and floating keyboards work. Requires
								iPadOS 26 or later.
							</Trans>
						</p>
					</div>
					<Image
						src="/changelog/2026-10-04-ipad.jpg"
						alt={i18n._(
							msg({
								message:
									"Superset on iPad, showing a pull request and a workspace list",
							}),
						)}
						width={1920}
						height={1440}
						sizes="(min-width: 768px) 520px, 100vw"
						className="h-auto w-full"
					/>
				</section>

				<section
					id="android"
					className="mt-12 grid scroll-mt-24 items-center gap-8 border border-border p-6 sm:mt-16 sm:p-8 md:grid-cols-2"
				>
					<div>
						<h2 className="flex items-center gap-2 font-mono text-brand text-xs uppercase tracking-wider">
							<FaAndroid aria-hidden="true" className="size-4" />
							Android
						</h2>
						<p className="mt-3 font-light text-foreground text-xl">
							<Trans>
								Android is on the way. Be first to know when it ships.
							</Trans>
						</p>
					</div>
					<MobileWaitlist platform="android" />
				</section>
			</main>
		</div>
	);
}
