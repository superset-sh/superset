import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import type { Metadata } from "next";
import { CTASection } from "@/app/[lang]/components/CTASection";
import { ProductHeroActions } from "@/app/[lang]/components/ProductHeroActions";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { HowItWorks } from "./components/HowItWorks";
import { PluginCatalog } from "./components/PluginCatalog";
import { FEATURES } from "./constants";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Superset Plugins" })),
		description: i18n._(
			msg({
				message:
					"A plugin adds one app's skills and tools to your agents. Install it once, and it works on every machine you sign into.",
			}),
		),
		alternates: localizedAlternates(lang, "/plugins"),
		robots: { index: false, follow: false },
	};
}

export default async function PluginsPage() {
	await initServerI18n();
	const { t } = useLingui();

	return (
		<div className="overflow-x-clip">
			<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-20">
				<section>
					<div className="max-w-3xl">
						<p className="flex items-center gap-2 font-mono text-brand text-xs uppercase tracking-wider">
							<Trans>Superset Plugins</Trans>
							<span className="border border-border px-2 py-0.5 text-muted-foreground normal-case tracking-normal">
								<Trans>Coming soon</Trans>
							</span>
						</p>
						<h1 className="mt-4 font-medium text-balance text-4xl text-foreground tracking-tight sm:text-5xl">
							<Trans>
								Connect your coding agents to the apps your team already uses.
							</Trans>
						</h1>
						<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
							<Trans>
								A plugin adds one app's skills and tools to your agents. Install
								it once, and it works on every machine you sign into.
							</Trans>
						</p>
						<ProductHeroActions source="plugins" docsPath="/mcp-server" />
					</div>
					<PluginCatalog />
				</section>

				<section className="mt-24 sm:mt-32">
					<p className="font-mono text-brand text-xs uppercase tracking-wider">
						<Trans>How it works</Trans>
					</p>
					<h2 className="mt-4 font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>Install it once. Then mention it in any prompt.</Trans>
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
