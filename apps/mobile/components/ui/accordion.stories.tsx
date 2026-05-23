import type { Meta, StoryObj } from "@storybook/react-native";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Text } from "@/components/ui/text";

function AccordionShowcase({
	type,
	collapsible,
}: {
	type: "single" | "multiple";
	collapsible: boolean;
}) {
	if (type === "single") {
		return (
			<Accordion type="single" collapsible={collapsible} className="w-full">
				<AccordionItem value="item-1">
					<AccordionTrigger>
						<Text>How do I sign in?</Text>
					</AccordionTrigger>
					<AccordionContent>
						<Text variant="small" className="text-muted-foreground">
							Open the More tab and tap "Sign in with email" — a magic link will
							be sent to your inbox.
						</Text>
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="item-2">
					<AccordionTrigger>
						<Text>What is a workspace?</Text>
					</AccordionTrigger>
					<AccordionContent>
						<Text variant="small" className="text-muted-foreground">
							A workspace is a branch on a host. Each session is bound to one
							workspace.
						</Text>
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="item-3">
					<AccordionTrigger>
						<Text>Why is the host offline?</Text>
					</AccordionTrigger>
					<AccordionContent>
						<Text variant="small" className="text-muted-foreground">
							The host-service process may not be running. Check that desktop
							Superset is open and connected.
						</Text>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		);
	}
	return (
		<Accordion type="multiple" className="w-full">
			<AccordionItem value="a">
				<AccordionTrigger>
					<Text>First (independent)</Text>
				</AccordionTrigger>
				<AccordionContent>
					<Text variant="small">Independently expandable.</Text>
				</AccordionContent>
			</AccordionItem>
			<AccordionItem value="b">
				<AccordionTrigger>
					<Text>Second (independent)</Text>
				</AccordionTrigger>
				<AccordionContent>
					<Text variant="small">Also independent.</Text>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

const meta: Meta<typeof AccordionShowcase> = {
	title: "Components/Accordion",
	component: AccordionShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Show/hide content groups. Used for FAQ-style content in Help / About screens. Choose `single` for radio behavior, `multiple` for independent toggles.",
			},
		},
	},
	args: { type: "single", collapsible: true },
	argTypes: {
		type: { control: { type: "select" }, options: ["single", "multiple"] },
		collapsible: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof AccordionShowcase>;

export const SingleCollapsible: Story = {};
export const Multiple: Story = { args: { type: "multiple" } };
