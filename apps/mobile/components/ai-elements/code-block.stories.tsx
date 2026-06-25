import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	CodeBlock,
	CodeBlockActions,
	CodeBlockCopyButton,
	CodeBlockFilename,
	CodeBlockHeader,
	CodeBlockTitle,
} from "@/components/ai-elements/code-block";

const TYPESCRIPT_SAMPLE = `import { useState } from "react";

export function Counter({ initial = 0 }: { initial?: number }) {
	const [count, setCount] = useState(initial);

	const increment = () => setCount((current) => current + 1);

	return { count, increment };
}`;

const PYTHON_SAMPLE = `def fibonacci(n: int) -> list[int]:
    sequence = [0, 1]
    while len(sequence) < n:
        sequence.append(sequence[-1] + sequence[-2])
    return sequence[:n]`;

const meta = {
	title: "ai-elements/CodeBlock",
	component: CodeBlock,
} satisfies Meta<typeof CodeBlock>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithHeaderAndCopy: Story = {
	args: {
		code: TYPESCRIPT_SAMPLE,
		language: "typescript",
	},
	render: (args) => (
		<View className="w-full">
			<CodeBlock {...args}>
				<CodeBlockHeader>
					<CodeBlockTitle>
						<CodeBlockFilename>counter.ts</CodeBlockFilename>
					</CodeBlockTitle>
					<CodeBlockActions>
						<CodeBlockCopyButton />
					</CodeBlockActions>
				</CodeBlockHeader>
			</CodeBlock>
		</View>
	),
};

export const LineNumbers: Story = {
	args: {
		code: PYTHON_SAMPLE,
		language: "python",
		showLineNumbers: true,
	},
	render: (args) => (
		<View className="w-full">
			<CodeBlock {...args} />
		</View>
	),
};

export const UnknownLanguageFallback: Story = {
	args: {
		code: "PRINT 'plain text fallback'",
		language: "not-a-language",
	},
	render: (args) => (
		<View className="w-full">
			<CodeBlock {...args} />
		</View>
	),
};
