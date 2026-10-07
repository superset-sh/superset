import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Slider } from "@superset/ui/slider";
import { Switch } from "@superset/ui/switch";
import { useEffect, useState } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import type { ProjectAccentSettings } from "renderer/lib/project-accent";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

type SurfaceKey = keyof Pick<
	ProjectAccentSettings,
	"tabBar" | "paneHeaders" | "terminal"
>;

export function ProjectAccentSection() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const { preferences, setProjectAccent } = useV2UserPreferences();
	const accent = preferences.projectAccent;
	const [intensity, setIntensity] = useState(accent.intensity);
	useEffect(() => setIntensity(accent.intensity), [accent.intensity]);

	const surfaces: { key: SurfaceKey; label: string; description: string }[] = [
		{
			key: "tabBar",
			label: t({ message: "Tab bar" }),
			description: t({
				message: "Tint the tab strip and mark the active tab",
			}),
		},
		{
			key: "paneHeaders",
			label: t({ message: "Pane headers" }),
			description: t({ message: "Tint the header above each pane" }),
		},
		{
			key: "terminal",
			label: t({ message: "Terminal background" }),
			description: t({
				message: "Blend the color into the terminal background",
			}),
		},
	];

	return (
		<div className="rounded-lg border border-border divide-y divide-border">
			<div className="flex items-center justify-between gap-6 p-4">
				<div className="min-w-0 flex-1 space-y-0.5">
					<Label
						htmlFor="project-accent-enabled"
						className="text-sm font-medium"
					>
						<HighlightText
							text={t({ message: "Project colors in workspaces" })}
							query={searchQuery}
						/>
					</Label>
					<p className="text-xs text-muted-foreground">
						<HighlightText
							text={t({
								message:
									"Tint each workspace with its project's color. Pick a color by right-clicking a project in the sidebar.",
							})}
							query={searchQuery}
						/>
					</p>
				</div>
				<Switch
					id="project-accent-enabled"
					checked={accent.enabled}
					onCheckedChange={(enabled) => setProjectAccent({ enabled })}
				/>
			</div>
			{accent.enabled && (
				<>
					{surfaces.map((surface) => (
						<div
							key={surface.key}
							className="flex items-center justify-between gap-6 px-4 py-3"
						>
							<div className="min-w-0 flex-1 space-y-0.5">
								<Label
									htmlFor={`project-accent-${surface.key}`}
									className="text-sm"
								>
									{surface.label}
								</Label>
								<p className="text-xs text-muted-foreground">
									{surface.description}
								</p>
							</div>
							<Switch
								id={`project-accent-${surface.key}`}
								checked={accent[surface.key]}
								onCheckedChange={(checked) =>
									setProjectAccent({ [surface.key]: checked })
								}
							/>
						</div>
					))}
					<div className="flex items-center justify-between gap-6 px-4 py-3">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label htmlFor="project-accent-intensity" className="text-sm">
								<Trans>Intensity</Trans>
							</Label>
							<p className="text-xs text-muted-foreground">
								<Trans>How strongly the color tints each surface</Trans>
							</p>
						</div>
						<div className="flex w-56 items-center gap-3">
							<Slider
								id="project-accent-intensity"
								aria-label={t({ message: "Intensity" })}
								min={0}
								max={100}
								step={5}
								value={[intensity]}
								onValueChange={([value]) => {
									if (value !== undefined) setIntensity(value);
								}}
								onValueCommit={([value]) => {
									if (value !== undefined) {
										setProjectAccent({ intensity: value });
									}
								}}
							/>
							<span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
								{intensity}%
							</span>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
