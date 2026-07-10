import type { Meta, StoryObj } from "@storybook/react-native";
import { FileCodeIcon, FileJsonIcon } from "lucide-react-native";
import { View } from "react-native";
import {
	FileTree,
	FileTreeFile,
	FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { Icon } from "@/components/ui/icon";

const meta = {
	title: "ai-elements/FileTree",
	component: FileTree,
} satisfies Meta<typeof FileTree>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<FileTree defaultExpanded={new Set(["src", "src/components"])}>
				<FileTreeFolder name="src" path="src">
					<FileTreeFolder name="components" path="src/components">
						<FileTreeFile name="Button.tsx" path="src/components/Button.tsx" />
						<FileTreeFile name="Input.tsx" path="src/components/Input.tsx" />
					</FileTreeFolder>
					<FileTreeFolder name="hooks" path="src/hooks">
						<FileTreeFile name="useSession.ts" path="src/hooks/useSession.ts" />
					</FileTreeFolder>
					<FileTreeFile name="index.ts" path="src/index.ts" />
				</FileTreeFolder>
				<FileTreeFile name="package.json" path="package.json" />
				<FileTreeFile name="README.md" path="README.md" />
			</FileTree>
		</View>
	),
};

export const WithSelection: Story = {
	render: () => (
		<View className="w-full">
			<FileTree defaultExpanded={new Set(["src"])} selectedPath="src/index.ts">
				<FileTreeFolder name="src" path="src">
					<FileTreeFile name="index.ts" path="src/index.ts" />
					<FileTreeFile name="config.ts" path="src/config.ts" />
				</FileTreeFolder>
				<FileTreeFile name="package.json" path="package.json" />
			</FileTree>
		</View>
	),
};

export const WithCustomIcons: Story = {
	render: () => (
		<View className="w-full">
			<FileTree defaultExpanded={new Set(["src"])}>
				<FileTreeFolder name="src" path="src">
					<FileTreeFile
						icon={<Icon as={FileCodeIcon} className="size-4 text-blue-400" />}
						name="main.tsx"
						path="src/main.tsx"
					/>
				</FileTreeFolder>
				<FileTreeFile
					icon={<Icon as={FileJsonIcon} className="size-4 text-yellow-500" />}
					name="tsconfig.json"
					path="tsconfig.json"
				/>
			</FileTree>
		</View>
	),
};
