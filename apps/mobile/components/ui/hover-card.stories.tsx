import type { Meta, StoryObj } from "@storybook/react-native";
import { Button } from "@/components/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/HoverCard",
	component: HoverCard,
	render: () => (
		<HoverCard>
			<HoverCardTrigger asChild>
				<Button variant="link">
					<Text>@nextjs</Text>
				</Button>
			</HoverCardTrigger>
			<HoverCardContent>
				<Text variant="large">Next.js</Text>
				<Text className="text-muted-foreground mt-2">
					The React Framework, created and maintained by Vercel.
				</Text>
			</HoverCardContent>
		</HoverCard>
	),
} satisfies Meta<typeof HoverCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
