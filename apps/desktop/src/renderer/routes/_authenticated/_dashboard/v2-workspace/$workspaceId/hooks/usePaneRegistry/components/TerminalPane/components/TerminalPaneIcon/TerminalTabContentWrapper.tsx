import type { Tab } from "@superset/panes";
import type { ReactNode } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useClaudeTabDecorationEnabled } from "renderer/stores/claude-tab-decoration";
import { resolveClaudeAgentAccentBackground } from "shared/constants/claude-agent-colors";
import type { PaneViewerData } from "../../../../../../types";
import { getSingleTerminalPane } from "./renderTerminalTabIcon";

interface TerminalTabContentWrapperProps {
	workspaceId: string;
	terminalId: string;
	children: ReactNode;
}

function TerminalTabContentWrapper({
	workspaceId,
	terminalId,
	children,
}: TerminalTabContentWrapperProps) {
	const decorationEnabled = useClaudeTabDecorationEnabled();
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const background = decorationEnabled
		? resolveClaudeAgentAccentBackground(binding?.color)
		: undefined;
	if (!background) return children;

	return (
		<span
			className="flex h-full w-full items-center rounded-[5px] p-[3px]"
			style={{ backgroundColor: background }}
		>
			{children}
		</span>
	);
}

/**
 * Tints a single-pane terminal tab's full width (icon, title, and the
 * accessory/close-button area) with its agent's session color (e.g. Claude
 * Code's `/color`) as a background, instead of the small corner dot
 * `TerminalPaneIcon` shows elsewhere.
 */
export function createRenderTerminalTabContentWrapper(workspaceId: string) {
	return function renderTerminalTabContentWrapper(
		tab: Tab<PaneViewerData>,
		children: ReactNode,
	): ReactNode {
		const terminal = getSingleTerminalPane(tab);
		if (!terminal) return children;
		return (
			<TerminalTabContentWrapper
				workspaceId={workspaceId}
				terminalId={terminal.terminalId}
			>
				{children}
			</TerminalTabContentWrapper>
		);
	};
}
