import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { FontSettingSection } from "./components/FontSettingSection";
import { LanguageSection } from "./components/LanguageSection";
import { MarkdownStyleSection } from "./components/MarkdownStyleSection";
import { ThemeSection } from "./components/ThemeSection";

/**
 * Renders a list of visible sections with automatic border separators.
 * Each section is its own component that owns its data-fetching,
 * so query resolutions in one section don't re-render others.
 */
function SectionList({ children }: { children: ReactNode[] }) {
	const visibleChildren = children.filter(Boolean);
	return (
		<div className="space-y-6">
			{visibleChildren.map((child, i) => (
				<div key={(child as React.ReactElement).key ?? i}>{child}</div>
			))}
		</div>
	);
}

interface AppearanceSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function AppearanceSettings({ visibleItems }: AppearanceSettingsProps) {
	const showTheme = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_THEME,
		visibleItems,
	);
	const showMarkdown = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_MARKDOWN,
		visibleItems,
	);
	const showEditorFont = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT,
		visibleItems,
	);
	const showTerminalFont = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT,
		visibleItems,
	);
	const showCustomThemes = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_CUSTOM_THEMES,
		visibleItems,
	);
	const showLanguage = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_LANGUAGE,
		visibleItems,
	);
	const showThemeSection = showTheme || showCustomThemes;

	return (
		<div className="p-6 max-w-5xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Appearance</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>Customize how Superset looks on your device</Trans>
				</p>
			</div>

			<SectionList>
				{(showThemeSection || showLanguage || showMarkdown) && (
					<div
						key="appearance-card"
						className="rounded-lg border border-border overflow-hidden divide-y divide-border"
					>
						{showThemeSection && <ThemeSection />}
						{showLanguage && <LanguageSection />}
						{showMarkdown && <MarkdownStyleSection />}
					</div>
				)}
				{(showEditorFont || showTerminalFont) && (
					<FontSettingSection
						key="typography"
						showEditor={showEditorFont}
						showTerminal={showTerminalFont}
					/>
				)}
			</SectionList>
		</div>
	);
}
