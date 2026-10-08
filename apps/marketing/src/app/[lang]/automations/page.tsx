import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { CTASection } from "@/app/[lang]/components/CTASection";
import { ProductHeroActions } from "@/app/[lang]/components/ProductHeroActions";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { AutomationsListWindow } from "./components/AutomationsListWindow";
import { HowItWorks } from "./components/HowItWorks";
import { DETAILS } from "./constants";

const VIDEO_URL = "https://www.youtube.com/watch?v=ixe-PiRJTag";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Superset Automations" })),
		description: i18n._(
			msg({
				message:
					"Write a prompt and pick a schedule. Each run opens a workspace you can review and continue.",
			}),
		),
		alternates: localizedAlternates(lang, "/automations"),
	};
}

export default async function AutomationsPage() {
	await initServerI18n();
	const { t } = useLingui();

	return (
		<div className="overflow-x-clip">
			<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-20">
				<section>
					<div className="max-w-3xl">
						<p className="font-mono text-brand text-xs uppercase tracking-wider">
							<Trans>Superset Automations</Trans>
						</p>
						<h1 className="mt-4 font-medium text-balance text-4xl text-foreground tracking-tight sm:text-5xl">
							<Trans>
								Your agents do the recurring work on a schedule you set.
							</Trans>
						</h1>
						<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
							<Trans>
								Write a prompt and pick a schedule. Each run opens a workspace
								you can review and continue.
							</Trans>
						</p>
						<ProductHeroActions source="automations" docsPath="/automations" />
					</div>
					<AutomationsListWindow />
					<a
						href={VIDEO_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="mt-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
					>
						<Trans>Watch the Superset Automations video on YouTube</Trans>
						<ArrowUpRight className="size-3.5" />
					</a>
				</section>

				<section className="mt-24 sm:mt-32">
					<p className="font-mono text-brand text-xs uppercase tracking-wider">
						<Trans>How it works</Trans>
					</p>
					<h2 className="mt-4 font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>
							Write the prompt once. Every run gets its own workspace.
						</Trans>
					</h2>
					<HowItWorks />
					<div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
						{DETAILS.map((detail) => (
							<div
								key={detail.title.id}
								className="border-border border-t pt-4"
							>
								<h3 className="font-medium text-foreground">
									{t(detail.title)}
								</h3>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{t(detail.description)}
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
