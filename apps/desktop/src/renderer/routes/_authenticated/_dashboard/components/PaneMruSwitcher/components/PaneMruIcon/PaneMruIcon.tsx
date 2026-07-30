import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import {
	FileText,
	GitCompareArrows,
	Globe,
	MessageSquare,
	TerminalSquare,
} from "lucide-react";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import type { PaneMruEntry } from "renderer/stores/pane-mru";

const KIND_ICONS = {
	terminal: TerminalSquare,
	chat: MessageSquare,
	browser: Globe,
	diff: GitCompareArrows,
	file: FileText,
} as const;

/**
 * Trailing icon: what is running in the pane.
 *
 * The detected agent's logo when there is one — the same treatment the tab bar
 * gives a terminal running an agent (see TerminalPaneIcon) — otherwise a glyph
 * for the pane kind. Deliberately smaller than the leading project avatar:
 * this answers "what", the avatar answers "where", and the row scans left to
 * right from place to content.
 */
export function PaneMruIcon({ entry }: { entry: PaneMruEntry }) {
	const agentIconSrc = usePresetIcon(entry.agentId ?? "");

	if (entry.agentId && agentIconSrc) {
		const label =
			(entry.agentId in AGENT_IDENTITY_LABELS &&
				AGENT_IDENTITY_LABELS[
					entry.agentId as keyof typeof AGENT_IDENTITY_LABELS
				]) ||
			entry.agentId;
		return (
			<img
				src={agentIconSrc}
				alt={label}
				title={label}
				className="size-4 shrink-0"
				draggable={false}
			/>
		);
	}

	const Icon = KIND_ICONS[entry.kind as keyof typeof KIND_ICONS] ?? FileText;
	return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}
