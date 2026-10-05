import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DashboardSidebarPortsCard } from "./DashboardSidebarPortsCard";

const meta = {
	component: DashboardSidebarPortsCard,
	decorators: [
		(Story) => (
			<div className="w-64 rounded-md border bg-popover text-popover-foreground shadow-md">
				<Story />
			</div>
		),
	],
	args: {
		ports: [
			{
				port: 3000,
				label: "Frontend",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 3000 } },
			},
		],
		onOpenPort: fn(),
		onClosePort: fn(),
		onCloseAll: fn(),
	},
} satisfies Meta<typeof DashboardSidebarPortsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NamedInPortsJson: Story = {};

export const TwoPorts: Story = {
	args: {
		ports: [
			{
				port: 3000,
				label: "Frontend",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 3000 } },
			},
			{
				port: 3001,
				label: "API",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 3011 } },
			},
		],
	},
};

export const NotInPortsJson: Story = {
	args: {
		ports: [
			{
				port: 5432,
				label: null,
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 5432 } },
			},
			{
				port: 6379,
				label: null,
				hostType: "remote-device",
				forward: {
					status: { state: "busy", localPort: 6379, localOwner: null },
				},
			},
		],
	},
};

export const LocalMachine: Story = {
	args: {
		ports: [
			{
				port: 3000,
				label: "Frontend",
				hostType: "local-device",
				forward: null,
			},
		],
	},
};

export const TwelvePorts: Story = {
	args: {
		ports: [
			{
				port: 3000,
				label: "Frontend",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 3000 } },
			},
			{
				port: 3001,
				label: "API",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 3001 } },
			},
			{
				port: 3002,
				label: "Docs",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 3002 } },
			},
			{
				port: 6006,
				label: "Storybook",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 6006 } },
			},
			{
				port: 5173,
				label: "Vite",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 5173 } },
			},
			{
				port: 5432,
				label: "Postgres",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 5432 } },
			},
			{
				port: 6379,
				label: "Redis",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 6379 } },
			},
			{
				port: 8787,
				label: "Worker",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 8787 } },
			},
			{
				port: 9658,
				label: "Realtime",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 9658 } },
			},
			{
				port: 9655,
				label: "Gate",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 9655 } },
			},
			{
				port: 9229,
				label: "Inspector",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 9229 } },
			},
			{
				port: 8025,
				label: "Mailpit",
				hostType: "remote-device",
				forward: { status: { state: "active", localPort: 8025 } },
			},
		],
	},
};
