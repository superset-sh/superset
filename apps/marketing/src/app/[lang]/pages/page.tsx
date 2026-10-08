import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import Link from "next/link";
import { CTASection } from "@/app/[lang]/components/CTASection";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { CommentGraphic } from "./components/CommentGraphic";
import { CreateGraphic } from "./components/CreateGraphic";
import { IterateGraphic } from "./components/IterateGraphic";
import { PagesDemoVideo } from "./components/PagesDemoVideo";
import { ShareGraphic } from "./components/ShareGraphic";
import { FEATURES, LOOP_STEPS, type LoopStepId } from "./constants";

const STEP_GRAPHICS: Record<LoopStepId, () => React.JSX.Element> = {
	create: CreateGraphic,
	share: ShareGraphic,
	comment: CommentGraphic,
	iterate: IterateGraphic,
};

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Superset Pages" })),
		description: i18n._(
			msg({
				message:
					"Agents publish reports, designs, and walkthroughs as a link. Your team pins comments to the page, and the agent updates it and replies.",
			}),
		),
		alternates: localizedAlternates(lang, "/pages"),
	};
}

export default async function PagesPage() {
	const lang = await initServerI18n();
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
								Agents publish reports, designs, and walkthroughs as a page.
								Teammates pin comments to any part of it, and the agent updates
								the page and replies.
							</Trans>
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-3">
							<Link
								href={lang === "en" ? "/download" : `/${lang}/download`}
								className="bg-foreground px-5 py-2.5 text-background text-sm transition-opacity hover:opacity-90"
							>
								<Trans>Download Superset</Trans>
							</Link>
							<a
								href={`${COMPANY.DOCS_URL}/pages`}
								className="border border-border px-5 py-2.5 text-foreground text-sm transition-colors hover:bg-muted"
							>
								<Trans>Read the docs</Trans>
							</a>
						</div>
					</div>
					<div
						aria-hidden="true"
						className="mt-14 overflow-hidden border border-border bg-[#141414]"
					>
						<video
							src="/pages/hero.mp4"
							poster="/pages/hero-poster.webp"
							autoPlay
							loop
							muted
							playsInline
							className="block aspect-[1600/838] w-full"
						/>
					</div>
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
					<ol className="mt-12 grid gap-x-8 gap-y-14 md:grid-cols-2">
						{LOOP_STEPS.map((step, index) => {
							const Graphic = STEP_GRAPHICS[step.id];
							return (
								<li key={step.id}>
									<Graphic />
									<div className="mt-6 flex gap-4">
										<span className="pt-1 font-mono text-brand text-sm">
											{String(index + 1).padStart(2, "0")}
										</span>
										<div className="space-y-2">
											<h3 className="font-medium text-foreground text-xl tracking-tight">
												{t(step.title)}
											</h3>
											<p className="max-w-md text-muted-foreground leading-relaxed">
												{t(step.description)}
											</p>
										</div>
									</div>
								</li>
							);
						})}
					</ol>
				</section>

				<section className="mt-24 sm:mt-32">
					<h2 className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>Built for work that has a reader.</Trans>
					</h2>
					<div className="mt-12 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
						{FEATURES.map((feature) => (
							<div key={feature.title.id} className="bg-background p-6 sm:p-8">
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
