import { useState } from "react";
import { View } from "react-native";
import {
	type SlashCommand,
	SlashCommandPopover,
} from "@/components/SlashCommandPopover";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_SLASH_COMMANDS,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";

export type ChatViewSlashMenuProps = Pick<ChatViewProps, "className"> & {
	open?: boolean;
	highlightedIndex?: number;
};

/**
 * UC-COMP-01 §C — slash-command popover floating above the composer when
 * the user types a leading "/". Composes SlashCommandPopover in the
 * `bottomOverlay` slot so it stacks above the composer but below header.
 */
export function ChatViewSlashMenu({
	open = true,
	highlightedIndex = 0,
	className,
}: ChatViewSlashMenuProps) {
	const [selected, setSelected] = useState<SlashCommand | null>(null);

	return (
		<ChatView
			className={className}
			header={{ ...MOCK_HEADER, status: "live", statusLabel: "Done" }}
			items={MOCK_THREAD_STREAMING.slice(0, 3)}
			bottomOverlay={
				<View className="px-3 pb-2">
					<SlashCommandPopover
						open={open}
						commands={MOCK_SLASH_COMMANDS}
						highlightedIndex={highlightedIndex}
						onSelect={setSelected}
					/>
				</View>
			}
			composer={{
				state: "typing",
				rowProps: {
					value: selected ? `${selected.name} ` : "/",
					placeholder: "Message Sonnet 4.6…",
					settings: MOCK_COMPOSER_SETTINGS,
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}
