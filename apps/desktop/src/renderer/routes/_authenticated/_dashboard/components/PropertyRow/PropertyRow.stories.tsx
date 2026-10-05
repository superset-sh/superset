import type { Meta, StoryObj } from "@storybook/react-vite";
import { PropertyRow } from "./PropertyRow";

const meta = {
	component: PropertyRow,
	decorators: [
		(Story) => (
			<div className="w-[372px] text-[13px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: { label: "Environment", children: "superset-dev" },
} satisfies Meta<typeof PropertyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShortValue: Story = {};

export const LongValue: Story = {
	args: {
		label: "Environment",
		children: "superset-dev-with-mobile-simulators-and-postgres",
	},
};
