import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { ModelPickerOption } from "@/components/ModelPickerOption";
import { ThinkingLevelOption } from "@/components/ThinkingLevelOption";
import {
	PickerPopover,
	type PickerPopoverProps,
	type PickerPopoverSection,
} from "./PickerPopover";

const MODEL_SECTIONS: PickerPopoverSection[] = [
	{
		id: "anthropic",
		label: "Anthropic",
		items: [
			{ id: "opus-4-7", label: "Opus 4.7", badge: undefined },
			{ id: "sonnet-4-6", label: "Sonnet 4.6", badge: undefined },
			{ id: "haiku-4-5", label: "Haiku 4.5", badge: undefined },
		],
	},
	{
		id: "openai",
		label: "OpenAI",
		items: [
			{ id: "gpt-5", label: "GPT-5", badge: undefined },
			{ id: "gpt-5-codex", label: "GPT-5 Codex" },
		],
	},
];

const THINKING_SECTIONS: PickerPopoverSection[] = [
	{
		id: "levels",
		items: [
			{ id: "off", label: "Off", hint: "0 tokens" },
			{ id: "low", label: "Low", hint: "~1K tokens" },
			{ id: "medium", label: "Medium", hint: "~4K tokens" },
			{ id: "high", label: "High", hint: "~16K tokens" },
		],
	},
];

function ModelPickerHarness(
	args: Omit<PickerPopoverProps, "onChange" | "selectedId">,
) {
	const [selectedId, setSelectedId] = useState("sonnet-4-6");
	return (
		<PickerPopover
			{...args}
			selectedId={selectedId}
			onChange={setSelectedId}
			renderItem={(item, isSelected) => (
				<ModelPickerOption
					value={item.id}
					label={item.label}
					isNew={item.id === "gpt-5-codex"}
					isSelected={isSelected}
				/>
			)}
		/>
	);
}

function ThinkingPickerHarness(
	args: Omit<PickerPopoverProps, "onChange" | "selectedId">,
) {
	const [selectedId, setSelectedId] = useState("medium");
	return (
		<PickerPopover
			{...args}
			selectedId={selectedId}
			onChange={setSelectedId}
			renderItem={(item, isSelected) => (
				<ThinkingLevelOption
					value={item.id}
					label={item.label}
					hint={item.hint}
					isSelected={isSelected}
				/>
			)}
		/>
	);
}

const meta: Meta<typeof PickerPopover> = {
	title: "Organisms/PickerPopover",
	component: PickerPopover,
	parameters: {
		docs: {
			description: {
				component:
					"Generic radio picker with optional section labels. Same shell powers the ModelPicker (UC-COMP-04) and ThinkingLevelPicker (UC-COMP-05). Caller injects the option molecule via `renderItem`. Composes vendor RadioGroup + Separator.",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background justify-end p-4">
				<Story />
			</View>
		),
	],
	args: {
		open: true,
	},
	argTypes: {
		open: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof PickerPopover>;

export const ModelPicker: Story = {
	render: (args) => <ModelPickerHarness {...args} sections={MODEL_SECTIONS} />,
};

export const ThinkingLevelPicker: Story = {
	render: (args) => (
		<ThinkingPickerHarness {...args} sections={THINKING_SECTIONS} />
	),
};

export const DefaultRenderer: Story = {
	args: {
		sections: MODEL_SECTIONS,
		selectedId: "sonnet-4-6",
	},
	render: (args) => {
		const [selectedId, setSelectedId] = useState(args.selectedId);
		return (
			<PickerPopover
				{...args}
				selectedId={selectedId}
				onChange={setSelectedId}
			/>
		);
	},
};
