"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
	i18n,
	isSupportedLocale,
	LOCALE_COOKIE,
	LOCALE_LABELS,
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { m } from "framer-motion";
import { ArrowUpRight, Check, ChevronDown, Languages } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { track } from "@/lib/analytics";
import { Soc2Badge } from "../Soc2Badge";
import { SocialLinks } from "../SocialLinks";

function SupersetLogo() {
	return (
		<svg
			width="156"
			height="26"
			viewBox="0 0 392 64"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-label="Superset"
		>
			<title>Superset</title>
			<path
				d="M25.2727 -0.00017944H37.9091V12.6362H25.2727V-0.00017944ZM12.6364 -0.00017944H25.2727V12.6362H12.6364V-0.00017944ZM0 12.6362H12.6364V25.2725H0V12.6362ZM0 25.2725H12.6364V37.9089H0V25.2725ZM12.6364 25.2725H25.2727V37.9089H12.6364V25.2725ZM25.2727 25.2725H37.9091V37.9089H25.2727V25.2725ZM25.2727 37.9089H37.9091V50.5453H25.2727V37.9089ZM25.2727 50.5453H37.9091V63.1816H25.2727V50.5453ZM12.6364 50.5453H25.2727V63.1816H12.6364V50.5453ZM0 50.5453H12.6364V63.1816H0V50.5453ZM0 -0.00017944H12.6364V12.6362H0V-0.00017944ZM50.4961 -0.00017944H63.1325V12.6362H50.4961V-0.00017944ZM50.4961 12.6362H63.1325V25.2725H50.4961V12.6362ZM50.4961 25.2725H63.1325V37.9089H50.4961V25.2725ZM50.4961 37.9089H63.1325V50.5453H50.4961V37.9089ZM50.4961 50.5453H63.1325V63.1816H50.4961V50.5453ZM63.1325 50.5453H75.7688V63.1816H63.1325V50.5453ZM75.7688 50.5453H88.4052V63.1816H75.7688V50.5453ZM75.7688 37.9089H88.4052V50.5453H75.7688V37.9089ZM75.7688 25.2725H88.4052V37.9089H75.7688V25.2725ZM75.7688 12.6362H88.4052V25.2725H75.7688V12.6362ZM75.7688 -0.00017944H88.4052V12.6362H75.7688V-0.00017944ZM100.992 -0.00017944H113.629V12.6362H100.992V-0.00017944ZM100.992 12.6362H113.629V25.2725H100.992V12.6362ZM100.992 25.2725H113.629V37.9089H100.992V25.2725ZM100.992 37.9089H113.629V50.5453H100.992V37.9089ZM100.992 50.5453H113.629V63.1816H100.992V50.5453ZM113.629 -0.00017944H126.265V12.6362H113.629V-0.00017944ZM126.265 -0.00017944H138.901V12.6362H126.265V-0.00017944ZM126.265 12.6362H138.901V25.2725H126.265V12.6362ZM126.265 25.2725H138.901V37.9089H126.265V25.2725ZM113.629 25.2725H126.265V37.9089H113.629V25.2725ZM151.488 -0.00017944H164.125V12.6362H151.488V-0.00017944ZM151.488 12.6362H164.125V25.2725H151.488V12.6362ZM151.488 25.2725H164.125V37.9089H151.488V25.2725ZM151.488 37.9089H164.125V50.5453H151.488V37.9089ZM151.488 50.5453H164.125V63.1816H151.488V50.5453ZM164.125 -0.00017944H176.761V12.6362H164.125V-0.00017944ZM164.125 50.5453H176.761V63.1816H164.125V50.5453ZM164.125 25.2725H176.761V37.9089H164.125V25.2725ZM176.761 -0.00017944H189.397V12.6362H176.761V-0.00017944ZM176.761 50.5453H189.397V63.1816H176.761V50.5453ZM201.984 50.5453H214.621V63.1816H201.984V50.5453ZM201.984 37.9089H214.621V50.5453H201.984V37.9089ZM201.984 25.2725H214.621V37.9089H201.984V25.2725ZM201.984 12.6362H214.621V25.2725H201.984V12.6362ZM201.984 -0.00017944H214.621V12.6362H201.984V-0.00017944ZM214.621 -0.00017944H227.257V12.6362H214.621V-0.00017944ZM227.257 -0.00017944H239.893V12.6362H227.257V-0.00017944ZM227.257 12.6362H239.893V25.2725H227.257V12.6362ZM214.621 25.2725H227.257V37.9089H214.621V25.2725ZM227.257 37.9089H239.893V50.5453H227.257V37.9089ZM227.257 50.5453H239.893V63.1816H227.257V50.5453ZM277.753 -0.00017944H290.39V12.6362H277.753V-0.00017944ZM265.117 -0.00017944H277.753V12.6362H265.117V-0.00017944ZM252.48 12.6362H265.117V25.2725H252.48V12.6362ZM252.48 25.2725H265.117V37.9089H252.48V25.2725ZM265.117 25.2725H277.753V37.9089H265.117V25.2725ZM277.753 25.2725H290.39V37.9089H277.753V25.2725ZM277.753 37.9089H290.39V50.5453H277.753V37.9089ZM277.753 50.5453H290.39V63.1816H277.753V50.5453ZM265.117 50.5453H277.753V63.1816H265.117V50.5453ZM252.48 50.5453H265.117V63.1816H252.48V50.5453ZM252.48 -0.00017944H265.117V12.6362H252.48V-0.00017944ZM302.977 -0.00017944H315.613V12.6362H302.977V-0.00017944ZM302.977 12.6362H315.613V25.2725H302.977V12.6362ZM302.977 25.2725H315.613V37.9089H302.977V25.2725ZM302.977 37.9089H315.613V50.5453H302.977V37.9089ZM302.977 50.5453H315.613V63.1816H302.977V50.5453ZM315.613 -0.00017944H328.249V12.6362H315.613V-0.00017944ZM315.613 50.5453H328.249V63.1816H315.613V50.5453ZM315.613 25.2725H328.249V37.9089H315.613V25.2725ZM328.249 -0.00017944H340.886V12.6362H328.249V-0.00017944ZM328.249 50.5453H340.886V63.1816H328.249V50.5453ZM353.473 -0.00017944H366.109V12.6362H353.473V-0.00017944ZM366.109 -0.00017944H378.745V12.6362H366.109V-0.00017944ZM378.745 -0.00017944H391.382V12.6362H378.745V-0.00017944ZM366.109 12.6362H378.745V25.2725H366.109V12.6362ZM366.109 25.2725H378.745V37.9089H366.109V25.2725ZM366.109 37.9089H378.745V50.5453H366.109V37.9089ZM366.109 50.5453H378.745V63.1816H366.109V50.5453Z"
				fill="currentColor"
			/>
		</svg>
	);
}

interface FooterLink {
	href: string;
	label: ReactNode;
	external?: boolean;
}

const PRODUCT_LINKS: FooterLink[] = [
	{
		href: "/download",
		label: <Trans>Download</Trans>,
	},
	{
		href: "/#how-it-works",
		label: <Trans>How it works</Trans>,
	},
	{
		href: "/#features",
		label: <Trans>Features</Trans>,
	},
	{
		href: "/#security",
		label: <Trans>Security</Trans>,
	},
	{ href: "/mcp-install", label: "MCP" },
	{
		href: "/marketplace",
		label: <Trans>Marketplace</Trans>,
	},
	{
		href: "/compare",
		label: <Trans>Compare</Trans>,
	},
];

const COMPANY_LINKS: FooterLink[] = [
	{
		href: "/team",
		label: <Trans>About</Trans>,
	},
	{
		href: "/contact",
		label: <Trans>Contact</Trans>,
	},
	{
		href: "/join-us",
		label: <Trans>Careers</Trans>,
	},
	{
		href: COMPANY.STATUS_URL,
		label: <Trans>Status</Trans>,
		external: true,
	},
];

const RESOURCE_LINKS: FooterLink[] = [
	{
		href: COMPANY.DOCS_URL,
		label: <Trans>Documentation</Trans>,
		external: true,
	},
	{
		href: "/pricing",
		label: <Trans>Pricing</Trans>,
	},
	{
		href: "/blog",
		label: <Trans>Blog</Trans>,
	},
	{
		href: "/parallel-coding-agents",
		label: <Trans>Parallel agents guide</Trans>,
	},
	{
		href: "/agent-orchestration",
		label: <Trans>Orchestration guide</Trans>,
	},
	{
		href: "/community",
		label: <Trans>Community</Trans>,
	},
	{
		href: "/enterprise",
		label: <Trans>Enterprise</Trans>,
	},
	{
		href: "/changelog",
		label: <Trans>Changelog</Trans>,
	},
	{
		href: "/roadmap",
		label: <Trans>Roadmap</Trans>,
	},
];

const LEGAL_LINKS: FooterLink[] = [
	{
		href: "/security",
		label: <Trans>Security</Trans>,
	},
	{
		href: "/terms",
		label: <Trans>Terms</Trans>,
	},
	{
		href: "/privacy",
		label: <Trans>Privacy</Trans>,
	},
];

export function Footer({ locale }: { locale?: SupportedLocale }) {
	const pathname = usePathname();
	// Named local so the copyright message extracts as `{year}`, not `{0}`.
	const year = new Date().getFullYear();
	if (pathname === "/download") return null;

	return (
		<footer className="border-t border-border bg-background">
			<m.div
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ duration: 0.5 }}
				className="max-w-7xl mx-auto px-6 sm:px-8 py-14 sm:py-20"
			>
				<div className="grid grid-cols-2 gap-10 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] md:gap-x-16">
					<div className="col-span-2 flex flex-col gap-6 md:col-span-1">
						<Link
							href="/"
							className="inline-block text-foreground transition-colors hover:text-foreground/80"
						>
							<SupersetLogo />
						</Link>
						<SocialLinks className="-ml-2" />
						<a
							href={COMPANY.TRUST_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="w-max text-muted-foreground transition-colors hover:text-foreground"
						>
							<Soc2Badge size={80} />
						</a>
						<p className="text-sm text-muted-foreground">
							<Trans>© {year} Superset Inc.</Trans>
						</p>
						<FooterLanguageSwitcher locale={locale} />
					</div>

					<FooterColumn title={<Trans>Product</Trans>} links={PRODUCT_LINKS} />
					<FooterColumn title={<Trans>Company</Trans>} links={COMPANY_LINKS} />
					<FooterColumn
						title={<Trans>Resources</Trans>}
						links={RESOURCE_LINKS}
					/>
					<FooterColumn title={<Trans>Legal</Trans>} links={LEGAL_LINKS} />
				</div>
			</m.div>
		</footer>
	);
}

function FooterColumn({
	title,
	links,
}: {
	title: ReactNode;
	links: FooterLink[];
}) {
	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm font-medium text-foreground">{title}</p>
			<ul className="flex flex-col gap-3">
				{links.map((link) => (
					<li key={link.href}>
						<FooterLinkItem link={link} />
					</li>
				))}
			</ul>
		</div>
	);
}

function FooterLinkItem({ link }: { link: FooterLink }) {
	const className =
		"group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground";
	if (link.external) {
		return (
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				className={className}
			>
				{link.label}
				<ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
			</a>
		);
	}
	return (
		<Link href={link.href} className={className}>
			{link.label}
		</Link>
	);
}

function FooterLanguageSwitcher({ locale }: { locale?: SupportedLocale }) {
	const { t } = useLingui();
	const pathname = usePathname() ?? "/";
	// The server passes the URL's locale; every switch is a full navigation,
	// so the value never changes within a page's lifetime and needs no
	// subscription. The i18n fallback covers renders outside the [lang] tree.
	const current = locale ?? (i18n.locale as SupportedLocale);
	// The URL carries the locale, so applying a choice is a navigation: strip
	// any current locale prefix, then go to the same page under the new one
	// (bare for English). The cookie still records the choice for the
	// client-resolved apps (docs, web).
	const selectLocale = (next: SupportedLocale) => {
		track("language_switched", { from: current, to: next, surface: "footer" });
		const segments = pathname.split("/");
		const barePath = isSupportedLocale(segments[1] ?? "")
			? `/${segments.slice(2).join("/")}`
			: pathname;
		// biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is still not available in all supported browsers, and the page navigates immediately after this write.
		document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
		window.location.assign(
			next === "en"
				? barePath || "/"
				: `/${next}${barePath === "/" ? "" : barePath}`,
		);
	};
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger
				aria-label={`${t({
					message: "Language",
				})}: ${LOCALE_LABELS[current]}`}
				className="group flex w-max cursor-pointer items-center gap-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
			>
				<Languages aria-hidden className="size-4 shrink-0" />
				<span lang={current}>{LOCALE_LABELS[current]}</span>
				<ChevronDown
					aria-hidden
					className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="bottom"
				align="start"
				sideOffset={8}
				className="max-h-[min(38rem,var(--radix-dropdown-menu-content-available-height))] w-48 overflow-y-auto rounded-[5px] border border-border bg-background p-1 shadow-lg"
			>
				{SUPPORTED_LOCALES.map((option) => (
					<DropdownMenuItem
						key={option}
						lang={option}
						aria-current={option === current || undefined}
						onClick={() => {
							// Re-selecting the active locale would be a pointless
							// full navigation to the same URL.
							if (option !== current) selectLocale(option);
						}}
						className="flex cursor-pointer items-center justify-between gap-3 rounded-[3px] px-2.5 py-1.5 text-sm"
					>
						{LOCALE_LABELS[option]}
						{option === current && (
							<Check aria-hidden className="size-3.5 shrink-0" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
