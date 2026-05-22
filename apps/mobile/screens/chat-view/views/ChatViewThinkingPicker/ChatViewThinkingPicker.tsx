import { useState } from "react";
import { View } from "react-native";
import { PickerPopover } from "@/components/PickerPopover";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THINKING_PICKER_SECTIONS,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";
import type { ThinkingLevel } from "../../types";

export type ChatViewThinkingPickerProps = Pick<ChatViewProps, "className"> & {
	open?: boolean;
	defaultLevel?: ThinkingLevel;
};

/**
 * UC-COMP-05 §A — thinking-level picker popover. Five levels (off · low ·
 * medium · high · xhigh) with token-budget hints per row. Composes
 * PickerPopover with the default row renderer.
 */
export function ChatViewThinkingPicker({
	open = true,
	defaultLevel = "low",
	className,
}: ChatViewThinkingPickerProps) {
	const [selected, setSelected] = useState<string>(defaultLevel);

	return (
		<ChatView
			className={className}
			header={{ ...MOCK_HEADER, status: "live", statusLabel: "Done" }}
			items={MOCK_THREAD_STREAMING.slice(0, 3)}
			bottomOverlay={
				<View className="px-3 pb-2">
					<PickerPopover
						open={open}
						sections={MOCK_THINKING_PICKER_SECTIONS}
						selectedId={selected}
						onChange={setSelected}
					/>
				</View>
			}
			composer={{
				state: "idle",
				rowProps: {
					settings: {
						...MOCK_COMPOSER_SETTINGS,
						thinkingLevel: selected as ThinkingLevel,
						isOpen: open,
					},
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}
