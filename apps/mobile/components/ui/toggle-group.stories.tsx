import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { Text } from "@/components/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function ToggleGroupShowcase({ type }: { type: "single" | "multiple" }) {
	const [single, setSingle] = useState<string | undefined>("medium");
	const [multi, setMulti] = useState<string[]>(["streaming"]);
	if (type === "single") {
		return (
			<ToggleGroup type="single" value={single} onValueChange={setSingle}>
				<ToggleGroupItem value="low" aria-label="Low">
					<Text>Low</Text>
				</ToggleGroupItem>
				<ToggleGroupItem value="medium" aria-label="Medium">
					<Text>Medium</Text>
				</ToggleGroupItem>
				<ToggleGroupItem value="high" aria-label="High">
					<Text>High</Text>
				</ToggleGroupItem>
			</ToggleGroup>
		);
	}
	return (
		<ToggleGroup type="multiple" value={multi} onValueChange={setMulti}>
			<ToggleGroupItem value="streaming" aria-label="Streaming">
				<Text>Streaming</Text>
			</ToggleGroupItem>
			<ToggleGroupItem value="pause" aria-label="Pause pending">
				<Text>Pause</Text>
			</ToggleGroupItem>
			<ToggleGroupItem value="idle" aria-label="Idle">
				<Text>Idle</Text>
			</ToggleGroupItem>
		</ToggleGroup>
	);
}

const meta: Meta<typeof ToggleGroupShowcase> = {
	title: "Components/ToggleGroup",
	component: ToggleGroupShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Segmented control. Single (radio-style) or multiple (checkbox-style). Status filter in SessionFilterSheet uses this pattern.",
			},
		},
	},
	args: { type: "single" },
	argTypes: {
		type: { control: { type: "select" }, options: ["single", "multiple"] },
	},
};

export default meta;

type Story = StoryObj<typeof ToggleGroupShowcase>;

export const Single: Story = {};
export const Multiple: Story = { args: { type: "multiple" } };
