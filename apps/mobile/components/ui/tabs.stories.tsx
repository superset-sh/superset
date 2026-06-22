import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/Tabs",
	component: Tabs,
	args: {
		value: "account",
		onValueChange: () => {},
	},
	render: () => {
		const [value, setValue] = React.useState("account");
		return (
			<Tabs value={value} onValueChange={setValue} className="w-64">
				<TabsList>
					<TabsTrigger value="account">
						<Text>Account</Text>
					</TabsTrigger>
					<TabsTrigger value="password">
						<Text>Password</Text>
					</TabsTrigger>
				</TabsList>
				<TabsContent value="account">
					<Text>Make changes to your account here.</Text>
				</TabsContent>
				<TabsContent value="password">
					<Text>Change your password here.</Text>
				</TabsContent>
			</Tabs>
		);
	},
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
