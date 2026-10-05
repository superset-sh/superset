import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceRowChip } from "./CloudWorkspaceRowChip";

const meta = {
	component: CloudWorkspaceRowChip,
	decorators: [
		(Story) => (
			<div className="w-[320px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		onClick: fn(),
		children: "#7866",
	},
} satisfies Meta<typeof CloudWorkspaceRowChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCount: Story = {
	args: {
		children: (
			<>
				superset
				<span className="text-muted-foreground/70">+2</span>
			</>
		),
	},
};

export const LongLabel: Story = {
	args: { children: "superset-sh-marketing-site-preview" },
};
