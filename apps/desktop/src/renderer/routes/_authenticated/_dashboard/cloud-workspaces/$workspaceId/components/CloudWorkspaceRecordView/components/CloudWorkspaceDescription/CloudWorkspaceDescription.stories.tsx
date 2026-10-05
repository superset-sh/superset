import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceDescription } from "./CloudWorkspaceDescription";

const meta = {
	component: CloudWorkspaceDescription,
	decorators: [
		(Story) => (
			<div className="w-[640px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		description:
			"Moves the sidebar's cloud section onto presence. **Done:** rows and hover cards. **Open:** #7888 waits on review.",
		canGenerate: true,
		isGenerating: false,
		onSave: fn(),
		onGenerate: fn(),
	},
} satisfies Meta<typeof CloudWorkspaceDescription>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Written: Story = {};

export const Empty: Story = { args: { description: null } };

export const Generating: Story = { args: { isGenerating: true } };
