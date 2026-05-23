import type { Meta, StoryObj } from "@storybook/react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

function CollapsibleShowcase({
	initialOpen,
	header,
	body,
}: {
	initialOpen: boolean;
	header: string;
	body: string;
}) {
	const [open, setOpen] = useState(initialOpen);
	return (
		<View className="border-border w-full max-w-sm rounded-md border bg-card p-3">
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger asChild>
					<Pressable className="flex-row items-center justify-between py-1">
						<Text className="font-semibold">{header}</Text>
						<Icon
							as={open ? ChevronDown : ChevronRight}
							className="size-4 text-muted-foreground"
						/>
					</Pressable>
				</CollapsibleTrigger>
				<CollapsibleContent className="pt-2">
					<Text variant="small" className="text-muted-foreground">
						{body}
					</Text>
				</CollapsibleContent>
			</Collapsible>
		</View>
	);
}

const meta: Meta<typeof CollapsibleShowcase> = {
	title: "Components/Collapsible",
	component: CollapsibleShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Show/hide a content region with a header. Used by PlanBlock + ReasoningBlock (UC-RENDER-05), tool-call argument preview, expandable feedback in PlanReviewScreen.",
			},
		},
	},
	args: {
		initialOpen: false,
		header: "📦 Plan",
		body: "1. Investigate the failing test\n2. Add a fix\n3. Re-run the suite",
	},
	argTypes: {
		initialOpen: { control: "boolean" },
		header: { control: "text" },
		body: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof CollapsibleShowcase>;

export const Collapsed: Story = {};
export const Expanded: Story = { args: { initialOpen: true } };

export const ReasoningBlock: Story = {
	args: {
		initialOpen: true,
		header: "💭 Reasoning",
		body: "The user mentioned the slash command popover keeps closing on focus loss. The issue is likely the BottomSheet capture phase swallowing the focus event...",
	},
};
