import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { RadioGroup } from "@/components/ui/radio-group";
import { ThinkingLevelOption } from "./ThinkingLevelOption";

const meta: Meta<typeof ThinkingLevelOption> = {
	title: "Molecules/ThinkingLevelOption",
	component: ThinkingLevelOption,
	parameters: {
		docs: {
			description: {
				component:
					"Single row in the thinking-level / permission-mode picker popover. Radio + label + right-aligned mono hint. Hint text is included in accessibilityLabel. Must be rendered inside a vendor <RadioGroup>.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		value: "low",
		label: "low",
		hint: "~1K tokens",
		kind: "thinking",
		isSelected: false,
		disabled: false,
	},
	argTypes: {
		value: { control: "text" },
		label: { control: "text" },
		hint: { control: "text", description: "Right-aligned mono hint" },
		kind: {
			control: { type: "select" },
			options: ["thinking", "permission"],
		},
		isSelected: { control: "boolean" },
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof ThinkingLevelOption>;

function Wrap({ children }: { children: React.ReactNode }) {
	return (
		<View className="bg-popover border border-border rounded-lg max-w-sm w-full overflow-hidden p-2">
			{children}
		</View>
	);
}

export const Default: Story = {
	render: (args) => (
		<Wrap>
			<RadioGroup value={args.value} onValueChange={() => {}}>
				<ThinkingLevelOption {...args} />
			</RadioGroup>
		</Wrap>
	),
};

export const Selected: Story = {
	args: { isSelected: true },
	render: (args) => (
		<Wrap>
			<RadioGroup value={args.value} onValueChange={() => {}}>
				<ThinkingLevelOption {...args} />
			</RadioGroup>
		</Wrap>
	),
};

export const ThinkingLevels: Story = {
	render: () => {
		const [selected, setSelected] = useState("low");
		const items = [
			{ value: "off", label: "off", hint: "no thinking" },
			{ value: "low", label: "low", hint: "~1K tokens" },
			{ value: "medium", label: "medium", hint: "~5K tokens" },
			{ value: "high", label: "high", hint: "~10K tokens" },
			{ value: "xhigh", label: "xhigh", hint: "~25K tokens" },
		];
		return (
			<Wrap>
				<RadioGroup value={selected} onValueChange={setSelected}>
					{items.map((item) => (
						<ThinkingLevelOption
							key={item.value}
							{...item}
							isSelected={selected === item.value}
							onPress={() => setSelected(item.value)}
						/>
					))}
				</RadioGroup>
			</Wrap>
		);
	},
};

export const PermissionModes: Story = {
	render: () => {
		const [selected, setSelected] = useState("default");
		const items = [
			{ value: "default", label: "default", hint: "Ask for risky ops" },
			{ value: "acceptEdits", label: "acceptEdits", hint: "Auto-accept edits" },
			{ value: "plan", label: "plan", hint: "Plan first, then ask" },
			{
				value: "bypassPermissions",
				label: "bypassPermissions",
				hint: "No prompts",
			},
		];
		return (
			<Wrap>
				<RadioGroup value={selected} onValueChange={setSelected}>
					{items.map((item) => (
						<ThinkingLevelOption
							key={item.value}
							{...item}
							kind="permission"
							isSelected={selected === item.value}
							onPress={() => setSelected(item.value)}
						/>
					))}
				</RadioGroup>
			</Wrap>
		);
	},
};
