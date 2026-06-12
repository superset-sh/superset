import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Snippet,
	SnippetAddon,
	SnippetCopyButton,
	SnippetInput,
	SnippetText,
} from "@/components/ai-elements/snippet";

const meta = {
	title: "ai-elements/Snippet",
	component: Snippet,
} satisfies Meta<typeof Snippet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: { code: "bunx expo start --tunnel" },
	render: () => (
		<View className="w-full">
			<Snippet code="bunx expo start --tunnel">
				<SnippetAddon>
					<SnippetText>$</SnippetText>
				</SnippetAddon>
				<SnippetInput />
				<SnippetCopyButton />
			</Snippet>
		</View>
	),
};

export const InstallCommand: Story = {
	args: { code: "bun add @superset/sdk" },
	render: () => (
		<View className="w-full">
			<Snippet code="bun add @superset/sdk">
				<SnippetAddon>
					<SnippetText>$</SnippetText>
				</SnippetAddon>
				<SnippetInput />
				<SnippetCopyButton />
			</Snippet>
		</View>
	),
};

export const WithoutAddon: Story = {
	args: { code: "git switch -c feature/mobile-ai-elements" },
	render: () => (
		<View className="w-full">
			<Snippet code="git switch -c feature/mobile-ai-elements">
				<SnippetInput />
				<SnippetCopyButton />
			</Snippet>
		</View>
	),
};
