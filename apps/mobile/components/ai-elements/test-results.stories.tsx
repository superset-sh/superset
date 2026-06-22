import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Test,
	TestError,
	TestErrorMessage,
	TestErrorStack,
	TestResults,
	TestResultsContent,
	TestResultsDuration,
	TestResultsHeader,
	TestResultsProgress,
	TestResultsSummary,
	TestSuite,
	TestSuiteContent,
	TestSuiteName,
	TestSuiteStats,
} from "@/components/ai-elements/test-results";
import { Text } from "@/components/ui/text";

const SUMMARY = {
	duration: 4812,
	failed: 2,
	passed: 38,
	skipped: 1,
	total: 41,
};

const meta = {
	title: "ai-elements/TestResults",
	component: TestResults,
} satisfies Meta<typeof TestResults>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SummaryOnly: Story = {
	render: () => (
		<View className="w-full">
			<TestResults summary={SUMMARY} />
		</View>
	),
};

export const WithSuites: Story = {
	render: () => (
		<View className="w-full">
			<TestResults summary={SUMMARY}>
				<TestResultsHeader>
					<TestResultsSummary />
					<TestResultsDuration />
				</TestResultsHeader>
				<TestResultsContent>
					<TestResultsProgress />
					<TestSuite defaultOpen name="create-session.test.ts" status="failed">
						<TestSuiteName>
							<Text className="font-medium text-sm">
								create-session.test.ts
							</Text>
							<TestSuiteStats failed={2} passed={3} skipped={1} />
						</TestSuiteName>
						<TestSuiteContent>
							<Test
								duration={12}
								name="creates a session for an online host"
								status="passed"
							/>
							<Test
								duration={9}
								name="rejects when the host is offline"
								status="passed"
							/>
							<Test
								duration={148}
								name="retries transient txid waits"
								status="failed"
							>
								<View className="flex-1">
									<TestError>
										<TestErrorMessage>
											expect(received).toBe(expected)
										</TestErrorMessage>
										<TestErrorStack>
											{
												"Expected: 3\nReceived: 2\n  at src/sessions/create-session.test.ts:88:29"
											}
										</TestErrorStack>
									</TestError>
								</View>
							</Test>
							<Test
								duration={75}
								name="emits workspace_created exactly once"
								status="failed"
							/>
							<Test name="skips seeding when row exists" status="skipped" />
						</TestSuiteContent>
					</TestSuite>
					<TestSuite name="resolve-workspace.test.ts" status="passed">
						<TestSuiteName>
							<Text className="font-medium text-sm">
								resolve-workspace.test.ts
							</Text>
							<TestSuiteStats passed={12} />
						</TestSuiteName>
						<TestSuiteContent>
							<Test duration={4} name="resolves by slug" status="passed" />
							<Test duration={6} name="resolves by id" status="passed" />
						</TestSuiteContent>
					</TestSuite>
					<TestSuite name="watcher.test.ts" status="running">
						<TestSuiteName />
					</TestSuite>
				</TestResultsContent>
			</TestResults>
		</View>
	),
};
