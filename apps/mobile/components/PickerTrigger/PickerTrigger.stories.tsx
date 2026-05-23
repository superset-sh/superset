import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { PickerTrigger } from "./PickerTrigger";

const meta: Meta<typeof PickerTrigger> = {
	title: "Molecules/PickerTrigger",
	component: PickerTrigger,
	parameters: {
		docs: {
			description: {
				component:
					"Pill-shaped trigger button used by the composer toolbar — opens a picker popover for model / thinking-level / permission-mode selection. Three kinds (model · thinking · permission) × two sizes (sm 20pt · md 28pt default). `isOpen` rotates the chevron + swaps background to accent.",
			},
		},
		layout: "centered",
	},
	args: {
		kind: "model",
		value: "Sonnet 4.6",
		size: "md",
		isOpen: false,
		disabled: false,
	},
	argTypes: {
		kind: {
			control: { type: "select" },
			options: ["model", "thinking", "permission"],
			description:
				"model (sparkles, no prefix) · thinking (zap, 'Thinking:') · permission (shield, 'Permission:')",
		},
		value: { control: "text", description: "Current selected value" },
		size: {
			control: { type: "select" },
			options: ["sm", "md"],
			description: "sm=20pt · md=28pt (default)",
		},
		isOpen: {
			control: "boolean",
			description: "Open state — bg→accent + chevron rotates 180°",
		},
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof PickerTrigger>;

export const Model: Story = {};

export const Thinking: Story = {
	args: { kind: "thinking", value: "low" },
};

export const Permission: Story = {
	args: { kind: "permission", value: "default" },
};

export const Open: Story = {
	args: { isOpen: true },
};

export const Small: Story = {
	args: { size: "sm" },
};

export const Disabled: Story = {
	args: { disabled: true },
};

export const ComposerToolbarRow: Story = {
	render: () => (
		<View className="flex-row gap-2 p-4">
			<PickerTrigger kind="model" value="Sonnet 4.6" />
			<PickerTrigger kind="thinking" value="low" />
			<PickerTrigger kind="permission" value="default" />
		</View>
	),
};
