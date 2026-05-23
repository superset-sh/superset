import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Text } from "@/components/ui/text";

function CardShowcase({
	title,
	description,
	body,
	showFooter,
}: {
	title: string;
	description: string;
	body: string;
	showFooter: boolean;
}) {
	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<Text variant="small">{body}</Text>
			</CardContent>
			{showFooter ? (
				<CardFooter>
					<View className="flex-row gap-2 ml-auto">
						<Button variant="outline">
							<Text>Cancel</Text>
						</Button>
						<Button>
							<Text>Save</Text>
						</Button>
					</View>
				</CardFooter>
			) : null}
		</Card>
	);
}

const meta: Meta<typeof CardShowcase> = {
	title: "Components/Card",
	component: CardShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Elevated content container. Base for tool-call cards, pending-approval cards, info panels. Composes Header/Title/Description/Content/Footer sub-components.",
			},
		},
	},
	args: {
		title: "Tool call",
		description: "ReadFile · src/handlers/chat.ts",
		body: "Reading file contents to determine the right insertion point...",
		showFooter: false,
	},
	argTypes: {
		title: { control: "text" },
		description: { control: "text" },
		body: { control: "text" },
		showFooter: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof CardShowcase>;

export const Default: Story = {};

export const WithFooter: Story = { args: { showFooter: true } };

export const ToolCall: Story = {
	args: {
		title: "ReadFile",
		description: "src/handlers/chat.ts · 1.2KB",
		body: "Read 47 lines · returned 0 results",
		showFooter: false,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Tool-call card base composition (UC-RENDER-04). Full ToolCallBlock molecule adds status rule + status icon.",
			},
		},
	},
};
