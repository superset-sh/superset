import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import { View } from "react-native";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorName,
	ModelSelectorSeparator,
	ModelSelectorTrigger,
	ModelSelectorValue,
} from "@/components/ai-elements/model-selector";
import { Text } from "@/components/ui/text";

interface DemoModel {
	id: string;
	name: string;
	provider: string;
	description: string;
}

const MODELS: DemoModel[] = [
	{
		description: "Most capable model",
		id: "claude-opus-4-8",
		name: "Opus 4.8",
		provider: "Anthropic",
	},
	{
		description: "Balanced speed and intelligence",
		id: "claude-sonnet-4-5",
		name: "Sonnet 4.5",
		provider: "Anthropic",
	},
	{
		description: "Fastest model",
		id: "claude-haiku-4-5",
		name: "Haiku 4.5",
		provider: "Anthropic",
	},
	{
		description: "Flagship reasoning model",
		id: "gpt-5.2",
		name: "GPT-5.2",
		provider: "OpenAI",
	},
	{
		description: "Small and affordable",
		id: "gpt-5.2-mini",
		name: "GPT-5.2 mini",
		provider: "OpenAI",
	},
	{
		description: "Long-context multimodal",
		id: "gemini-3-pro",
		name: "Gemini 3 Pro",
		provider: "Google",
	},
	{
		description: "Low-latency multimodal",
		id: "gemini-3-flash",
		name: "Gemini 3 Flash",
		provider: "Google",
	},
	{
		description: "Open-weights frontier model",
		id: "llama-4-maverick",
		name: "Llama 4 Maverick",
		provider: "Meta",
	},
];

const PROVIDERS = [...new Set(MODELS.map((model) => model.provider))];

function ModelSelectorStory() {
	const [value, setValue] = React.useState<string | undefined>(
		"claude-sonnet-4-5",
	);
	const selected = MODELS.find((model) => model.id === value);

	return (
		<View className="h-[560px] w-full items-center pt-4">
			<ModelSelector onValueChange={setValue} value={value}>
				<ModelSelectorTrigger>
					<ModelSelectorValue placeholder="Select a model">
						{selected?.name}
					</ModelSelectorValue>
				</ModelSelectorTrigger>
				<ModelSelectorContent>
					<ModelSelectorInput />
					<ModelSelectorList>
						<ModelSelectorEmpty />
						{PROVIDERS.map((provider, providerIndex) => (
							<React.Fragment key={provider}>
								{providerIndex > 0 ? <ModelSelectorSeparator /> : null}
								<ModelSelectorGroup>
									{MODELS.filter((model) => model.provider === provider).map(
										(model) => (
											<ModelSelectorItem
												key={model.id}
												keywords={[model.name, model.provider]}
												value={model.id}
											>
												<View className="flex-1 flex-row items-center gap-2">
													<ModelSelectorName className="flex-none">
														{model.name}
													</ModelSelectorName>
													<Text className="text-muted-foreground text-xs">
														{model.provider}
													</Text>
												</View>
											</ModelSelectorItem>
										),
									)}
								</ModelSelectorGroup>
							</React.Fragment>
						))}
					</ModelSelectorList>
				</ModelSelectorContent>
			</ModelSelector>
			{selected ? (
				<Text className="mt-3 text-muted-foreground text-xs">
					Selected: {selected.name} ({selected.provider})
				</Text>
			) : null}
		</View>
	);
}

function ModelSelectorDescriptionsStory() {
	const [value, setValue] = React.useState<string | undefined>(undefined);
	const selected = MODELS.find((model) => model.id === value);

	return (
		<View className="h-[560px] w-full items-center pt-4">
			<ModelSelector onValueChange={setValue} value={value}>
				<ModelSelectorTrigger>
					<ModelSelectorValue placeholder="Select a model">
						{selected?.name}
					</ModelSelectorValue>
				</ModelSelectorTrigger>
				<ModelSelectorContent snapPoints={["75%"]}>
					<ModelSelectorInput />
					<ModelSelectorList>
						<ModelSelectorEmpty />
						{MODELS.map((model) => (
							<ModelSelectorItem
								key={model.id}
								keywords={[model.name, model.provider, model.description]}
								value={model.id}
							>
								<View className="flex-1 gap-0.5">
									<ModelSelectorName>{model.name}</ModelSelectorName>
									<Text className="text-muted-foreground text-xs">
										{model.provider} · {model.description}
									</Text>
								</View>
							</ModelSelectorItem>
						))}
					</ModelSelectorList>
				</ModelSelectorContent>
			</ModelSelector>
		</View>
	);
}

const meta = {
	title: "ai-elements/ModelSelector",
	component: ModelSelector,
} satisfies Meta<typeof ModelSelector>;

export default meta;

type Story = StoryObj<Record<string, never>>;

export const Default: Story = {
	render: () => <ModelSelectorStory />,
};

export const WithDescriptions: Story = {
	render: () => <ModelSelectorDescriptionsStory />,
};
