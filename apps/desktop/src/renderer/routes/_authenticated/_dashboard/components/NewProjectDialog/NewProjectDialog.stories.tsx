import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { NewProjectDialog } from "./NewProjectDialog";

const satya = { id: "satya", name: "Satya Patel", image: null };
const kiet = { id: "kiet", name: "Kiet Ho", image: null };

const meta = {
	component: NewProjectDialog,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<div className="h-[520px] bg-background">
				<Story />
			</div>
		),
	],
	args: {
		open: true,
		people: [satya, kiet],
		defaultLeadId: "satya",
		isCreating: false,
		onOpenChange: fn(),
		onCreate: fn(),
	},
} satisfies Meta<typeof NewProjectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NamedFromAPicker: Story = {
	args: { initialName: "Mobile polish", initialState: "started" },
};

export const NoLead: Story = {
	args: { defaultLeadId: null },
};
