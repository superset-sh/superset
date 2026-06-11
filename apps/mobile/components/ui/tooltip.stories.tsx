import type { Meta, StoryObj } from "@storybook/react-native";
import { Info } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

function TooltipShowcase({
	side,
	content,
}: {
	side: "top" | "bottom";
	content: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger>
				<Icon as={Info} className="size-5 text-muted-foreground" />
			</TooltipTrigger>
			<TooltipContent side={side}>
				<Text variant="small">{content}</Text>
			</TooltipContent>
		</Tooltip>
	);
}

const meta: Meta<typeof TooltipShowcase> = {
	title: "Components/Tooltip",
	component: TooltipShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Long-press hint on mobile. Used sparingly — chat view's long-press affordances mostly use ContextMenu (system menu) instead. Renders via portal.",
			},
		},
	},
	args: {
		side: "top",
		content: "Sessions are scoped to the selected project.",
	},
	argTypes: {
		side: { control: { type: "select" }, options: ["top", "bottom"] },
		content: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof TooltipShowcase>;

export const Default: Story = {};
