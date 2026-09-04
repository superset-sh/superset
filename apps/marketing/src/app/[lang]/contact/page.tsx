import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { GridCross } from "@/app/[lang]/blog/components/GridCross";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { ContactForm } from "./components/ContactForm";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	return {
		title: i18n._(
			msg({
				message: "Contact",
			}),
		),
		description: i18n._({
			...msg({
				message: "Get in touch with the {companyName} team.",
			}),
			values: { companyName: COMPANY.NAME },
		}),
		alternates: localizedAlternates(lang, "/contact"),
	};
}

export default async function ContactPage() {
	await initServerI18n();

	// Named locals so the paragraph extracts with `{supportEmail}` /
	// `{foundersEmail}` instead of positional `{0}` / `{1}`.
	const supportEmail = `support${COMPANY.EMAIL_DOMAIN}`;
	const foundersEmail = COMPANY.FOUNDERS_EMAIL;

	return (
		<main className="relative min-h-screen">
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
					`,
				}}
			/>

			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						<Trans>Contact</Trans>
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						<Trans>Talk to Superset</Trans>
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						<Trans>
							Questions, feedback, support, or anything else. Send a note and
							we&apos;ll route it to the right person.
						</Trans>
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			<div className="relative max-w-3xl mx-auto px-6 py-12 md:py-16">
				<ContactForm />

				<section className="mt-16 border-t border-border pt-10">
					<h2 className="text-xl font-medium text-foreground">
						<Trans>Other ways to reach us</Trans>
					</h2>
					<p className="text-muted-foreground mt-3">
						<Trans>
							Superset is built by a team based in San Francisco, California.
							For product support or account questions, email{" "}
							<a className="text-foreground underline" href={COMPANY.MAIL_TO}>
								{supportEmail}
							</a>{" "}
							and we&apos;ll get back to you within one business day. For
							partnerships, press, enterprise, or anything for the founding
							team, write to{" "}
							<a
								className="text-foreground underline"
								href={COMPANY.FOUNDERS_MAIL_TO}
							>
								{foundersEmail}
							</a>
							.
						</Trans>
					</p>
					<p className="text-muted-foreground mt-3">
						<Trans>
							For bug reports and feature requests, the fastest path is a GitHub
							issue at{" "}
							<a
								className="text-foreground underline"
								href={COMPANY.REPORT_ISSUE_URL}
							>
								github.com/superset-sh/superset
							</a>
							. Our community lives on{" "}
							<a
								className="text-foreground underline"
								href={COMPANY.DISCORD_URL}
							>
								Discord
							</a>
							, and we post updates on{" "}
							<a className="text-foreground underline" href={COMPANY.X_URL}>
								X (@superset_sh)
							</a>{" "}
							and{" "}
							<a
								className="text-foreground underline"
								href={COMPANY.LINKEDIN_URL}
							>
								LinkedIn
							</a>
							.
						</Trans>
					</p>
					<p className="text-muted-foreground mt-3">
						<Trans>
							Service availability is published at{" "}
							<a
								className="text-foreground underline"
								href={COMPANY.STATUS_URL}
							>
								status.superset.sh
							</a>
							, and security and compliance documentation at{" "}
							<a className="text-foreground underline" href={COMPANY.TRUST_URL}>
								trust.superset.sh
							</a>
							.
						</Trans>
					</p>
				</section>
			</div>
		</main>
	);
}
