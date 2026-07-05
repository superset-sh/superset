import { createHighlighterCore, type HighlighterCore } from "@shikijs/core";
import typescript from "@shikijs/langs/typescript";
import githubDark from "@shikijs/themes/github-dark";
import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import {
	createNativeEngine,
	isNativeEngineAvailable,
} from "react-native-shiki-engine";
import { StreamdownText } from "react-native-streamdown";
import { Text } from "@/components/ui/text";

const SAMPLE_MARKDOWN = `# Streaming markdown spike

This validates **react-native-streamdown** inside our metro composition.

- uniwind + storybook + bundle mode
- GFM table streaming
- \`inline code\`

| Surface | Works |
| --- | --- |
| iOS | ? |

\`\`\`ts
const greet = (name: string) => \`hello \${name}\`;
\`\`\`

> Blockquote with [a link](https://superset.sh).
`;

function StreamingDemo() {
	const [markdown, setMarkdown] = React.useState("");

	React.useEffect(() => {
		let index = 0;
		const interval = setInterval(() => {
			index = Math.min(index + 6, SAMPLE_MARKDOWN.length);
			setMarkdown(SAMPLE_MARKDOWN.slice(0, index));
			if (index >= SAMPLE_MARKDOWN.length) {
				clearInterval(interval);
			}
		}, 50);
		return () => clearInterval(interval);
	}, []);

	return <StreamdownText flavor="github" markdown={markdown} />;
}

const CODE_SAMPLE = `import { useState } from "react";

export function Counter({ initial = 0 }: { initial?: number }) {
	const [count, setCount] = useState(initial);
	return count;
}`;

let highlighterPromise: Promise<HighlighterCore> | null = null;

const getHighlighter = () => {
	highlighterPromise ??= createHighlighterCore({
		themes: [githubDark],
		langs: [typescript],
		engine: createNativeEngine(),
	});
	return highlighterPromise;
};

function ShikiDemo() {
	const [state, setState] = React.useState<
		| { status: "loading" }
		| { status: "error"; message: string }
		| {
				status: "ready";
				lines: ReturnType<HighlighterCore["codeToTokensBase"]>;
		  }
	>({ status: "loading" });

	React.useEffect(() => {
		if (!isNativeEngineAvailable()) {
			setState({ status: "error", message: "Native engine unavailable" });
			return;
		}
		getHighlighter()
			.then((highlighter) => {
				setState({
					status: "ready",
					lines: highlighter.codeToTokensBase(CODE_SAMPLE, {
						lang: "typescript",
						theme: "github-dark",
					}),
				});
			})
			.catch((error: unknown) => {
				setState({ status: "error", message: String(error) });
			});
	}, []);

	if (state.status === "loading") {
		return <Text>highlighting…</Text>;
	}
	if (state.status === "error") {
		return <Text className="text-destructive">{state.message}</Text>;
	}
	return (
		<ScrollView horizontal className="bg-card w-full rounded-lg p-3">
			<View>
				{state.lines.map((line, lineIndex) => (
					<Text
						className="font-mono text-xs"
						key={`line-${
							// biome-ignore lint/suspicious/noArrayIndexKey: static spike content
							lineIndex
						}`}
					>
						{line.length === 0
							? " "
							: line.map((token, tokenIndex) => (
									<Text
										className="font-mono text-xs"
										key={`token-${lineIndex}-${
											// biome-ignore lint/suspicious/noArrayIndexKey: static spike content
											tokenIndex
										}`}
										style={{ color: token.color }}
									>
										{token.content}
									</Text>
								))}
					</Text>
				))}
			</View>
		</ScrollView>
	);
}

const meta = {
	title: "ai-elements/Spike",
} satisfies Meta<Record<string, never>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const StreamdownStatic: Story = {
	render: () => <StreamdownText flavor="github" markdown={SAMPLE_MARKDOWN} />,
};

export const StreamdownStreaming: Story = {
	render: () => <StreamingDemo />,
};

export const ShikiNativeEngine: Story = {
	render: () => <ShikiDemo />,
};
