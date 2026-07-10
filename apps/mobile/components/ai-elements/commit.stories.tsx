import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Commit,
	CommitActions,
	CommitAuthor,
	CommitAuthorAvatar,
	CommitContent,
	CommitCopyButton,
	CommitFile,
	CommitFileAdditions,
	CommitFileChanges,
	CommitFileDeletions,
	CommitFileIcon,
	CommitFileInfo,
	CommitFilePath,
	CommitFileStatus,
	CommitFiles,
	CommitHash,
	CommitHeader,
	CommitInfo,
	CommitMessage,
	CommitMetadata,
	CommitSeparator,
	CommitTimestamp,
} from "@/components/ai-elements/commit";
import { Text } from "@/components/ui/text";

const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

const FILES = [
	{
		additions: 24,
		deletions: 6,
		path: "apps/relay/src/instrument.ts",
		status: "modified" as const,
	},
	{
		additions: 41,
		deletions: 0,
		path: "apps/relay/src/logging/console-filter.ts",
		status: "added" as const,
	},
	{
		additions: 0,
		deletions: 18,
		path: "apps/relay/src/legacy-logger.ts",
		status: "deleted" as const,
	},
];

const meta = {
	title: "ai-elements/Commit",
	component: Commit,
} satisfies Meta<typeof Commit>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<Commit defaultOpen>
				<CommitHeader>
					<CommitInfo>
						<CommitMessage>
							fix(relay): stop Sentry from buffering the console firehose
						</CommitMessage>
						<CommitMetadata>
							<CommitHash>5ab930d</CommitHash>
							<CommitSeparator />
							<CommitAuthor>
								<Text>Satya Patel</Text>
							</CommitAuthor>
							<CommitSeparator />
							<CommitTimestamp date={TWO_DAYS_AGO} />
						</CommitMetadata>
					</CommitInfo>
					<CommitActions>
						<CommitCopyButton hash="5ab930def" />
					</CommitActions>
				</CommitHeader>
				<CommitContent>
					<CommitFiles>
						{FILES.map((file) => (
							<CommitFile key={file.path}>
								<CommitFileInfo>
									<CommitFileStatus status={file.status} />
									<CommitFileIcon />
									<CommitFilePath>{file.path}</CommitFilePath>
								</CommitFileInfo>
								<CommitFileChanges>
									<CommitFileAdditions count={file.additions} />
									<CommitFileDeletions count={file.deletions} />
								</CommitFileChanges>
							</CommitFile>
						))}
					</CommitFiles>
				</CommitContent>
			</Commit>
		</View>
	),
};

export const WithAvatar: Story = {
	render: () => (
		<View className="w-full">
			<Commit>
				<CommitHeader>
					<CommitAuthor className="gap-3">
						<CommitAuthorAvatar initials="SP" />
						<CommitInfo>
							<CommitMessage>feat(models): add Opus 4.8</CommitMessage>
							<CommitMetadata>
								<CommitHash>59be1b7</CommitHash>
								<CommitSeparator />
								<CommitTimestamp date={TWO_DAYS_AGO} />
							</CommitMetadata>
						</CommitInfo>
					</CommitAuthor>
					<CommitActions>
						<CommitCopyButton hash="59be1b7a4" />
					</CommitActions>
				</CommitHeader>
				<CommitContent>
					<CommitFiles>
						<CommitFile>
							<CommitFileInfo>
								<CommitFileStatus status="modified" />
								<CommitFileIcon />
								<CommitFilePath>
									apps/desktop/src/models/model-switcher.tsx
								</CommitFilePath>
							</CommitFileInfo>
							<CommitFileChanges>
								<CommitFileAdditions count={8} />
								<CommitFileDeletions count={1} />
							</CommitFileChanges>
						</CommitFile>
					</CommitFiles>
				</CommitContent>
			</Commit>
		</View>
	),
};
