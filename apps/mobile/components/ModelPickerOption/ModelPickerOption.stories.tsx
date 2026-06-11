import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { ModelPickerOption } from "./ModelPickerOption";

const meta: Meta<typeof ModelPickerOption> = {
	title: "Molecules/ModelPickerOption",
	component: ModelPickerOption,
	parameters: {
		docs: {
			description: {
				component:
					"Single selectable row inside the model-picker popover. Radio + name + optional NEW badge. 2 variants — default (accent bg) · featured (ember-tinted). Composes vendor RadioGroupItem + Badge. Must be rendered inside a <RadioGroup>.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		value: "sonnet-4-6",
		label: "Claude Sonnet 4.6",
		isNew: false,
		variant: "default",
		isSelected: false,
		disabled: false,
	},
	argTypes: {
		value: { control: "text", description: "Unique radio value" },
		label: { control: "text", description: "Model display name" },
		isNew: { control: "boolean", description: "Show trailing NEW badge" },
		variant: {
			control: { type: "select" },
			options: ["default", "featured"],
			description: "default (accent selected bg) · featured (ember-tinted)",
		},
		isSelected: { control: "boolean", description: "Selection state" },
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof ModelPickerOption>;

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
				<ModelPickerOption {...args} />
			</RadioGroup>
		</Wrap>
	),
};

export const Selected: Story = {
	args: { isSelected: true },
	render: (args) => (
		<Wrap>
			<RadioGroup value={args.value} onValueChange={() => {}}>
				<ModelPickerOption {...args} />
			</RadioGroup>
		</Wrap>
	),
};

export const NewBadge: Story = {
	args: { label: "Claude Opus 4.7", isNew: true, isSelected: true },
	render: (args) => (
		<Wrap>
			<RadioGroup value={args.value} onValueChange={() => {}}>
				<ModelPickerOption {...args} />
			</RadioGroup>
		</Wrap>
	),
};

export const FeaturedVariant: Story = {
	args: { variant: "featured", isSelected: true },
	render: (args) => (
		<Wrap>
			<RadioGroup value={args.value} onValueChange={() => {}}>
				<ModelPickerOption {...args} />
			</RadioGroup>
		</Wrap>
	),
};

export const VendorGroupList: Story = {
	render: () => {
		const [selected, setSelected] = useState("sonnet-4-6");
		return (
			<Wrap>
				<RadioGroup value={selected} onValueChange={setSelected}>
					<Text
						variant="small"
						className="px-4 py-2 font-mono uppercase tracking-wider text-muted-foreground"
					>
						Anthropic
					</Text>
					<ModelPickerOption
						value="opus-4-7"
						label="Claude Opus 4.7"
						isNew
						isSelected={selected === "opus-4-7"}
						onPress={() => setSelected("opus-4-7")}
					/>
					<ModelPickerOption
						value="sonnet-4-6"
						label="Claude Sonnet 4.6"
						variant="featured"
						isSelected={selected === "sonnet-4-6"}
						onPress={() => setSelected("sonnet-4-6")}
					/>
					<ModelPickerOption
						value="haiku-4-5"
						label="Claude Haiku 4.5"
						isSelected={selected === "haiku-4-5"}
						onPress={() => setSelected("haiku-4-5")}
					/>
					<Text
						variant="small"
						className="px-4 py-2 font-mono uppercase tracking-wider text-muted-foreground"
					>
						OpenAI
					</Text>
					<ModelPickerOption
						value="gpt-5"
						label="GPT-5"
						isSelected={selected === "gpt-5"}
						onPress={() => setSelected("gpt-5")}
					/>
				</RadioGroup>
			</Wrap>
		);
	},
};
