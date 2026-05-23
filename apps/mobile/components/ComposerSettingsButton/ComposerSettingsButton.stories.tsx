import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	ComposerSettingsButton,
	type PermissionMode,
	type ThinkingLevel,
} from "./ComposerSettingsButton";

const PERMISSION_MODES: PermissionMode[] = [
	"default",
	"acceptEdits",
	"plan",
	"bypassPermissions",
];
const THINKING_LEVELS: ThinkingLevel[] = [
	"off",
	"low",
	"medium",
	"high",
	"xhigh",
];

const meta: Meta<typeof ComposerSettingsButton> = {
	title: "Molecules/ComposerSettingsButton",
	component: ComposerSettingsButton,
	parameters: {
		docs: {
			description: {
				component:
					"Single trigger pill on the composer that opens the composer-settings bottom sheet. Mirrors desktop `ComposerSettingsMenu` (PR #4866 / SUPER-755) — consolidates legacy 3 sibling pills (Model · Permission · Thinking) into one tap surface. Anatomy: [Shield(perm-variant)] [ModelName(truncate)] [Brain(status)]. State via semantic color, never opacity. The bottom-sheet itself is an organism deferred to Wave 3.",
			},
		},
		layout: "centered",
	},
	args: {
		modelName: "Sonnet 4.6",
		permissionMode: "default",
		thinkingLevel: "off",
		isOpen: false,
		disabled: false,
	},
	argTypes: {
		modelName: {
			control: "text",
			description: "Currently selected model name — truncates at ~180pt",
		},
		permissionMode: {
			control: { type: "select" },
			options: PERMISSION_MODES,
			description: "Drives the Shield icon variant",
		},
		thinkingLevel: {
			control: { type: "select" },
			options: THINKING_LEVELS,
			description:
				"Off → brain icon muted color; any non-off level → foreground color",
		},
		isOpen: {
			control: "boolean",
			description:
				"When sheet is open: bg→accent + accessibilityState.expanded",
		},
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof ComposerSettingsButton>;

export const Default: Story = {};

export const ThinkingOn: Story = {
	args: { thinkingLevel: "medium" },
};

export const AcceptEditsPermission: Story = {
	args: { permissionMode: "acceptEdits" },
};

export const BypassPermissions: Story = {
	args: { permissionMode: "bypassPermissions", thinkingLevel: "high" },
};

export const LongModelName: Story = {
	args: { modelName: "Anthropic Claude Opus 4.7 Extended" },
};

export const Open: Story = {
	args: { isOpen: true },
};

export const AllPermissionStates: Story = {
	render: () => (
		<View className="gap-2 items-start p-4">
			{PERMISSION_MODES.map((pm) => (
				<ComposerSettingsButton
					key={pm}
					modelName="Sonnet 4.6"
					permissionMode={pm}
					thinkingLevel="off"
				/>
			))}
		</View>
	),
};

export const AllThinkingStates: Story = {
	render: () => (
		<View className="gap-2 items-start p-4">
			{THINKING_LEVELS.map((tl) => (
				<ComposerSettingsButton
					key={tl}
					modelName="Sonnet 4.6"
					permissionMode="default"
					thinkingLevel={tl}
				/>
			))}
		</View>
	),
};
