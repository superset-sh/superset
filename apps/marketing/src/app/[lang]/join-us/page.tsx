import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { getI18nInstance } from "@superset/i18n/server";
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
	const i18n = getI18nInstance(lang);
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

export default async function JoinUsPage() {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const founderCount = formatNumber(4, {}, lang);
	// Verified in PostHog on 2026-09-10: 54,570 identified desktop users,
	// excluding test accounts. Cumulative adoption, rounded down.
	const developerCount = formatNumber(50_000, {}, lang);
	const applyLabel = i18n._(
		msg({ message: "Apply", context: "job application" }),
	);

	return (
		<main className="relative bg-background">
			<div className="mx-auto max-w-[80rem] px-6 pt-12 pb-20 sm:px-8 sm:pt-24">
				<section className="grid gap-8 lg:grid-cols-[2fr_3fr] lg:gap-24 xl:gap-32">
					<h1 className="m-0 max-w-[41.25rem] text-balance text-[2.375rem] leading-[1.1] font-[450] tracking-[-0.035em] text-foreground sm:text-[3.5rem] sm:leading-[1.06]">
						<Trans>Building the last piece of software</Trans>
					</h1>
					<div>
						<p className="m-0 mb-5 max-w-[43.75rem] text-[19px] leading-normal tracking-[-0.015em] text-foreground/90 sm:text-xl">
							<Trans>
								Superset is building self-improving software. It starts with
								giving engineers the best tools that adapt to their needs over
								time.
							</Trans>
						</p>
						<div className="max-w-[46.25rem] space-y-4 text-base leading-[1.65] tracking-[-0.01em] text-muted-foreground">
							<p>
								<Trans>
									Soon, teams will run hundreds of agents in parallel—software
									factories that autonomously manufacture and ship code. We're
									making Superset the place where teams run and manage those
									factories, starting with our own.
								</Trans>
							</p>
							<p>
								<Trans>
									Superset is built in Superset, so we're our own #1 users—you
									get paid to make your own life easier. If you've ever wanted
									to build a product you love to use, come build it with us.
								</Trans>
							</p>
						</div>
					</div>
				</section>
				<dl className="my-8 grid grid-cols-1 gap-5 border-y border-border py-6 sm:mt-16 sm:mb-12 lg:mt-20 lg:mb-16 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-2">
					<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 sm:row-span-2 sm:min-w-0 sm:grid-cols-1 sm:grid-rows-subgrid">
						<dt className="font-mono text-[11px] leading-4 tracking-[0.07em] text-muted-foreground uppercase sm:order-2">
							<Trans>Location</Trans>
						</dt>
						<dd className="m-0 text-xl leading-7 tracking-[-0.025em] sm:text-[26px] sm:leading-[34px]">
							<Trans>San Francisco</Trans>
						</dd>
					</div>
					<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 sm:row-span-2 sm:min-w-0 sm:grid-cols-1 sm:grid-rows-subgrid">
						<dt className="font-mono text-[11px] leading-4 tracking-[0.07em] text-muted-foreground uppercase sm:order-2">
							<Trans>Team</Trans>
						</dt>
						<dd className="m-0 text-xl leading-7 tracking-[-0.025em] sm:text-[26px] sm:leading-[34px]">
							<Trans>{founderCount} ex-YC founders</Trans>
						</dd>
					</div>
					<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 sm:row-span-2 sm:min-w-0 sm:grid-cols-1 sm:grid-rows-subgrid">
						<dt className="font-mono text-[11px] leading-4 tracking-[0.07em] text-muted-foreground uppercase sm:order-2">
							<Trans>Developers</Trans>
						</dt>
						<dd className="m-0 text-xl leading-7 tracking-[-0.025em] tabular-nums sm:text-[26px] sm:leading-[34px]">
							<Trans>{developerCount}+</Trans>
						</dd>
					</div>
				</dl>
				<section id="open-roles" className="scroll-mt-24">
					<h2 className="mb-6 text-[22px] leading-7 font-[450] tracking-[-0.025em] text-foreground sm:text-2xl sm:leading-8">
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
								".two-col{gap:40px !important}",
								".tabs{margin-bottom:48px !important;gap:40px !important}",
								".main-content{max-width:760px !important}",
								".tab{" + mono + ";font-size:13px !important}",
								".back-link{" + mono + ";font-size:12px !important}",
								".sidebar-label{" + mono + ";font-size:11px !important}",
								".sidebar-item{border-bottom:1px solid var(--_border) !important}", // default rgba(0,0,0,.06) vanishes on dark bg
								// regular-weight title and section headings (WaaS wraps section titles in <h3><strong>), 16px body
								".job-title{font-size:36px !important;font-weight:400 !important;letter-spacing:-0.02em !important;line-height:1.2 !important}",
								".description{font-size:16px !important;line-height:1.5 !important;color:var(--_text) !important}",
								".description :is(h1,h2,h3){font-size:var(--_font-size-md) !important;font-weight:400 !important;margin:40px 0 12px !important}",
								".description :is(h1,h2,h3) strong{font-weight:400 !important}",
								".description :is(p,ul,ol){margin:16px 0 !important}",
								".description li{margin-bottom:8px !important}",
							].join("");
							const formCss = [
								".primary-button{" + mono + ";font-size:13px !important;font-weight:400 !important;background:var(--foreground) !important;color:var(--background) !important;transition:background-color .15s ease,color .15s ease !important}",
								".primary-button:hover:not(:disabled){background:var(--brand) !important;color:#fff !important;filter:none !important}",
							].join("");
							const applyLabel = ${JSON.stringify(applyLabel)};
							const cardCss = [
								".job-card{display:grid !important;grid-template-columns:minmax(0,1fr) auto;column-gap:24px;border:0 !important;padding:0 0 24px !important}",
								".job-card:hover{background:rgba(255,255,255,0.04) !important}", // default rgba(0,0,0,.03) vanishes on dark bg
								".job-title,.job-meta,.job-salary{grid-column:1}",
								".job-title{font-size:17px !important;line-height:24px !important;font-weight:450 !important;letter-spacing:-0.015em !important;margin-bottom:8px !important}",
								".job-meta,.job-salary{font-size:13px !important;line-height:20px !important}",
								".superset-apply{grid-column:2;grid-row:1 / span 3;align-self:start;white-space:nowrap;" + mono + ";font-size:11px !important;line-height:24px !important}",
								".job-card:hover .superset-apply{color:var(--brand)}",
								"@container (max-width:400px){.job-card{column-gap:16px}}",
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
										const row = card.shadowRoot?.querySelector(".job-card");
										if (row && !row.querySelector(".superset-apply")) {
											const apply = document.createElement("span");
											apply.className = "superset-apply";
											apply.textContent = applyLabel + " ↗";
											apply.setAttribute("aria-hidden", "true");
											row.append(apply);
										}
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
