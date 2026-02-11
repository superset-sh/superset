import type { ReactNode } from "react";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { AutoApplyPresetSetting } from "./components/AutoApplyPresetSetting";
import { LinkBehaviorSetting } from "./components/LinkBehaviorSetting";
import { PresetsSection } from "./components/PresetsSection";
import { SessionsSection } from "./components/SessionsSection";

interface TerminalSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

/**
 * Renders a list of visible sections with automatic border separators.
 * Each section is its own component that owns its data-fetching,
 * so query resolutions in one section don't re-render others.
 */
function SectionList({ children }: { children: ReactNode[] }) {
	const visibleChildren = children.filter(Boolean);
	return (
		<div>
			{visibleChildren.map((child, i) => (
				<div
					key={(child as React.ReactElement).key ?? i}
					className={i > 0 ? "pt-6 border-t mt-6" : ""}
				>
					{child}
				</div>
			))}
		</div>
	);
}

export function TerminalSettings({ visibleItems }: TerminalSettingsProps) {
	const showPresets = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_PRESETS,
		visibleItems,
	);
	const showQuickAdd = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_QUICK_ADD,
		visibleItems,
	);
	const showAutoApplyPreset = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_AUTO_APPLY_PRESET,
		visibleItems,
	);
	const showLinkBehavior = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_LINK_BEHAVIOR,
		visibleItems,
	);
	const showSessions = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_SESSIONS,
		visibleItems,
	);

	return (
		<div className="p-6 max-w-7xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Terminal</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure terminal behavior and presets
				</p>
			</div>

			<SectionList>
				{(showPresets || showQuickAdd) && (
					<PresetsSection
						key="presets"
						showPresets={showPresets}
						showQuickAdd={showQuickAdd}
					/>
				)}
				{showAutoApplyPreset && <AutoApplyPresetSetting key="auto-apply" />}
				{showLinkBehavior && <LinkBehaviorSetting key="link-behavior" />}
				{showSessions && <SessionsSection key="sessions" />}
			</SectionList>
		</div>
	);
}
