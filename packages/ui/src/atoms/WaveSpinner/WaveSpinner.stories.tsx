import type { Meta, StoryObj } from "@storybook/react-vite";
import { WaveSpinner } from "./WaveSpinner";

const meta = {
	title: "Atoms/WaveSpinner",
	component: WaveSpinner,
} satisfies Meta<typeof WaveSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Working: Story = {
	args: { className: "text-amber-500" },
};

export const Creating: Story = {
	args: { className: "text-muted-foreground" },
};

export const Enlarged: Story = {
	args: { className: "text-amber-500" },
	render: (args) => (
		<div className="origin-top-left scale-[6]">
			<WaveSpinner {...args} />
		</div>
	),
};
