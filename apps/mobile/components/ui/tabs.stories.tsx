import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";

function TabsShowcase() {
	const [value, setValue] = useState("streaming");
	return (
		<Tabs value={value} onValueChange={setValue} className="w-full">
			<TabsList>
				<TabsTrigger value="streaming">
					<Text>Streaming</Text>
				</TabsTrigger>
				<TabsTrigger value="pause-pending">
					<Text>Pause pending</Text>
				</TabsTrigger>
				<TabsTrigger value="idle">
					<Text>Idle</Text>
				</TabsTrigger>
			</TabsList>
			<TabsContent value="streaming">
				<View className="pt-4">
					<Text variant="small" className="text-muted-foreground">
						3 sessions currently streaming.
					</Text>
				</View>
			</TabsContent>
			<TabsContent value="pause-pending">
				<View className="pt-4">
					<Text variant="small" className="text-muted-foreground">
						1 session waiting for input.
					</Text>
				</View>
			</TabsContent>
			<TabsContent value="idle">
				<View className="pt-4">
					<Text variant="small" className="text-muted-foreground">
						12 idle sessions.
					</Text>
				</View>
			</TabsContent>
		</Tabs>
	);
}

const meta: Meta<typeof TabsShowcase> = {
	title: "Components/Tabs",
	component: TabsShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Tab segment + content. Used for inline status filtering, settings categories.",
			},
		},
	},
};

export default meta;

type Story = StoryObj<typeof TabsShowcase>;

export const SessionStatusFilter: Story = {};
