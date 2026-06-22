import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Source,
	Sources,
	SourcesContent,
	SourcesTrigger,
} from "@/components/ai-elements/sources";

const meta = {
	title: "ai-elements/Sources",
	component: Sources,
} satisfies Meta<typeof Sources>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<Sources>
				<SourcesTrigger count={3} />
				<SourcesContent>
					<Source
						href="https://legendapp.com/open-source/list/"
						title="LegendList documentation"
					/>
					<Source
						href="https://reactnative.dev/docs/scrollview"
						title="React Native ScrollView"
					/>
					<Source
						href="https://docs.expo.dev/versions/latest/"
						title="Expo SDK reference"
					/>
				</SourcesContent>
			</Sources>
		</View>
	),
};

export const Expanded: Story = {
	render: () => (
		<View className="w-full">
			<Sources defaultOpen>
				<SourcesTrigger count={2} />
				<SourcesContent>
					<Source
						href="https://legendapp.com/open-source/list/"
						title="LegendList documentation"
					/>
					<Source
						href="https://reactnative.dev/docs/scrollview"
						title="React Native ScrollView"
					/>
				</SourcesContent>
			</Sources>
		</View>
	),
};
