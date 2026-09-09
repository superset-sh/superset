import { Trans } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";
import {
	EMPTY_FONT_SETTINGS,
	useFontSettingsMutation,
} from "renderer/hooks/useFontSettingsMutation";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type FontSettingsUpdate,
	TypographySurfaceCard,
} from "./components/TypographySurfaceCard";
import { useSystemFonts } from "./hooks/useSystemFonts";

interface FontSettingSectionProps {
	showEditor?: boolean;
	showTerminal?: boolean;
}

export function FontSettingSection({
	showEditor = true,
	showTerminal = true,
}: FontSettingSectionProps) {
	const { data: fontSettings, isLoading } =
		electronTrpc.settings.getFontSettings.useQuery();
	const setFontSettings = useFontSettingsMutation();

	const { fonts: systemFonts, isLoading: fontsLoading } = useSystemFonts();

	const settings = useMemo(
		() => ({ ...EMPTY_FONT_SETTINGS, ...fontSettings }),
		[fontSettings],
	);
	const mutateSettings = useCallback(
		(input: FontSettingsUpdate) => {
			setFontSettings.mutate(input);
		},
		[setFontSettings],
	);

	return (
		<section aria-labelledby="typography-title">
			<div className="mb-3">
				<h3 id="typography-title" className="text-sm font-medium mb-1">
					<Trans>Typography</Trans>
				</h3>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Each surface has its own typography. Changes appear immediately in
						the live previews.
					</Trans>
				</p>
			</div>

			<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
				{showEditor && (
					<TypographySurfaceCard
						variant="editor"
						settings={settings}
						isLoading={isLoading}
						onChange={mutateSettings}
						fonts={systemFonts}
						fontsLoading={fontsLoading}
					/>
				)}
				{showTerminal && (
					<TypographySurfaceCard
						variant="terminal"
						settings={settings}
						isLoading={isLoading}
						onChange={mutateSettings}
						fonts={systemFonts}
						fontsLoading={fontsLoading}
					/>
				)}
			</div>
		</section>
	);
}
