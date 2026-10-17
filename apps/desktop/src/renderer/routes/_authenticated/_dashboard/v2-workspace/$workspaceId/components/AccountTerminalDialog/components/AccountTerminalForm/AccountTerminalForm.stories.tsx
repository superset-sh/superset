import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { expect, fn, userEvent, within } from "storybook/test";
import { AccountTerminalForm } from "./AccountTerminalForm";

const meta = {
	component: AccountTerminalForm,
	decorators: [
		(Story) => (
			<Dialog open>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Agent terminal with account</DialogTitle>
						<DialogDescription>
							Start a new terminal using an existing login. Other chats and your
							default account stay unchanged.
						</DialogDescription>
					</DialogHeader>
					<Story />
				</DialogContent>
			</Dialog>
		),
	],
	args: {
		configs: [
			{ id: "review-claude", label: "Claude" },
			{ id: "review-codex", label: "Codex" },
		],
		configId: "review-claude",
		onConfigChange: fn(),
		accounts: [
			{
				selection: null,
				identity: "a".repeat(64),
				email: "review@example.test",
				label: "System account",
			},
			{
				selection: "/review/profiles/claude-work",
				identity: "b".repeat(64),
				email: "work@example.test",
				label: "/review/profiles/claude-work",
			},
		],
		loading: false,
		refreshing: false,
		error: null,
		launching: false,
		onRefresh: fn(async () => {}),
		onCancel: fn(),
		onLaunch: fn(async () => {}),
	},
} satisfies Meta<typeof AccountTerminalForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
	play: async ({ canvasElement }) => {
		const dialog = within(canvasElement.ownerDocument.body);
		await userEvent.click(
			dialog.getByRole("radio", { name: /review@example.test/ }),
		);
		await expect(
			dialog.getByRole("button", { name: "Start terminal" }),
		).toBeEnabled();
	},
};

export const Loading: Story = {
	args: { accounts: [], loading: true, refreshing: true },
};

export const Empty: Story = {
	args: { accounts: [] },
};

export const UnsupportedHost: Story = {
	args: {
		accounts: [],
		error: "Update this host to choose an account for a new terminal.",
	},
};
