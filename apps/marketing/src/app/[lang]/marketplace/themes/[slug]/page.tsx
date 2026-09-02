import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { ThemePreviewCard } from "@superset/ui/theme-preview-card";
import { ArrowLeft, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { BreadcrumbJsonLd, JsonLdScript } from "@/components/JsonLd";
import {
	getAllThemeSlugs,
	getThemeListing,
	themeListings,
} from "@/lib/marketplace";

interface PageProps {
	params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
	return getAllThemeSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const lang = await initServerI18n();
	const { slug } = await params;
	const theme = getThemeListing(slug);

	if (!theme) {
		return { title: "Theme not found" };
	}

	const kind = theme.type === "dark" ? "Dark" : "Light";
	const title = `${theme.name}: ${kind} Theme for Superset`;
	const description = `${theme.description} Download the ${theme.name} ${kind.toLowerCase()} theme for Superset, the local-first AI coding workspace.`;
	const url = localeUrl(lang, `/marketplace/themes/${theme.slug}`);

	return {
		title,
		description,
		keywords: [
			`${theme.name} theme`,
			`${theme.name} superset theme`,
			`superset ${theme.type} theme`,
			...theme.tags,
		],
		alternates: localizedAlternates(lang, `/marketplace/themes/${theme.slug}`),
		openGraph: { title, description, url, type: "website" },
		twitter: { card: "summary", title, description },
	};
}

export default async function ThemeDetailPage({ params }: PageProps) {
	await initServerI18n();

	const { slug } = await params;
	const theme = getThemeListing(slug);

	if (!theme) {
		notFound();
	}

	const url = `${COMPANY.MARKETING_URL}/marketplace/themes/${theme.slug}`;
	const kind = theme.type === "dark" ? "Dark" : "Light";
	const { name, author, submittedBy, addedOn } = theme;

	// `kind` stays English for the JSON-LD genre; these are the display copies.
	const kindLabel =
		theme.type === "dark"
			? i18n._(msg({ message: "Dark" }))
			: i18n._(
					msg({
						message: "Light",
					}),
				);
	const kindLower =
		theme.type === "dark"
			? i18n._(
					msg({
						message: "dark",
					}),
				)
			: i18n._(
					msg({
						message: "light",
					}),
				);

	const uiColors = [
		{
			key: "background",
			label: msg({
				message: "Background",
			}),
			value: theme.ui.background,
		},
		{
			key: "foreground",
			label: msg({
				message: "Foreground",
			}),
			value: theme.ui.foreground,
		},
		{
			key: "card",
			label: msg({
				message: "Card",
			}),
			value: theme.ui.card,
		},
		{
			key: "primary",
			label: msg({
				message: "Primary",
			}),
			value: theme.ui.primary,
		},
		{
			key: "accent",
			label: msg({
				message: "Accent",
			}),
			value: theme.ui.accent,
		},
		{
			key: "border",
			label: msg({
				message: "Border",
			}),
			value: theme.ui.border,
		},
		{
			key: "sidebar",
			label: msg({
				message: "Sidebar",
			}),
			value: theme.ui.sidebar,
		},
	];

	const terminalColors = [
		{
			key: "red",
			label: msg({
				message: "Red",
			}),
			value: theme.terminal.red,
		},
		{
			key: "green",
			label: msg({
				message: "Green",
			}),
			value: theme.terminal.green,
		},
		{
			key: "yellow",
			label: msg({
				message: "Yellow",
			}),
			value: theme.terminal.yellow,
		},
		{
			key: "blue",
			label: msg({
				message: "Blue",
			}),
			value: theme.terminal.blue,
		},
		{
			key: "magenta",
			label: msg({
				message: "Magenta",
			}),
			value: theme.terminal.magenta,
		},
		{
			key: "cyan",
			label: msg({
				message: "Cyan",
			}),
			value: theme.terminal.cyan,
		},
		{
			key: "cursor",
			label: msg({
				message: "Cursor",
			}),
			value: theme.terminal.cursor,
		},
	];

	const related = themeListings
		.filter((t) => t.slug !== theme.slug && t.type === theme.type)
		.slice(0, 4);

	const creativeWork = {
		"@context": "https://schema.org",
		"@type": "CreativeWork",
		name: `${theme.name} Theme for Superset`,
		description: theme.description,
		url,
		genre: `${kind} color theme`,
		author: { "@type": "Person", name: theme.author },
		keywords: theme.tags.join(", "),
		isAccessibleForFree: true,
		license: "https://github.com/superset-sh/superset",
	};

	return (
		<main className="min-h-screen">
			<BreadcrumbJsonLd
				items={[
					{ name: "Marketplace", url: `${COMPANY.MARKETING_URL}/marketplace` },
					{
						name: "Themes",
						url: `${COMPANY.MARKETING_URL}/marketplace/themes`,
					},
					{ name: theme.name, url },
				]}
			/>
			<JsonLdScript schema={creativeWork} />

			<div className="mx-auto max-w-4xl px-6 py-10">
				<Link
					href="/marketplace/themes"
					className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="size-4" aria-hidden="true" />
					<Trans>All themes</Trans>
				</Link>

				<div className="flex flex-col gap-8 md:flex-row md:items-start">
					<div className="w-full max-w-sm shrink-0">
						<ThemePreviewCard
							name={theme.name}
							subtitle={i18n._({
								...msg({
									message: "{kind} · by {author}",
								}),
								values: { kind: kindLabel, author },
							})}
							backgroundColor={theme.terminal.background}
							foregroundColor={theme.terminal.foreground}
							promptColor={theme.terminal.green}
							infoColor={theme.terminal.cyan}
							readyColor={theme.terminal.yellow}
							palette={[
								theme.terminal.red,
								theme.terminal.green,
								theme.terminal.yellow,
								theme.terminal.blue,
								theme.terminal.magenta,
								theme.terminal.cyan,
							]}
							className="rounded-none border-border"
							paletteItemClassName="rounded-none"
						/>
					</div>

					<div className="min-w-0 flex-1">
						<span className="inline-block rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
							<Trans>{kindLabel} theme</Trans>
						</span>
						<h1 className="mt-3 text-2xl font-semibold text-foreground md:text-3xl">
							{theme.name}
						</h1>
						<p className="mt-3 text-muted-foreground">{theme.description}</p>

						<div className="mt-5 flex flex-wrap items-center gap-3">
							<Button asChild className="rounded-none">
								<a href={theme.source.href} download>
									<Download className="size-4" aria-hidden="true" />
									<Trans>Download theme file</Trans>
								</a>
							</Button>
							<span className="text-xs text-muted-foreground">
								<Trans>
									by {author} · submitted by {submittedBy} · added {addedOn}
								</Trans>
							</span>
						</div>

						{theme.tags.length > 0 ? (
							<div className="mt-4 flex flex-wrap gap-2">
								{theme.tags.map((tag) => (
									<span
										key={tag}
										className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted-foreground"
									>
										{tag}
									</span>
								))}
							</div>
						) : null}
					</div>
				</div>

				<section className="mt-12">
					<h2 className="text-lg font-semibold text-foreground">
						<Trans>Palette</Trans>
					</h2>
					<div className="mt-4 grid gap-8 sm:grid-cols-2">
						<div>
							<h3 className="mb-3 text-sm font-medium text-muted-foreground">
								<Trans>Interface</Trans>
							</h3>
							<ul className="space-y-2">
								{uiColors.map((c) => (
									<li key={c.key} className="flex items-center gap-3">
										<span
											className="size-6 rounded-sm border border-border"
											style={{ backgroundColor: c.value }}
											aria-hidden="true"
										/>
										<span className="text-sm text-foreground">
											{i18n._(c.label)}
										</span>
										<span className="ml-auto font-mono text-xs text-muted-foreground uppercase">
											{c.value}
										</span>
									</li>
								))}
							</ul>
						</div>
						<div>
							<h3 className="mb-3 text-sm font-medium text-muted-foreground">
								<Trans>Terminal</Trans>
							</h3>
							<ul className="space-y-2">
								{terminalColors.map((c) => (
									<li key={c.key} className="flex items-center gap-3">
										<span
											className="size-6 rounded-sm border border-border"
											style={{ backgroundColor: c.value }}
											aria-hidden="true"
										/>
										<span className="text-sm text-foreground">
											{i18n._(c.label)}
										</span>
										<span className="ml-auto font-mono text-xs text-muted-foreground uppercase">
											{c.value}
										</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>

				<section className="mt-12">
					<h2 className="text-lg font-semibold text-foreground">
						<Trans>How to install {name} in Superset</Trans>
					</h2>
					<ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
						<li>
							<Trans>Download the theme file above.</Trans>
						</li>
						<li>
							<Trans>
								In the Superset desktop app, open{" "}
								<span className="text-foreground">
									Settings → Appearance → Theme
								</span>
								.
							</Trans>
						</li>
						<li>
							<Trans>
								Click <span className="text-foreground">Import Theme</span> and
								select the downloaded file.
							</Trans>
						</li>
						<li>
							<Trans>Pick {name} from the theme grid to apply it.</Trans>
						</li>
					</ol>
					<p className="mt-4 text-sm text-muted-foreground">
						<Trans>
							See the{" "}
							<a
								href={`${COMPANY.DOCS_URL}/custom-themes`}
								className="text-foreground underline underline-offset-4"
							>
								custom themes guide
							</a>{" "}
							to edit a theme or build your own.
						</Trans>
					</p>
				</section>

				{related.length > 0 ? (
					<section className="mt-12">
						<h2 className="text-lg font-semibold text-foreground">
							<Trans>More {kindLower} themes</Trans>
						</h2>
						<div className="mt-4 flex flex-wrap gap-2">
							{related.map((t) => (
								<Link
									key={t.slug}
									href={`/marketplace/themes/${t.slug}`}
									className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
								>
									{t.name}
								</Link>
							))}
						</div>
					</section>
				) : null}
			</div>
		</main>
	);
}
