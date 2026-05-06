import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { ThemePreviewCard } from "@superset/ui/theme-preview-card";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import { themeListings } from "@/lib/marketplace";

export const metadata: Metadata = {
	title: "Themes",
	description:
		"Browse Superset theme files shared by the community, including GitHub Dark Colorblind, Catppuccin, Ember, and One Dark Pro.",
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/marketplace/themes`,
	},
};

export default function MarketplaceThemesPage() {
	return (
		<main className="min-h-screen">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<h1 className="mb-6 text-xl font-semibold text-foreground md:text-2xl">
					Themes
				</h1>

				<div className="grid gap-4 md:grid-cols-2">
					{themeListings.map((theme) => (
						<ThemePreviewCard
							key={theme.slug}
							name={theme.name}
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
								<Button
									asChild
									variant="outline"
									size="icon-sm"
									className="rounded-none"
								>
									<a
										href={theme.source.href}
										download
										aria-label={`Download ${theme.name}`}
										title={`Download ${theme.name}`}
									>
										<Download className="size-4" aria-hidden="true" />
									</a>
								</Button>
							}
						/>
					))}
				</div>
			</div>
		</main>
	);
}
