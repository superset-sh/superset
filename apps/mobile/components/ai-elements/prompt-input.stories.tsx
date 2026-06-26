import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import { View } from "react-native";
import {
	type ChatStatus,
	PromptInput,
	PromptInputActionAddAttachments,
	PromptInputActionMenu,
	PromptInputActionMenuContent,
	PromptInputActionMenuTrigger,
	type PromptInputAttachmentInput,
	PromptInputAttachments,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputProvider,
	PromptInputSelect,
	PromptInputSelectContent,
	PromptInputSelectItem,
	PromptInputSelectTrigger,
	PromptInputSelectValue,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import type { Option } from "@/components/ui/select";
import { Text } from "@/components/ui/text";

const MODELS: { value: string; label: string }[] = [
	{ label: "Opus 4.8", value: "claude-opus-4-8" },
	{ label: "Sonnet 4.5", value: "claude-sonnet-4-5" },
	{ label: "Haiku 4.5", value: "claude-haiku-4-5" },
];

function ComposerStory() {
	const [status, setStatus] = React.useState<ChatStatus>("ready");
	const [model, setModel] = React.useState<Option>(MODELS[1]);
	const [lastMessage, setLastMessage] =
		React.useState<PromptInputMessage | null>(null);

	const handleSubmit = React.useCallback((message: PromptInputMessage) => {
		setLastMessage(message);
		setStatus("submitted");
		setTimeout(() => setStatus("streaming"), 1200);
		setTimeout(() => setStatus("ready"), 3200);
	}, []);

	return (
		<View className="w-full gap-3">
			<PromptInput onSubmit={handleSubmit}>
				<PromptInputBody>
					<PromptInputAttachments />
					<PromptInputTextarea />
				</PromptInputBody>
				<PromptInputFooter>
					<PromptInputTools>
						<PromptInputActionMenu>
							<PromptInputActionMenuTrigger />
							<PromptInputActionMenuContent>
								<PromptInputActionAddAttachments label="Add photos" />
								<PromptInputActionAddAttachments
									label="Add files"
									source="files"
								/>
							</PromptInputActionMenuContent>
						</PromptInputActionMenu>
						<PromptInputSelect onValueChange={setModel} value={model}>
							<PromptInputSelectTrigger>
								<PromptInputSelectValue placeholder="Model" />
							</PromptInputSelectTrigger>
							<PromptInputSelectContent>
								{MODELS.map((item) => (
									<PromptInputSelectItem
										key={item.value}
										label={item.label}
										value={item.value}
									/>
								))}
							</PromptInputSelectContent>
						</PromptInputSelect>
					</PromptInputTools>
					<PromptInputSubmit
						onStop={() => setStatus("ready")}
						status={status}
					/>
				</PromptInputFooter>
			</PromptInput>
			{lastMessage ? (
				<Text className="text-muted-foreground text-xs">
					Submitted: "{lastMessage.text}" with {lastMessage.attachments.length}{" "}
					attachment(s)
				</Text>
			) : null}
		</View>
	);
}

const SEED_ATTACHMENTS: PromptInputAttachmentInput[] = [
	{
		mediaType: "image/jpeg",
		name: "screenshot.jpg",
		type: "image",
		uri: "https://picsum.photos/seed/superset-1/200",
	},
	{
		mediaType: "image/jpeg",
		name: "diagram.jpg",
		type: "image",
		uri: "https://picsum.photos/seed/superset-2/200",
	},
	{
		mediaType: "application/pdf",
		name: "quarterly-report.pdf",
		size: 482133,
		type: "file",
		uri: "file:///tmp/quarterly-report.pdf",
	},
];

function SeedAttachments() {
	const controller = usePromptInputController();
	const seeded = React.useRef(false);

	React.useEffect(() => {
		if (seeded.current) {
			return;
		}
		seeded.current = true;
		controller.attachments.add(SEED_ATTACHMENTS);
	}, [controller]);

	return null;
}

function AttachmentsStory() {
	return (
		<PromptInputProvider initialInput="Summarize these files">
			<SeedAttachments />
			<PromptInput onSubmit={(message) => console.log("submitted", message)}>
				<PromptInputBody>
					<PromptInputAttachments />
					<PromptInputTextarea />
				</PromptInputBody>
				<PromptInputFooter>
					<PromptInputTools>
						<PromptInputActionMenu>
							<PromptInputActionMenuTrigger />
							<PromptInputActionMenuContent>
								<PromptInputActionAddAttachments />
							</PromptInputActionMenuContent>
						</PromptInputActionMenu>
					</PromptInputTools>
					<PromptInputSubmit />
				</PromptInputFooter>
			</PromptInput>
		</PromptInputProvider>
	);
}

const STATUSES: ChatStatus[] = ["ready", "submitted", "streaming", "error"];

function SubmitStatusStory() {
	return (
		<PromptInput onSubmit={() => undefined}>
			<PromptInputBody>
				<PromptInputTextarea placeholder="Each status renders its own icon" />
			</PromptInputBody>
			<PromptInputFooter className="justify-around py-4">
				{STATUSES.map((status) => (
					<View className="items-center gap-2" key={status}>
						<PromptInputSubmit
							disabled={false}
							onStop={() => undefined}
							status={status}
						/>
						<Text className="text-muted-foreground text-xs">{status}</Text>
					</View>
				))}
			</PromptInputFooter>
		</PromptInput>
	);
}

const meta = {
	title: "ai-elements/PromptInput",
	component: PromptInput,
} satisfies Meta<typeof PromptInput>;

export default meta;

type Story = StoryObj<Record<string, never>>;

export const Composer: Story = {
	render: () => <ComposerStory />,
};

export const WithAttachments: Story = {
	render: () => <AttachmentsStory />,
};

export const SubmitStatuses: Story = {
	render: () => <SubmitStatusStory />,
};
