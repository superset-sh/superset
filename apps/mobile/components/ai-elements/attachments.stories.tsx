import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import type { AttachmentData } from "@/components/ai-elements/attachments";
import {
	Attachment,
	AttachmentEmpty,
	AttachmentInfo,
	AttachmentPreview,
	AttachmentRemove,
	Attachments,
} from "@/components/ai-elements/attachments";

const CHECKER_PNG_URI =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAH0lEQVR4nGNITvsIRHKa1kCEzGbAKYEpBGHjlqCDHQDa/UeBkkPfygAAAABJRU5ErkJggg==";

const imageAttachment: AttachmentData = {
	id: "attachment-1",
	type: "file",
	mediaType: "image/png",
	filename: "screenshot.png",
	url: CHECKER_PNG_URI,
};

const documentAttachment: AttachmentData = {
	id: "attachment-2",
	type: "file",
	mediaType: "application/pdf",
	filename: "quarterly-report.pdf",
	url: "https://example.com/quarterly-report.pdf",
};

const audioAttachment: AttachmentData = {
	id: "attachment-3",
	type: "file",
	mediaType: "audio/mpeg",
	filename: "voice-memo.mp3",
	url: "https://example.com/voice-memo.mp3",
};

const sourceAttachment: AttachmentData = {
	id: "attachment-4",
	type: "source-document",
	sourceId: "source-1",
	mediaType: "text/html",
	title: "React Native Docs",
};

const meta = {
	title: "ai-elements/Attachments",
	component: Attachments,
} satisfies Meta<typeof Attachments>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Grid: Story = {
	args: { variant: "grid" },
	render: (args) => (
		<View className="w-full p-4">
			<Attachments {...args}>
				<Attachment data={imageAttachment} onRemove={() => {}}>
					<AttachmentPreview />
					<AttachmentRemove />
				</Attachment>
				<Attachment data={documentAttachment} onRemove={() => {}}>
					<AttachmentPreview />
					<AttachmentRemove />
				</Attachment>
			</Attachments>
		</View>
	),
};

export const InlineChips: Story = {
	args: { variant: "inline" },
	render: (args) => (
		<View className="w-full p-4">
			<Attachments {...args}>
				<Attachment data={imageAttachment} onRemove={() => {}}>
					<AttachmentPreview />
					<AttachmentInfo />
					<AttachmentRemove />
				</Attachment>
				<Attachment data={documentAttachment} onRemove={() => {}}>
					<AttachmentPreview />
					<AttachmentInfo />
					<AttachmentRemove />
				</Attachment>
				<Attachment data={sourceAttachment}>
					<AttachmentPreview />
					<AttachmentInfo />
				</Attachment>
			</Attachments>
		</View>
	),
};

export const List: Story = {
	args: { variant: "list" },
	render: (args) => (
		<View className="w-full p-4">
			<Attachments {...args}>
				<Attachment data={imageAttachment} onRemove={() => {}}>
					<AttachmentPreview />
					<AttachmentInfo showMediaType />
					<AttachmentRemove />
				</Attachment>
				<Attachment data={audioAttachment} onRemove={() => {}}>
					<AttachmentPreview />
					<AttachmentInfo showMediaType />
					<AttachmentRemove />
				</Attachment>
				<Attachment data={sourceAttachment}>
					<AttachmentPreview />
					<AttachmentInfo showMediaType />
				</Attachment>
			</Attachments>
		</View>
	),
};

export const Empty: Story = {
	render: () => (
		<View className="w-full p-4">
			<AttachmentEmpty />
		</View>
	),
};
