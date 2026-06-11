import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { FilterCheckboxRow } from "./FilterCheckboxRow";

const meta: Meta<typeof FilterCheckboxRow> = {
	title: "Molecules/Sessions/FilterCheckboxRow",
	component: FilterCheckboxRow,
	parameters: {
		docs: {
			description: {
				component:
					"Single row in the SessionFilterSheet (UC-NAV-08 §C). Two variants: `workspace` (git-branch + branch · host icon + host) and `status` (colored status icon + label). Tap anywhere on the row to toggle.",
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
};

export default meta;

type Story = StoryObj<typeof FilterCheckboxRow>;

export const WorkspaceUnchecked: Story = {
	render: () => {
		const [checked, setChecked] = useState(false);
		return (
			<FilterCheckboxRow
				kind="workspace"
				branch="chat-mobile-plan"
				hostName="macbook"
				hostKind="laptop"
				checked={checked}
				onCheckedChange={setChecked}
			/>
		);
	},
};

export const WorkspaceChecked: Story = {
	render: () => {
		const [checked, setChecked] = useState(true);
		return (
			<FilterCheckboxRow
				kind="workspace"
				branch="api-rewrite"
				hostName="cloud-1"
				hostKind="cloud"
				checked={checked}
				onCheckedChange={setChecked}
			/>
		);
	},
};

export const StatusStreaming: Story = {
	render: () => {
		const [checked, setChecked] = useState(true);
		return (
			<FilterCheckboxRow
				kind="status"
				statusValue="streaming"
				label="Streaming"
				checked={checked}
				onCheckedChange={setChecked}
			/>
		);
	},
};

export const StatusPausePending: Story = {
	render: () => {
		const [checked, setChecked] = useState(false);
		return (
			<FilterCheckboxRow
				kind="status"
				statusValue="pause-pending"
				label="Pause pending"
				checked={checked}
				onCheckedChange={setChecked}
			/>
		);
	},
};

export const StatusIdle: Story = {
	render: () => {
		const [checked, setChecked] = useState(false);
		return (
			<FilterCheckboxRow
				kind="status"
				statusValue="idle"
				label="Idle"
				checked={checked}
				onCheckedChange={setChecked}
			/>
		);
	},
};
