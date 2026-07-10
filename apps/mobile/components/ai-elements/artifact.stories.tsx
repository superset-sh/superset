import type { Meta, StoryObj } from "@storybook/react-native";
import { CopyIcon, DownloadIcon, RefreshCwIcon } from "lucide-react-native";
import { View } from "react-native";
import {
	Artifact,
	ArtifactAction,
	ArtifactActions,
	ArtifactClose,
	ArtifactContent,
	ArtifactDescription,
	ArtifactHeader,
	ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ai-elements/Artifact",
	component: Artifact,
} satisfies Meta<typeof Artifact>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full p-4">
			<Artifact>
				<ArtifactHeader>
					<View className="min-w-0 flex-1">
						<ArtifactTitle>fibonacci.py</ArtifactTitle>
						<ArtifactDescription>Generated Python script</ArtifactDescription>
					</View>
					<ArtifactActions>
						<ArtifactAction icon={CopyIcon} label="Copy" tooltip="Copy" />
						<ArtifactAction
							icon={DownloadIcon}
							label="Download"
							tooltip="Download"
						/>
						<ArtifactClose />
					</ArtifactActions>
				</ArtifactHeader>
				<ArtifactContent>
					<Text className="font-mono text-sm">
						{
							"def fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a"
						}
					</Text>
				</ArtifactContent>
			</Artifact>
		</View>
	),
};

export const HeaderOnly: Story = {
	render: () => (
		<View className="w-full p-4">
			<Artifact>
				<ArtifactHeader>
					<View className="min-w-0 flex-1">
						<ArtifactTitle>Regenerating report…</ArtifactTitle>
					</View>
					<ArtifactActions>
						<ArtifactAction
							icon={RefreshCwIcon}
							label="Retry"
							tooltip="Retry"
						/>
						<ArtifactClose />
					</ArtifactActions>
				</ArtifactHeader>
			</Artifact>
		</View>
	),
};
