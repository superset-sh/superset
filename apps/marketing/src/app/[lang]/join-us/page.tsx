import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import type { Metadata } from "next";
import Script from "next/script";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";

declare global {
	namespace React.JSX {
		interface IntrinsicElements {
			"waas-job-board": React.DetailedHTMLProps<
				React.HTMLAttributes<HTMLElement>,
				HTMLElement
			> & { company: string };
		}
	}
}

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const title = i18n._(
		msg({
			message: "Join us",
		}),
	);
	const description = i18n._(
		msg({
			message:
				"We're hiring engineers in San Francisco. Help us build the first software factory platform.",
		}),
	);
	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/join-us"),
		openGraph: {
			title: i18n._(
				msg({
					message: "Join us at Superset",
				}),
			),
			description,
			url: localeUrl(lang, "/join-us"),
			images: ["/opengraph-image"],
		},
		twitter: {
			card: "summary_large_image",
			title: i18n._(
				msg({
					message: "Join us at Superset",
				}),
			),
			description,
			images: ["/opengraph-image"],
		},
	};
}

export default async function JoinUsPage() {
	await initServerI18n();

	return (
		<main className="relative min-h-screen bg-background">
			<div className="max-w-[90rem] mx-auto px-6 pt-24 md:pt-32">
				<section className="grid gap-10 md:grid-cols-[2fr_3fr] md:gap-24 lg:gap-32">
					<h1 className="text-4xl md:text-5xl font-normal leading-tight text-foreground m-0">
						<Trans>Building the last piece of software</Trans>
					</h1>

					<div>
						<p className="text-xl md:text-2xl text-foreground leading-snug m-0">
							<Trans>
								Superset is building self-improving software. It starts with
								giving engineers the best tools that adapt to their needs over
								time.
							</Trans>
						</p>

						<div
							className="mt-8 space-y-5 text-base text-muted-foreground leading-relaxed"
							style={{ fontFamily: "var(--font-inter), sans-serif" }}
						>
							<p>
								<Trans>
									Today, tens of thousands of engineers run Superset as their
									primary IDE, at companies like Wix, DoorDash, and Netflix.
									Soon, teams will run 100s of agents in parallel - software
									factories that autonomously manufacture and ship code. We're
									making Superset the place where teams run and manage those
									factories, starting with our own.
								</Trans>
							</p>

							<p>
								<Trans>
									Superset is built in Superset, so we're our own #1 users - you
									get paid to make your own life easier. We're building a flat
									and talent-dense team, and we're looking for people who have
									crazy ideas and are crazy enough to ship them. If you've ever
									wanted to build a product you love to use, come build it with
									us.
								</Trans>
							</p>
						</div>
					</div>
				</section>
			</div>

			<div className="max-w-[90rem] mx-auto px-6 pb-24 md:pb-32">
				<section id="open-roles" className="mt-24 md:mt-32 scroll-mt-24">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-6">
						<Trans>Open roles</Trans>
					</h2>

					{/* Managed via YC Work at a Startup; layout/colors configured at bookface.ycombinator.com/workatastartup/job_board_settings */}
					<style>{`
						waas-job-board {
							--waas-primary: var(--brand);
							--waas-radius: 0px;
							--waas-border: var(--color-border);
							--waas-border-focus: var(--brand);
							--waas-bg: #101012;
							--waas-bg-subtle: rgba(255, 255, 255, 0.06);
							--waas-font: var(--font-inter), ui-sans-serif, sans-serif;
							--waas-text: var(--foreground);
							--waas-text-secondary: var(--muted-foreground);
							--waas-font-size-base: 15px;
							--waas-font-size-md: 18px;
							--waas-font-size-xl: 22px;
						}
					`}</style>
					<Script
						src="https://www.workatastartup.com/embed/script.js"
						strategy="afterInteractive"
					/>
					{/* show-filters="false" attribute is ignored (Lit boolean), so set the property; detail-view spacing has no CSS-var hooks, so patch its shadow root directly */}
					<Script id="waas-board-config" strategy="afterInteractive">
						{`// the embed renders hCaptcha without a theme option, so force dark by patching render() as the hcaptcha script assigns its global
						{
							const darken = (h) => {
								if (!h?.render || h.__supersetDark) return h;
								const orig = h.render.bind(h);
								h.render = (el, cfg) => orig(el, { theme: "dark", ...cfg });
								h.__supersetDark = true;
								return h;
							};
							let hc = darken(window.hcaptcha);
							Object.defineProperty(window, "hcaptcha", {
								configurable: true,
								get: () => hc,
								set: (v) => { hc = darken(v); },
							});
						}
						customElements.whenDefined("waas-job-board").then(() => {
							// !important: Lit's adoptedStyleSheets are ordered after tree styles, so plain rules lose
							const inject = (root, css) => {
								if (!root || root.getElementById("superset-overrides")) return;
								const style = document.createElement("style");
								style.id = "superset-overrides";
								style.textContent = css;
								root.append(style);
							};
							// site CTA recipe (see DownloadButton): mono uppercase, foreground/background flip, brand on hover
							const mono = "font-family:var(--font-ibm-plex-mono),ui-monospace,monospace !important;text-transform:uppercase !important;letter-spacing:0.05em !important";
							const detailCss = [
								".two-col{gap:192px !important}",
								".tabs{margin-bottom:48px !important;gap:40px !important}",
								".main-content{max-width:760px !important}",
								".tab{" + mono + ";font-size:13px !important}",
								".back-link{" + mono + ";font-size:12px !important}",
								".sidebar-label{" + mono + ";font-size:11px !important}",
								".sidebar-item{border-bottom:1px solid var(--_border) !important}", // default rgba(0,0,0,.06) vanishes on dark bg
							].join("");
							const formCss = [
								".primary-button{" + mono + ";font-size:13px !important;font-weight:400 !important;background:var(--foreground) !important;color:var(--background) !important;transition:background-color .15s ease,color .15s ease !important}",
								".primary-button:hover:not(:disabled){background:var(--brand) !important;color:#fff !important;filter:none !important}",
							].join("");
							const cardCss = [
								".job-card{border-bottom:none !important}",
								".job-card:hover{background:rgba(255,255,255,0.04) !important}", // default rgba(0,0,0,.03) vanishes on dark bg
								".job-salary{font-family:var(--font-ibm-plex-mono),ui-monospace,monospace !important;letter-spacing:0.02em !important}",
							].join("");
							for (const board of document.querySelectorAll("waas-job-board")) {
								board.showFilters = false;
								const patch = () => {
									const detail = board.shadowRoot?.querySelector("waas-job-detail");
									inject(detail?.shadowRoot, detailCss);
									inject(detail?.shadowRoot?.querySelector("waas-apply-form")?.shadowRoot, formCss);
									const list = board.shadowRoot?.querySelector("waas-job-list");
									for (const card of list?.shadowRoot?.querySelectorAll("waas-job-card") ?? []) {
										inject(card.shadowRoot, cardCss);
									}
								};
								patch();
								// nested shadow roots aren't visible to the observer, so poll as a safety net
								new MutationObserver(patch).observe(board.shadowRoot, { childList: true, subtree: true });
								setInterval(patch, 500);
							}
						});`}
					</Script>
					<waas-job-board company="superset" />
					<noscript>
						<a href="https://www.ycombinator.com/companies/superset/jobs">
							<Trans>View open roles on Y Combinator</Trans>
						</a>
					</noscript>
				</section>
			</div>
		</main>
	);
}
