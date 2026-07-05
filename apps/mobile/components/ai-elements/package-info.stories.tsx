import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	PackageInfo,
	PackageInfoChangeType,
	PackageInfoContent,
	PackageInfoDependencies,
	PackageInfoDependency,
	PackageInfoDescription,
	PackageInfoHeader,
	PackageInfoName,
	PackageInfoVersion,
} from "@/components/ai-elements/package-info";

const meta = {
	title: "ai-elements/PackageInfo",
	component: PackageInfo,
} satisfies Meta<typeof PackageInfo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MinorUpgrade: Story = {
	args: {
		changeType: "minor",
		currentVersion: "5.81.2",
		name: "@tanstack/react-query",
		newVersion: "5.84.0",
	},
	render: (args) => (
		<View className="w-full">
			<PackageInfo {...args} />
		</View>
	),
};

export const Added: Story = {
	args: {
		changeType: "added",
		name: "expo-clipboard",
		newVersion: "7.0.1",
	},
	render: (args) => (
		<View className="w-full">
			<PackageInfo {...args} />
		</View>
	),
};

export const Removed: Story = {
	args: {
		changeType: "removed",
		currentVersion: "1.6.2",
		name: "moment",
	},
	render: (args) => (
		<View className="w-full">
			<PackageInfo {...args} />
		</View>
	),
};

export const WithDetails: Story = {
	args: {
		changeType: "major",
		currentVersion: "3.4.17",
		name: "tailwindcss",
		newVersion: "4.1.0",
	},
	render: (args) => (
		<View className="w-full">
			<PackageInfo {...args}>
				<PackageInfoHeader>
					<PackageInfoName />
					<PackageInfoChangeType />
				</PackageInfoHeader>
				<PackageInfoVersion />
				<PackageInfoDescription>
					A utility-first CSS framework for rapidly building custom user
					interfaces.
				</PackageInfoDescription>
				<PackageInfoContent>
					<PackageInfoDependencies>
						<PackageInfoDependency name="postcss" version="^8.4.0" />
						<PackageInfoDependency name="lightningcss" version="^1.29.0" />
					</PackageInfoDependencies>
				</PackageInfoContent>
			</PackageInfo>
		</View>
	),
};
