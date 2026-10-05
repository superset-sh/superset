import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceArchivedState } from "./CloudWorkspaceArchivedState";

const meta = {
	component: CloudWorkspaceArchivedState,
	args: {
		name: "turbo env probe",
		archivedAt: new Date("2026-09-26T12:00:00Z"),
		now: new Date("2026-09-29T12:00:00Z"),
		onUnarchive: fn(),
	},
	decorators: [
		(Story) => (
			<div className="h-[600px] w-[900px] bg-background">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof CloudWorkspaceArchivedState>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
