import type { Meta, StoryObj } from "@storybook/react-native";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/Accordion",
	component: Accordion,
	args: {
		type: "single",
	},
	render: () => (
		<Accordion type="single" collapsible defaultValue="item-1">
			<AccordionItem value="item-1">
				<AccordionTrigger>
					<Text>Is it accessible?</Text>
				</AccordionTrigger>
				<AccordionContent>
					<Text>Yes. It adheres to the WAI-ARIA design pattern.</Text>
				</AccordionContent>
			</AccordionItem>
			<AccordionItem value="item-2">
				<AccordionTrigger>
					<Text>Is it styled?</Text>
				</AccordionTrigger>
				<AccordionContent>
					<Text>Yes. It comes with default styles you can customize.</Text>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	),
} satisfies Meta<typeof Accordion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Single: Story = {};

export const Multiple: Story = {
	render: () => (
		<Accordion type="multiple" defaultValue={["item-1", "item-2"]}>
			<AccordionItem value="item-1">
				<AccordionTrigger>
					<Text>First section</Text>
				</AccordionTrigger>
				<AccordionContent>
					<Text>Content for the first section.</Text>
				</AccordionContent>
			</AccordionItem>
			<AccordionItem value="item-2">
				<AccordionTrigger>
					<Text>Second section</Text>
				</AccordionTrigger>
				<AccordionContent>
					<Text>Content for the second section.</Text>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	),
};
