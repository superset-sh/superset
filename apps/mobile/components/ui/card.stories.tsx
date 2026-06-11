import type { Meta, StoryObj } from "@storybook/react-native";
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

const meta = {
	title: "ui/Card",
	component: Card,
	render: () => (
		<Card className="w-72">
			<CardHeader>
				<CardTitle>Create project</CardTitle>
				<CardDescription>Deploy your new project in one click.</CardDescription>
			</CardHeader>
			<CardContent>
				<Text>Your project details and settings live here.</Text>
			</CardContent>
			<CardFooter className="justify-end gap-2">
				<Button variant="outline">
					<Text>Cancel</Text>
				</Button>
				<Button>
					<Text>Deploy</Text>
				</Button>
			</CardFooter>
		</Card>
	),
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
