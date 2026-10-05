import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudRepositoryRow } from "./CloudRepositoryRow";

const meta = {
	component: CloudRepositoryRow,
	decorators: [
		(Story) => (
			<div className="w-72 bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		fullName: "superset-sh/superset",
		onOpen: fn(),
	},
} satisfies Meta<typeof CloudRepositoryRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongName: Story = {
	args: {
		fullName: "superset-sh/superset-marketing-site-preview-deployments",
	},
};

export const NoOwner: Story = {
	args: { fullName: "superset" },
};
