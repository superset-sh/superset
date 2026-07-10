import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import {
	type Option,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const meta = {
	title: "ui/Select",
	component: Select,
	render: () => {
		const [value, setValue] = React.useState<Option>(undefined);
		return (
			<Select value={value} onValueChange={setValue}>
				<SelectTrigger className="w-64">
					<SelectValue placeholder="Select a fruit" />
				</SelectTrigger>
				<SelectContent className="w-64">
					<SelectGroup>
						<SelectLabel>Fruits</SelectLabel>
						<SelectItem value="apple" label="Apple" />
						<SelectItem value="banana" label="Banana" />
						<SelectItem value="blueberry" label="Blueberry" />
						<SelectItem value="grapes" label="Grapes" />
					</SelectGroup>
				</SelectContent>
			</Select>
		);
	},
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
