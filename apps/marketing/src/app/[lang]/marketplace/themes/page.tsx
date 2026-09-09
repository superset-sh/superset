import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import { ThemePreviewCard } from "@superset/ui/theme-preview-card";
import { ArrowUpRight, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { themeListings } from "@/lib/marketplace";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	return {
		title: i18n._(
			msg({
				message: "Themes",
			}),
		),
		description: i18n._(
			msg({
				message:
					"Browse Superset theme files shared by the community, including GitHub Dark Colorblind, Catppuccin, Ember, and One Dark Pro.",
			}),
		),
		alternates: localizedAlternates(lang, "/marketplace/themes"),
	};
}

export default async function MarketplaceThemesPage() {
	await initServerI18n();

	const { t } = useLingui();

	return (
		<main className="min-h-screen">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<h1 className="mb-6 text-xl font-semibold text-foreground md:text-2xl">
					<Trans>Themes</Trans>
				</h1>

				<div className="grid gap-4 md:grid-cols-2">
					{themeListings.map(({ name, ...theme }) => (
						<ThemePreviewCard
							key={theme.slug}
							name={name}
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
							footerRight={
								<div className="flex items-center gap-1.5">
									<Button
										asChild
										variant="outline"
										size="icon-sm"
										className="rounded-none"
									>
										<Link
											href={`/marketplace/themes/${theme.slug}`}
											aria-label={t({
												message: `View ${name}`,
											})}
											title={t({
												message: `View ${name}`,
											})}
										>
											<ArrowUpRight className="size-4" aria-hidden="true" />
										</Link>
									</Button>
									<Button
										asChild
										variant="outline"
										size="icon-sm"
										className="rounded-none"
									>
										<a
											href={theme.source.href}
											download
											aria-label={t({
												message: `Download ${name}`,
											})}
											title={t({
												message: `Download ${name}`,
											})}
										>
											<Download className="size-4" aria-hidden="true" />
										</a>
									</Button>
								</div>
							}
						/>
					))}
				</div>
			</div>
		</main>
	);
}
