import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import type { Metadata } from "next";
import { CTASection } from "@/app/[lang]/components/CTASection";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { HowItWorks } from "./components/HowItWorks";
import { PagesDemoVideo } from "./components/PagesDemoVideo";
import { PagesHeroActions } from "./components/PagesHeroActions";
import { PagesHeroVideo } from "./components/PagesHeroVideo";
import { FEATURES } from "./constants";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Superset Pages" })),
		description: i18n._(
			msg({
				message:
					"Your agent publishes its work as a page. Your team comments on it, and the agent makes the changes.",
			}),
		),
		alternates: localizedAlternates(lang, "/pages"),
	};
}

export default async function PagesPage() {
	await initServerI18n();
	const { t } = useLingui();

	return (
		<div className="overflow-x-clip">
			<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-20">
				<section>
					<div className="max-w-3xl">
						<p className="font-mono text-brand text-xs uppercase tracking-wider">
							<Trans>Superset Pages</Trans>
						</p>
						<h1 className="mt-4 font-medium text-balance text-4xl text-foreground tracking-tight sm:text-5xl">
							<Trans>
								Your agent's work, as a link your team can comment on.
							</Trans>
						</h1>
						<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
							<Trans>
								Your agent publishes its work as a page. Your team comments on
								it, and the agent makes the changes.
							</Trans>
						</p>
						<PagesHeroActions />
					</div>
					<PagesHeroVideo />
				</section>

				<section className="mt-24 sm:mt-32">
					<h2 className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>Watch a design review go from comment to new version.</Trans>
					</h2>
					<div className="mt-10">
						<PagesDemoVideo />
					</div>
				</section>

				<section className="mt-24 sm:mt-32">
					<p className="font-mono text-brand text-xs uppercase tracking-wider">
						<Trans>How it works</Trans>
					</p>
					<h2 className="mt-4 font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>Leave a comment. The agent does the rest.</Trans>
					</h2>
					<HowItWorks />
					<div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
						{FEATURES.map((feature) => (
							<div
								key={feature.title.id}
								className="border-border border-t pt-4"
							>
								<h3 className="font-medium text-foreground">
									{t(feature.title)}
								</h3>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{t(feature.description)}
								</p>
							</div>
						))}
					</div>
				</section>
			</main>
			<CTASection />
		</div>
	);
}
