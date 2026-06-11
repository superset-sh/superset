import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { Textarea } from "@/components/ui/textarea";

function TextareaShowcase({
	placeholder,
	editable,
	initialValue,
	numberOfLines,
}: {
	placeholder: string;
	editable: boolean;
	initialValue: string;
	numberOfLines: number;
}) {
	const [value, setValue] = useState(initialValue);
	return (
		<View className="w-full">
			<Textarea
				value={value}
				onChangeText={setValue}
				placeholder={placeholder}
				editable={editable}
				numberOfLines={numberOfLines}
			/>
		</View>
	);
}

const meta: Meta<typeof TextareaShowcase> = {
	title: "Components/Textarea",
	component: TextareaShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Multi-line text input — composer body, ask_user BottomSheetTextInput, plan-review feedback. Autogrows up to numberOfLines (max height) on native.",
			},
		},
	},
	args: {
		placeholder: "Send a message...",
		editable: true,
		initialValue: "",
		numberOfLines: 8,
	},
	argTypes: {
		placeholder: { control: "text" },
		editable: { control: "boolean" },
		initialValue: { control: "text" },
		numberOfLines: { control: { type: "number", min: 1, max: 20 } },
	},
};

export default meta;

type Story = StoryObj<typeof TextareaShowcase>;

export const Empty: Story = {};

export const WithValue: Story = {
	args: {
		initialValue:
			"Please review the chat-mobile-sprint-1 worktree and confirm the ember tokens are wired through correctly. Pay particular attention to dark-mode contrast on the assistant message bubble.",
	},
};

export const Composer: Story = {
	args: { placeholder: "Send a message..." },
	parameters: {
		docs: {
			description: {
				story:
					"Empty composer body (UC-COMP-01 §A). Real composer composes Textarea + SlashCommandNode + FileMentionNode via Tiptap WebView.",
			},
		},
	},
};

export const Disabled: Story = {
	args: { editable: false, initialValue: "Streaming — input disabled" },
	parameters: {
		docs: {
			description: { story: "Disabled state during streaming (UC-COMP-03)." },
		},
	},
};
