import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { expect, fn, userEvent, within } from "storybook/test";
import { SavedConversationsForm } from "./SavedConversationsForm";

const meta = {
	component: SavedConversationsForm,
	decorators: [
		(Story) => (
			<Dialog open>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Open saved Claude conversation</DialogTitle>
						<DialogDescription>
							Open history from this account in the current workspace. Later
							opens use current local history. Background work is not
							transferred.
						</DialogDescription>
					</DialogHeader>
					<Story />
				</DialogContent>
			</Dialog>
		),
	],
	args: {
		accountLabel: "review@example.test",
		rows: [
			"11111111-1111-4111-8111-111111111111",
			"22222222-2222-4222-8222-222222222222",
		].map((nativeSessionId) => ({
			id: nativeSessionId,
			nativeSessionId,
			lastModifiedAt: Date.UTC(2026, 9, 9, 18),
			conversationId: null,
			revision: "fixture-revision",
			canFocusExisting: false,
		})),
		loading: false,
		refreshing: false,
		pending: false,
		hasMore: false,
		error: null,
		onBack: fn(),
		onRefresh: fn(async () => {}),
		onLoadMore: fn(async () => {}),
		onOpen: fn(async () => {}),
	},
} satisfies Meta<typeof SavedConversationsForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = {
	play: async ({ canvasElement }) => {
		const dialog = within(canvasElement.ownerDocument.body);
		await userEvent.click(dialog.getAllByRole("radio")[0] as HTMLElement);
		await userEvent.click(dialog.getByRole("checkbox"));
		await expect(
			dialog.getByRole("button", { name: "Open conversation" }),
		).toBeEnabled();
	},
};
export const Loading: Story = { args: { rows: [], loading: true } };
export const Empty: Story = { args: { rows: [] } };
export const UnsupportedHost: Story = {
	args: { rows: [], error: "Update this host to open saved Claude history." },
};
