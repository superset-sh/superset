import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { ProjectChipHeader } from "./ProjectChipHeader";

const meta: Meta<typeof ProjectChipHeader> = {
	title: "Molecules/Sessions/ProjectChipHeader",
	component: ProjectChipHeader,
	parameters: {
		docs: {
			description: {
				component:
					"Sessions-list two-row sticky header. Row 1: hamburger + project chip (▾ when multi-project). Row 2: search input + filter button with `·N` badge. UC-NAV §A.",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background">
				<Story />
			</View>
		),
	],
	args: {
		projectName: "superset",
		variant: "multi-project",
		searchPlaceholder: "Search superset sessions",
		searchValue: "",
		filterCount: 0,
		onMenuPress: () => {},
		onProjectChipPress: () => {},
		onFilterPress: () => {},
	},
	argTypes: {
		projectName: { control: "text" },
		variant: {
			control: { type: "select" },
			options: ["multi-project", "single-project"],
		},
		searchPlaceholder: { control: "text" },
		searchValue: { control: "text" },
		filterCount: { control: { type: "number", min: 0, max: 9 } },
	},
};

export default meta;

type Story = StoryObj<typeof ProjectChipHeader>;

export const MultiProject: Story = {};

export const SingleProject: Story = {
	args: { variant: "single-project" },
};

export const WithSearchTyped: Story = {
	args: { searchValue: "auth" },
};

export const Filtering: Story = {
	args: { filterCount: 2 },
};

export const InteractiveSearch: Story = {
	render: () => {
		const [value, setValue] = useState("");
		return (
			<ProjectChipHeader
				projectName="superset"
				variant="multi-project"
				searchValue={value}
				onSearchChange={setValue}
				onClearSearch={() => setValue("")}
				filterCount={value.length > 0 ? 0 : 0}
			/>
		);
	},
};
