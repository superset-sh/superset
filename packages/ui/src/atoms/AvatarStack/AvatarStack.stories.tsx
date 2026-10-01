import type { Meta, StoryObj } from "@storybook/react-vite";
import { AvatarStack } from "./AvatarStack";

const meta = {
	title: "Atoms/AvatarStack",
	component: AvatarStack,
	args: {
		size: 20,
		people: [{ id: "kiet", name: "Kiet Ho" }],
	},
} satisfies Meta<typeof AvatarStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

export const SingleIdle: Story = {
	args: {
		people: [{ id: "kiet", name: "Kiet Ho", isActive: false }],
	},
};

export const SidebarOwner: Story = {
	name: "On the sidebar",
	args: { surface: "sidebar" },
};

export const Photo: Story = {
	args: {
		people: [
			{ id: "octo", name: "GitHub", image: "https://github.com/github.png" },
		],
	},
};

export const Stacked: Story = {
	args: {
		people: [
			{ id: "octo", name: "GitHub", image: "https://github.com/github.png" },
			{ id: "kiet", name: "Kiet Ho" },
			{ id: "avi", name: "Avi Peltz" },
		],
	},
};

export const StackedSomeIdle: Story = {
	args: {
		people: [
			{ id: "octo", name: "GitHub", image: "https://github.com/github.png" },
			{ id: "kiet", name: "Kiet Ho", isActive: false },
			{ id: "avi", name: "Avi Peltz", isActive: false },
		],
	},
};

export const Overflow: Story = {
	args: {
		people: [
			{ id: "octo", name: "GitHub", image: "https://github.com/github.png" },
			{ id: "kiet", name: "Kiet Ho" },
			{ id: "avi", name: "Avi Peltz" },
			{ id: "harshith", name: "Harshith Mullapudi" },
			{ id: "xavier", name: "Xavier" },
		],
	},
};

export const Sizes: Story = {
	render: () => (
		<div className="flex items-center gap-3">
			<AvatarStack size={16} people={[{ id: "kiet", name: "Kiet Ho" }]} />
			<AvatarStack size={18} people={[{ id: "kiet", name: "Kiet Ho" }]} />
			<AvatarStack size={20} people={[{ id: "kiet", name: "Kiet Ho" }]} />
			<AvatarStack size={24} people={[{ id: "kiet", name: "Kiet Ho" }]} />
		</div>
	),
};
