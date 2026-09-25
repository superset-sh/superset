import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { BackgroundTerminalsSetting } from "./components/BackgroundTerminalsSetting";
import { CopyOnSelectSetting } from "./components/CopyOnSelectSetting";
import { PresetsSection } from "./components/PresetsSection";
import { SessionsSection } from "./components/SessionsSection";

interface TerminalSettingsProps {
	visibleItems?: SettingItemId[] | null;
	editingPresetId?: string | null;
	onEditingPresetIdChange?: (presetId: string | null) => void;
	pendingCreateProjectId?: string | null;
	onPendingCreateProjectIdChange?: (projectId: string | null) => void;
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

export function TerminalSettings({
	visibleItems,
	editingPresetId,
	onEditingPresetIdChange,
	pendingCreateProjectId,
	onPendingCreateProjectIdChange,
}: TerminalSettingsProps) {
	const showPresets = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_PRESETS,
		visibleItems,
	);
	const showQuickAdd = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_QUICK_ADD,
		visibleItems,
	);
	const showSessions = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_SESSIONS,
		visibleItems,
	);
	const showBackgroundLimit = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_BACKGROUND_LIMIT,
		visibleItems,
	);
	const showCopyOnSelect = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_COPY_ON_SELECT,
		visibleItems,
	);

	return (
		<div className="p-6 max-w-6xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Terminal</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>
						Configure terminal behavior and reusable terminal scripts
					</Trans>
				</p>
			</div>

			<SectionList>
				{(showPresets || showQuickAdd) && (
					<PresetsSection
						key="presets"
						showPresets={showPresets}
						showQuickAdd={showQuickAdd}
						editingPresetId={editingPresetId}
						onEditingPresetIdChange={onEditingPresetIdChange}
						pendingCreateProjectId={pendingCreateProjectId}
						onPendingCreateProjectIdChange={onPendingCreateProjectIdChange}
					/>
				)}
				{showBackgroundLimit && (
					<BackgroundTerminalsSetting key="background-limit" />
				)}
				{showCopyOnSelect && <CopyOnSelectSetting key="copy-on-select" />}
				{showSessions && <SessionsSection key="sessions" />}
			</SectionList>
		</div>
	);
}
