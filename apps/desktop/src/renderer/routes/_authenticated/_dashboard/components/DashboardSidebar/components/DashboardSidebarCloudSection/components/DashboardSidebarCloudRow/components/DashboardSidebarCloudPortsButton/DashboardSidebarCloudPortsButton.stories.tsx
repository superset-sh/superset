import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DashboardSidebarPortsCard } from "../../../DashboardSidebarPortsCard";
import { DashboardSidebarCloudPortsButton } from "./DashboardSidebarCloudPortsButton";

const meta = {
	component: DashboardSidebarCloudPortsButton,
	decorators: [
		(Story) => (
			<div className="w-[120px] bg-sidebar p-6">
				<Story />
			</div>
		),
	],
	args: {
		count: 1,
		card: (
			<DashboardSidebarPortsCard
				ports={[
					{
						port: 3000,
						label: "Frontend",
						hostType: "remote-device",
						forward: { status: { state: "active", localPort: 3000 } },
					},
				]}
				onOpenPort={fn()}
				onClosePort={fn()}
				onCloseAll={fn()}
			/>
		),
		onOpenChange: fn(),
	},
} satisfies Meta<typeof DashboardSidebarCloudPortsButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnePort: Story = {};

export const NinePorts: Story = {
	args: { count: 9 },
};

export const OverNinePorts: Story = {
	args: { count: 12 },
};
