import { BROWSER_LOGOS } from "@superset/ui/icons/browser-icons";
import { PRESET_ICONS } from "@superset/ui/icons/preset-icons";
import Image from "next/image";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

export function IconsSection() {
	return (
		<ShowcaseSection
			id="icons"
			index="09"
			title="Icons"
			description="Bundled agent and browser logo sets"
		>
			<ComponentCard
				title="Preset icons"
				importPath="@superset/ui/icons/preset-icons"
				description="PRESET_ICONS — keyed by agent id, light/dark variants"
				span
				bleed
			>
				<div className="grid grid-cols-4 gap-3 p-4 sm:grid-cols-6">
					{Object.entries(PRESET_ICONS).map(([key, { light }]) => (
						<div
							key={key}
							className="flex flex-col items-center gap-1.5 rounded-md border border-transparent p-2 hover:border-border"
						>
							<Image src={light} alt={key} width={24} height={24} />
							<span className="truncate font-mono text-[10px] text-muted-foreground">
								{key}
							</span>
						</div>
					))}
				</div>
			</ComponentCard>

			<ComponentCard
				title="Browser icons"
				importPath="@superset/ui/icons/browser-icons"
				description="BROWSER_LOGOS — keyed by chromium-profiles browser key"
				span
				bleed
			>
				<div className="grid grid-cols-4 gap-3 p-4 sm:grid-cols-6">
					{Object.entries(BROWSER_LOGOS).map(([key, src]) => (
						<div
							key={key}
							className="flex flex-col items-center gap-1.5 rounded-md border border-transparent p-2 hover:border-border"
						>
							<Image src={src} alt={key} width={24} height={24} />
							<span className="truncate font-mono text-[10px] text-muted-foreground">
								{key}
							</span>
						</div>
					))}
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
