import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	EnvironmentVariable,
	EnvironmentVariableCopyButton,
	EnvironmentVariableGroup,
	EnvironmentVariableName,
	EnvironmentVariableRequired,
	EnvironmentVariables,
	EnvironmentVariablesContent,
	EnvironmentVariablesHeader,
	EnvironmentVariablesTitle,
	EnvironmentVariablesToggle,
	EnvironmentVariableValue,
} from "@/components/ai-elements/environment-variables";

const VARIABLES = [
	{
		name: "DATABASE_URL",
		value: "postgres://app:secret@db.internal:5432/prod",
	},
	{ name: "BETTER_AUTH_SECRET", value: "ba_4f9c2d8e1a7b3c5d9e0f" },
	{ name: "POSTHOG_API_KEY", value: "phc_Zx81mKp2Qw4Rt7Yv" },
];

const meta = {
	title: "ai-elements/EnvironmentVariables",
	component: EnvironmentVariables,
} satisfies Meta<typeof EnvironmentVariables>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<EnvironmentVariables>
				<EnvironmentVariablesHeader>
					<EnvironmentVariablesTitle />
					<EnvironmentVariablesToggle />
				</EnvironmentVariablesHeader>
				<EnvironmentVariablesContent>
					{VARIABLES.map((variable) => (
						<EnvironmentVariable key={variable.name} {...variable} />
					))}
				</EnvironmentVariablesContent>
			</EnvironmentVariables>
		</View>
	),
};

export const ValuesVisible: Story = {
	render: () => (
		<View className="w-full">
			<EnvironmentVariables defaultShowValues>
				<EnvironmentVariablesHeader>
					<EnvironmentVariablesTitle />
					<EnvironmentVariablesToggle />
				</EnvironmentVariablesHeader>
				<EnvironmentVariablesContent>
					{VARIABLES.map((variable) => (
						<EnvironmentVariable key={variable.name} {...variable} />
					))}
				</EnvironmentVariablesContent>
			</EnvironmentVariables>
		</View>
	),
};

export const WithActions: Story = {
	render: () => (
		<View className="w-full">
			<EnvironmentVariables>
				<EnvironmentVariablesHeader>
					<EnvironmentVariablesTitle>Relay secrets</EnvironmentVariablesTitle>
					<EnvironmentVariablesToggle />
				</EnvironmentVariablesHeader>
				<EnvironmentVariablesContent>
					<EnvironmentVariable
						name="SENTRY_DSN"
						value="https://abc123@o4505.ingest.sentry.io/451"
					>
						<EnvironmentVariableGroup>
							<EnvironmentVariableName />
							<EnvironmentVariableRequired />
						</EnvironmentVariableGroup>
						<EnvironmentVariableGroup className="shrink">
							<EnvironmentVariableValue className="shrink" />
							<EnvironmentVariableCopyButton copyFormat="export" />
						</EnvironmentVariableGroup>
					</EnvironmentVariable>
					<EnvironmentVariable name="FLY_API_TOKEN" value="fo1_9d8c7b6a5e4f">
						<EnvironmentVariableGroup>
							<EnvironmentVariableName />
						</EnvironmentVariableGroup>
						<EnvironmentVariableGroup className="shrink">
							<EnvironmentVariableValue className="shrink" />
							<EnvironmentVariableCopyButton />
						</EnvironmentVariableGroup>
					</EnvironmentVariable>
				</EnvironmentVariablesContent>
			</EnvironmentVariables>
		</View>
	),
};
