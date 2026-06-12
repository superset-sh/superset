import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { BashTool } from "@/components/ai-elements/bash-tool";

const TYPECHECK_OUTPUT = `$ tsc --noEmit
✓ No type errors found in 412 files
Done in 8.43s`;

const LONG_OUTPUT = Array.from(
	{ length: 60 },
	(_, i) =>
		`[${String(i + 1).padStart(2, "0")}/60] compiling apps/desktop/src/module-${i + 1}.ts`,
).join("\n");

const meta = {
	title: "ai-elements/BashTool",
	component: BashTool,
	args: {
		state: "output-available",
	},
} satisfies Meta<typeof BashTool>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<BashTool
				command="bun run typecheck"
				exitCode={0}
				state="output-available"
				stdout={TYPECHECK_OUTPUT}
			/>
		</View>
	),
};

export const Pending: Story = {
	render: () => (
		<View className="w-full">
			<BashTool
				command="bun install && bun run build --filter=@superset/mobile"
				state="input-available"
			/>
		</View>
	),
};

export const Failed: Story = {
	render: () => (
		<View className="w-full">
			<BashTool
				command="bun run lint"
				exitCode={1}
				state="output-error"
				stderr={`apps/mobile/components/ai-elements/tool.tsx:42:18 lint/suspicious/noExplicitAny
  × Unexpected any. Specify a different type.

Checked 412 files in 318ms. Found 1 error.`}
				stdout=""
			/>
		</View>
	),
};

export const LongOutput: Story = {
	render: () => (
		<View className="w-full">
			<BashTool
				command="bun run build"
				exitCode={0}
				state="output-available"
				stdout={LONG_OUTPUT}
			/>
		</View>
	),
};

export const PipelineWithWarnings: Story = {
	render: () => (
		<View className="w-full">
			<BashTool
				command={`git status --short | head -20 && git log --oneline -5; echo "done"`}
				exitCode={0}
				state="output-available"
				stderr="warning: in the working copy of 'bun.lock', LF will be replaced by CRLF"
				stdout={` M apps/mobile/components/ai-elements/tool.tsx
?? apps/mobile/components/ai-elements/bash-tool.tsx
5ab930def fix(relay): stop Sentry from buffering the console firehose
f276eb22f fix(desktop): restore PostHog identity stitching
done`}
			/>
		</View>
	),
};
