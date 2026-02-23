import type React from "react";
import { useCallback, useMemo, useState } from "react";

export interface ChatPickerPanelState {
	open: boolean;
	setOpen: React.Dispatch<React.SetStateAction<boolean>>;
	openPanel: () => void;
}

export interface ChatPickerState {
	model: ChatPickerPanelState;
	mcp: ChatPickerPanelState;
}

export function useChatPickerState(): ChatPickerState {
	const [modelOpen, setModelOpen] = useState(false);
	const [mcpOpen, setMcpOpen] = useState(false);

	const openModelPanel = useCallback(() => {
		setModelOpen(true);
	}, []);

	const openMcpPanel = useCallback(() => {
		setMcpOpen(true);
	}, []);

	return useMemo(
		() => ({
			model: {
				open: modelOpen,
				setOpen: setModelOpen,
				openPanel: openModelPanel,
			},
			mcp: {
				open: mcpOpen,
				setOpen: setMcpOpen,
				openPanel: openMcpPanel,
			},
		}),
		[modelOpen, openModelPanel, mcpOpen, openMcpPanel],
	);
}
