import type { Meta, StoryObj } from "@storybook/react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ModalHeader } from "./ModalHeader";

const meta: Meta<typeof ModalHeader> = {
	title: "Molecules/ModalHeader",
	component: ModalHeader,
	parameters: {
		docs: {
			description: {
				component:
					"Modal-specific header for full-screen sheets. Leading ✕ + title + optional trailing action slot. simple=true left-aligns title. Composes IconButton + Text.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		title: "Review Plan",
		simple: false,
		isScrolled: false,
	},
	argTypes: {
		title: { control: "text" },
		simple: { control: "boolean", description: "Left-align title, no spacer" },
		isScrolled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof ModalHeader>;

export const Default: Story = {};

export const Simple: Story = {
	args: { simple: true, title: "Filter sessions" },
};

export const WithAction: Story = {
	args: { title: "Settings" },
	render: (args) => (
		<ModalHeader
			{...args}
			action={
				<Button size="sm" variant="ghost">
					<Text>Save</Text>
				</Button>
			}
		/>
	),
};

export const Scrolled: Story = {
	args: { isScrolled: true },
};
