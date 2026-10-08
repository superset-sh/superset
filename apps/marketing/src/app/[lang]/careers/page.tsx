import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import type { Metadata } from "next";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { getAbout } from "@/lib/about";
import { CompanyFacts } from "../components/CompanyFacts";
import { PhotoFan } from "../components/PhotoFan";
import { CareersCTA } from "./components/CareersCTA";
import { CareersFAQ } from "./components/CareersFAQ";
import { HiringProcess } from "./components/HiringProcess";
import { HowWeWork } from "./components/HowWeWork";
import { OpenRoles } from "./components/OpenRoles";
import { TeamStrip } from "./components/TeamStrip";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const title = i18n._(
		msg({
			message: "Join us",
		}),
	);
	const description = i18n._(
		msg({
			message:
				"We're hiring engineers in San Francisco. Come build the tools engineers use to run coding agents.",
		}),
	);
	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/careers"),
		openGraph: {
			title: i18n._(
				msg({
					message: "Join us at Superset",
				}),
			),
			description,
			url: localeUrl(lang, "/careers"),
			images: ["/og-image.png"],
		},
		twitter: {
			card: "summary_large_image",
			title: i18n._(
				msg({
					message: "Join us at Superset",
				}),
			),
			description,
			images: ["/og-image.png"],
		},
	};
}

export default async function CareersPage() {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const applyLabel = i18n._(
		msg({ message: "Apply", context: "job application" }),
	);
	const { photos } = getAbout();

	return (
		<main className="relative bg-background">
			<div className="mx-auto max-w-[80rem] px-6 pt-12 sm:px-8 sm:pt-24">
				<section className="grid gap-8 lg:grid-cols-[2fr_3fr] lg:gap-24 xl:gap-32">
					<h1 className="m-0 max-w-[41.25rem] text-balance text-[2.375rem] leading-[1.1] font-[450] tracking-[-0.035em] text-foreground sm:text-[3.5rem] sm:leading-[1.06]">
						<Trans>Building the last piece of software</Trans>
					</h1>
					<p className="m-0 max-w-[43.75rem] text-[19px] leading-normal tracking-[-0.015em] text-foreground/90 sm:text-xl">
						<Trans>
							Superset is building self-improving software. It starts with
							giving engineers the best tools that adapt to their needs over
							time.
						</Trans>{" "}
						<Trans>
							We're building a flat and talent-dense team, and we're looking for
							people who have crazy ideas and are crazy enough to ship them.
						</Trans>
					</p>
				</section>
				<section className="mt-12 sm:mt-16">
					<PhotoFan photos={photos} />
				</section>
				<OpenRoles applyLabel={applyLabel} className="mt-16 sm:mt-20" />
				<CompanyFacts lang={lang} className="mt-12 sm:mt-16" />
				<HowWeWork className="mt-24 sm:mt-28" />
				<TeamStrip className="mt-24 sm:mt-28" />
				<HiringProcess className="mt-24 sm:mt-28" />
				<CareersFAQ className="mt-24 sm:mt-28" />
				<div className="mt-24 sm:mt-32">
					<CareersCTA />
				</div>
			</div>
		</main>
	);
}
