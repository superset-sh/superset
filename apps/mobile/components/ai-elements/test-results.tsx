import { useControllableState } from "@rn-primitives/hooks";
import type { LucideIcon } from "lucide-react-native";
import {
	CheckCircle2Icon,
	ChevronRightIcon,
	CircleDotIcon,
	CircleIcon,
	XCircleIcon,
} from "lucide-react-native";
import { createContext, useContext, useMemo } from "react";
import { View } from "react-native";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type TestRunStatus = "passed" | "failed" | "skipped" | "running";

interface TestResultsSummaryData {
	passed: number;
	failed: number;
	skipped: number;
	total: number;
	duration?: number;
}

interface TestResultsContextType {
	summary?: TestResultsSummaryData;
}

const TestResultsContext = createContext<TestResultsContextType>({});

const formatDuration = (ms: number) => {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
};

export type TestResultsHeaderProps = React.ComponentProps<typeof View>;

export const TestResultsHeader = ({
	className,
	children,
	...props
}: TestResultsHeaderProps) => (
	<View
		className={cn(
			"flex-row items-center justify-between border-border border-b px-4 py-3",
			className,
		)}
		{...props}
	>
		{children}
	</View>
);

export type TestResultsDurationProps = React.ComponentProps<typeof Text>;

export const TestResultsDuration = ({
	className,
	children,
	...props
}: TestResultsDurationProps) => {
	const { summary } = useContext(TestResultsContext);

	if (!summary?.duration) {
		return null;
	}

	return (
		<Text className={cn("text-muted-foreground text-sm", className)} {...props}>
			{children ?? formatDuration(summary.duration)}
		</Text>
	);
};

export type TestResultsSummaryProps = React.ComponentProps<typeof View>;

export const TestResultsSummary = ({
	className,
	children,
	...props
}: TestResultsSummaryProps) => {
	const { summary } = useContext(TestResultsContext);

	if (!summary) {
		return null;
	}

	return (
		<View className={cn("flex-row items-center gap-3", className)} {...props}>
			{children ?? (
				<>
					<Badge
						className="gap-1 bg-green-100 dark:bg-green-900/30"
						variant="secondary"
					>
						<Icon
							as={CheckCircle2Icon}
							className="size-3 text-green-700 dark:text-green-400"
						/>
						<Text className="text-green-700 dark:text-green-400">
							{summary.passed} passed
						</Text>
					</Badge>
					{summary.failed > 0 && (
						<Badge
							className="gap-1 bg-red-100 dark:bg-red-900/30"
							variant="secondary"
						>
							<Icon
								as={XCircleIcon}
								className="size-3 text-red-700 dark:text-red-400"
							/>
							<Text className="text-red-700 dark:text-red-400">
								{summary.failed} failed
							</Text>
						</Badge>
					)}
					{summary.skipped > 0 && (
						<Badge
							className="gap-1 bg-yellow-100 dark:bg-yellow-900/30"
							variant="secondary"
						>
							<Icon
								as={CircleIcon}
								className="size-3 text-yellow-700 dark:text-yellow-400"
							/>
							<Text className="text-yellow-700 dark:text-yellow-400">
								{summary.skipped} skipped
							</Text>
						</Badge>
					)}
				</>
			)}
		</View>
	);
};

export type TestResultsProps = React.ComponentProps<typeof View> & {
	summary?: TestResultsSummaryData;
};

export const TestResults = ({
	summary,
	className,
	children,
	...props
}: TestResultsProps) => {
	const contextValue = useMemo(() => ({ summary }), [summary]);

	return (
		<TestResultsContext.Provider value={contextValue}>
			<View
				className={cn(
					"rounded-lg border border-border bg-background",
					className,
				)}
				{...props}
			>
				{children ??
					(summary && (
						<TestResultsHeader>
							<TestResultsSummary />
							<TestResultsDuration />
						</TestResultsHeader>
					))}
			</View>
		</TestResultsContext.Provider>
	);
};

export type TestResultsProgressProps = React.ComponentProps<typeof View>;

export const TestResultsProgress = ({
	className,
	children,
	...props
}: TestResultsProgressProps) => {
	const { summary } = useContext(TestResultsContext);

	if (!summary) {
		return null;
	}

	const passedPercent = (summary.passed / summary.total) * 100;
	const failedPercent = (summary.failed / summary.total) * 100;

	return (
		<View className={cn("gap-2", className)} {...props}>
			{children ?? (
				<>
					<View className="h-2 flex-row overflow-hidden rounded-full bg-muted">
						<View
							className="bg-green-500"
							style={{ width: `${passedPercent}%` }}
						/>
						<View
							className="bg-red-500"
							style={{ width: `${failedPercent}%` }}
						/>
					</View>
					<View className="flex-row justify-between">
						<Text className="text-muted-foreground text-xs">
							{summary.passed}/{summary.total} tests passed
						</Text>
						<Text className="text-muted-foreground text-xs">
							{passedPercent.toFixed(0)}%
						</Text>
					</View>
				</>
			)}
		</View>
	);
};

export type TestResultsContentProps = React.ComponentProps<typeof View>;

export const TestResultsContent = ({
	className,
	children,
	...props
}: TestResultsContentProps) => (
	<View className={cn("gap-2 p-4", className)} {...props}>
		{children}
	</View>
);

interface TestSuiteContextType {
	name: string;
	status: TestRunStatus;
	isOpen: boolean;
}

const TestSuiteContext = createContext<TestSuiteContextType>({
	isOpen: false,
	name: "",
	status: "passed",
});

const statusStyles: Record<TestRunStatus, string> = {
	failed: "text-red-600 dark:text-red-400",
	passed: "text-green-600 dark:text-green-400",
	running: "text-blue-600 dark:text-blue-400",
	skipped: "text-yellow-600 dark:text-yellow-400",
};

const statusIcons: Record<TestRunStatus, LucideIcon> = {
	failed: XCircleIcon,
	passed: CheckCircle2Icon,
	running: CircleDotIcon,
	skipped: CircleIcon,
};

const TestStatusIcon = ({ status }: { status: TestRunStatus }) => (
	<Icon
		as={statusIcons[status]}
		className={cn("size-4 shrink-0", statusStyles[status])}
	/>
);

export type TestSuiteProps = React.ComponentProps<typeof Collapsible> & {
	name: string;
	status: TestRunStatus;
};

export const TestSuite = ({
	name,
	status,
	className,
	children,
	open,
	defaultOpen,
	onOpenChange,
	...props
}: TestSuiteProps) => {
	const [isOpenState, setIsOpen] = useControllableState<boolean>({
		defaultProp: defaultOpen ?? false,
		onChange: onOpenChange,
		prop: open,
	});
	const isOpen = isOpenState ?? false;
	const contextValue = useMemo(
		() => ({ isOpen, name, status }),
		[isOpen, name, status],
	);

	return (
		<TestSuiteContext.Provider value={contextValue}>
			<Collapsible
				className={cn("rounded-lg border border-border", className)}
				onOpenChange={setIsOpen}
				open={isOpen}
				{...props}
			>
				{children}
			</Collapsible>
		</TestSuiteContext.Provider>
	);
};

export type TestSuiteNameProps = React.ComponentProps<
	typeof CollapsibleTrigger
>;

export const TestSuiteName = ({
	className,
	children,
	...props
}: TestSuiteNameProps) => {
	const { name, status, isOpen } = useContext(TestSuiteContext);

	return (
		<CollapsibleTrigger
			className={cn("w-full flex-row items-center gap-2 px-4 py-3", className)}
			{...props}
		>
			<View style={isOpen ? { transform: [{ rotate: "90deg" }] } : undefined}>
				<Icon
					as={ChevronRightIcon}
					className="size-4 shrink-0 text-muted-foreground"
				/>
			</View>
			<TestStatusIcon status={status} />
			{children == null || typeof children === "string" ? (
				<Text className="font-medium text-sm">{children ?? name}</Text>
			) : typeof children === "function" ? null : (
				children
			)}
		</CollapsibleTrigger>
	);
};

export type TestSuiteStatsProps = React.ComponentProps<typeof View> & {
	passed?: number;
	failed?: number;
	skipped?: number;
};

export const TestSuiteStats = ({
	passed = 0,
	failed = 0,
	skipped = 0,
	className,
	children,
	...props
}: TestSuiteStatsProps) => (
	<View
		className={cn("ml-auto flex-row items-center gap-2", className)}
		{...props}
	>
		{children ?? (
			<>
				{passed > 0 && (
					<Text className="text-green-600 text-xs dark:text-green-400">
						{passed} passed
					</Text>
				)}
				{failed > 0 && (
					<Text className="text-red-600 text-xs dark:text-red-400">
						{failed} failed
					</Text>
				)}
				{skipped > 0 && (
					<Text className="text-xs text-yellow-600 dark:text-yellow-400">
						{skipped} skipped
					</Text>
				)}
			</>
		)}
	</View>
);

export type TestSuiteContentProps = React.ComponentProps<
	typeof CollapsibleContent
>;

export const TestSuiteContent = ({
	className,
	children,
	...props
}: TestSuiteContentProps) => (
	<CollapsibleContent
		className={cn("border-border border-t", className)}
		{...props}
	>
		<View>{children}</View>
	</CollapsibleContent>
);

interface TestContextType {
	name: string;
	status: TestRunStatus;
	duration?: number;
}

const TestContext = createContext<TestContextType>({
	name: "",
	status: "passed",
});

export type TestNameProps = React.ComponentProps<typeof Text>;

export const TestName = ({ className, children, ...props }: TestNameProps) => {
	const { name } = useContext(TestContext);

	return (
		<Text className={cn("flex-1", className)} {...props}>
			{children ?? name}
		</Text>
	);
};

export type TestDurationProps = React.ComponentProps<typeof Text>;

export const TestDuration = ({
	className,
	children,
	...props
}: TestDurationProps) => {
	const { duration } = useContext(TestContext);

	if (duration === undefined) {
		return null;
	}

	return (
		<Text
			className={cn("ml-auto text-muted-foreground text-xs", className)}
			{...props}
		>
			{children ?? `${duration}ms`}
		</Text>
	);
};

export type TestStatusProps = React.ComponentProps<typeof View>;

export const TestStatus = ({
	className,
	children,
	...props
}: TestStatusProps) => {
	const { status } = useContext(TestContext);

	return (
		<View className={cn("shrink-0", className)} {...props}>
			{children ?? <TestStatusIcon status={status} />}
		</View>
	);
};

export type TestProps = React.ComponentProps<typeof View> & {
	name: string;
	status: TestRunStatus;
	duration?: number;
};

export const Test = ({
	name,
	status,
	duration,
	className,
	children,
	...props
}: TestProps) => {
	const contextValue = useMemo(
		() => ({ duration, name, status }),
		[duration, name, status],
	);

	return (
		<TestContext.Provider value={contextValue}>
			<View
				className={cn("flex-row items-center gap-2 px-4 py-2", className)}
				{...props}
			>
				{children ?? (
					<>
						<TestStatus />
						<TestName className="text-sm" />
						{duration !== undefined && <TestDuration />}
					</>
				)}
			</View>
		</TestContext.Provider>
	);
};

export type TestErrorProps = React.ComponentProps<typeof View>;

export const TestError = ({
	className,
	children,
	...props
}: TestErrorProps) => (
	<View
		className={cn(
			"mt-2 rounded-md bg-red-50 p-3 dark:bg-red-900/20",
			className,
		)}
		{...props}
	>
		{children}
	</View>
);

export type TestErrorMessageProps = React.ComponentProps<typeof Text>;

export const TestErrorMessage = ({
	className,
	children,
	...props
}: TestErrorMessageProps) => (
	<Text
		className={cn(
			"font-medium text-red-700 text-sm dark:text-red-400",
			className,
		)}
		{...props}
	>
		{children}
	</Text>
);

export type TestErrorStackProps = React.ComponentProps<typeof Text>;

export const TestErrorStack = ({
	className,
	children,
	...props
}: TestErrorStackProps) => (
	<Text
		className={cn(
			"mt-2 font-mono text-red-600 text-xs dark:text-red-400",
			className,
		)}
		{...props}
	>
		{children}
	</Text>
);
