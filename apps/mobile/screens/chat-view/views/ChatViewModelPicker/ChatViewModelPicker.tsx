import { useState } from "react";
import { View } from "react-native";
import {
	PickerPopover,
	type PickerPopoverItem,
} from "@/components/PickerPopover";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_MODEL_PICKER_SECTIONS,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";

export type ChatViewModelPickerProps = Pick<ChatViewProps, "className"> & {
	open?: boolean;
	defaultModelId?: string;
};

const NEW_BADGE_IDS = new Set(["opus-4-7", "gpt-5"]);

function renderModelRow(item: PickerPopoverItem, isSelected: boolean) {
	return (
		<View
			className={`flex-row items-center justify-between px-4 py-3 min-h-touch-min ${
				isSelected ? "bg-accent" : ""
			}`}
		>
			<View className="flex-1 gap-0.5">
				<Text className="text-foreground">{item.label}</Text>
				{item.hint ? (
					<Text variant="muted" className="text-xs">
						{item.hint}
					</Text>
				) : null}
			</View>
			{NEW_BADGE_IDS.has(item.id) ? (
				<Badge variant="default">
					<Text className="text-[10px] font-mono uppercase">New</Text>
				</Badge>
			) : null}
		</View>
	);
}

/**
 * UC-COMP-04 §A — model picker popover floating above the composer with
 * Anthropic + OpenAI sections, radios per model row, "new" badge on the
 * most recent option per section. Composes PickerPopover.
 */
export function ChatViewModelPicker({
	open = true,
	defaultModelId = "sonnet-4-6",
	className,
}: ChatViewModelPickerProps) {
	const [selected, setSelected] = useState(defaultModelId);

	return (
		<ChatView
			className={className}
			header={{ ...MOCK_HEADER, status: "live", statusLabel: "Done" }}
			items={MOCK_THREAD_STREAMING.slice(0, 3)}
			bottomOverlay={
				<View className="px-3 pb-2">
					<PickerPopover
						open={open}
						sections={MOCK_MODEL_PICKER_SECTIONS}
						selectedId={selected}
						onChange={setSelected}
						renderItem={renderModelRow}
					/>
				</View>
			}
			composer={{
				state: "idle",
				rowProps: {
					settings: {
						...MOCK_COMPOSER_SETTINGS,
						modelName: selected,
						isOpen: open,
					},
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}
