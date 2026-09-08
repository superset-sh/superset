import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Cloud } from "lucide-react";
import type { Metadata } from "next";
import { ContactForm } from "@/app/[lang]/components/ContactForm";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	return {
		title: i18n._(
			msg({ message: "Build the future of Superset in the cloud" }),
		),
		description: i18n._(
			msg({ message: "Cloud is coming. Become a design partner" }),
		),
		alternates: localizedAlternates(lang, "/cloud"),
	};
}

export default async function CloudPage() {
	await initServerI18n();
	return (
		<main className="min-h-screen">
			<header className="border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12">
					<div className="inline-flex items-center gap-2 text-sm font-mono text-muted-foreground">
						<Cloud aria-hidden="true" className="size-4 text-brand" />
						<Trans>Cloud</Trans>
						<span className="border border-border px-2 py-0.5 text-xs">
							<Trans>Coming soon</Trans>
						</span>
					</div>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						<Trans>Build the future of Superset in the cloud</Trans>
					</h1>
					<p className="text-muted-foreground mt-3 max-w-xl">
						<Trans>
							We're looking for design partners to help shape our cloud
							offering. Tell us about your workflow and we'll be in touch to
							explore working together.
						</Trans>
					</p>
				</div>
			</header>
			<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
				<ContactForm intent="cloud-design-partner" />
			</div>
		</main>
	);
}
