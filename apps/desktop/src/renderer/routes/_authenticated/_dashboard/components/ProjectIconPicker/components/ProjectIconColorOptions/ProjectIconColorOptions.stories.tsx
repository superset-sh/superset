import type { Meta, StoryObj } from "@storybook/react-vite";
import { PiAirplaneFill, PiBowlFoodFill } from "react-icons/pi";
import { fn } from "storybook/test";
import { ProjectIconColorOptions } from "./ProjectIconColorOptions";

const meta = {
	component: ProjectIconColorOptions,
	decorators: [
		(Story) => (
			<div className="w-fit rounded-md border border-border bg-popover p-1.5">
				<Story />
			</div>
		),
	],
	args: { Icon: PiAirplaneFill, selected: null, onPick: fn() },
} satisfies Meta<typeof ProjectIconColorOptions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Airplane: Story = {};
export const BowlWithOrange: Story = {
	args: { Icon: PiBowlFoodFill, selected: "#f97316" },
};
