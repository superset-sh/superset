import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/Collapsible",
	component: Collapsible,
	render: () => (
		<Collapsible className="w-64 gap-2">
			<CollapsibleTrigger asChild>
				<Button variant="outline">
					<Text>Toggle details</Text>
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<View className="bg-muted gap-2 rounded-md p-3">
					<Text>@radix-ui/primitives</Text>
					<Text>@radix-ui/colors</Text>
					<Text>@stitches/react</Text>
				</View>
			</CollapsibleContent>
		</Collapsible>
	),
} satisfies Meta<typeof Collapsible>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const DefaultOpen: Story = {
	render: () => (
		<Collapsible className="w-64 gap-2" defaultOpen>
			<CollapsibleTrigger asChild>
				<Button variant="outline">
					<Text>Toggle details</Text>
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<View className="bg-muted rounded-md p-3">
					<Text>Visible by default.</Text>
				</View>
			</CollapsibleContent>
		</Collapsible>
	),
};
