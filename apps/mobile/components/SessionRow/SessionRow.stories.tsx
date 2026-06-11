import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	type SessionHostKind,
	SessionRow,
	type SessionStatus,
} from "./SessionRow";

const STATUSES: SessionStatus[] = [
	"live",
	"warning",
	"danger",
	"idle",
	"archived",
];
const HOSTS: SessionHostKind[] = ["laptop", "cloud"];

const meta: Meta<typeof SessionRow> = {
	title: "Molecules/Sessions/SessionRow",
	component: SessionRow,
	parameters: {
		docs: {
			description: {
				component:
					"Single row in the sessions list (UC-NAV §A). Two-line layout: title with status dot leading + meta line (git-branch + branch · host icon + host · time/status). 5 status variants drive the leading dot color + trailing status-label color.",
			},
		},
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background">
				<Story />
			</View>
		),
	],
	args: {
		title: "Chat-v2 design",
		branch: "chat-mobile-plan",
		hostName: "macbook",
		hostKind: "laptop",
		timeLabel: "2m ago",
		status: "live",
		statusLabel: "streaming",
		unread: false,
		disabled: false,
	},
	argTypes: {
		title: { control: "text" },
		branch: { control: "text" },
		hostName: { control: "text" },
		hostKind: { control: { type: "select" }, options: HOSTS },
		timeLabel: { control: "text" },
		statusLabel: { control: "text" },
		status: { control: { type: "select" }, options: STATUSES },
		unread: { control: "boolean" },
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof SessionRow>;

export const Live: Story = {};

export const Warning: Story = {
	args: {
		title: "Auth refactor",
		branch: "main",
		hostName: "desktop",
		status: "warning",
		statusLabel: "pause pending",
		timeLabel: undefined,
	},
};

export const Danger: Story = {
	args: {
		title: "Deploy failed",
		branch: "main",
		hostName: "cloud-1",
		hostKind: "cloud",
		status: "danger",
		statusLabel: "dispatch failed",
		timeLabel: undefined,
	},
};

export const Idle: Story = {
	args: {
		title: "API cleanup",
		branch: "chat-mobile-plan",
		hostName: "macbook",
		status: "idle",
		timeLabel: "1h ago",
		statusLabel: undefined,
	},
};

export const Archived: Story = {
	args: {
		title: "Hot-fix backport",
		branch: "main",
		hostName: "desktop",
		status: "archived",
		timeLabel: "1d ago",
		statusLabel: undefined,
	},
};

export const Unread: Story = {
	args: {
		unread: true,
	},
};

export const CloudHost: Story = {
	args: {
		title: "Migration plan",
		branch: "api-rewrite",
		hostName: "cloud-1",
		hostKind: "cloud",
		status: "live",
		statusLabel: "streaming",
	},
};
