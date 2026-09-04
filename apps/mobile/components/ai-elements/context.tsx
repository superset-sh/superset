import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import {
	formatCompactNumber,
	formatCurrency,
	formatPercent,
} from "@superset/i18n/format";
import { createContext, useContext, useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { getUsage } from "tokenlens";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import { Text, TextClassContext } from "@/components/ui/text";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

const PERCENT_MAX = 100;
const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;

type ModelId = string;

export interface LanguageModelUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	reasoningTokens?: number;
	cachedInputTokens?: number;
}

interface ContextSchema {
	usedTokens: number;
	maxTokens: number;
	usage?: LanguageModelUsage;
	modelId?: ModelId;
}

const ContextContext = createContext<ContextSchema | null>(null);

const useContextValue = () => {
	const context = useContext(ContextContext);

	if (!context) {
		throw new Error("Context components must be used within Context");
	}

	return context;
};

export type ContextProps = React.ComponentProps<typeof HoverCard> &
	ContextSchema;

export const Context = ({
	usedTokens,
	maxTokens,
	usage,
	modelId,
	...props
}: ContextProps) => {
	const contextValue = useMemo(
		() => ({ maxTokens, modelId, usage, usedTokens }),
		[maxTokens, modelId, usage, usedTokens],
	);

	return (
		<ContextContext.Provider value={contextValue}>
			<HoverCard {...props} />
		</ContextContext.Provider>
	);
};

const ContextIcon = () => {
	const { usedTokens, maxTokens } = useContextValue();
	const circumference = 2 * Math.PI * ICON_RADIUS;
	const usedPercent = usedTokens / maxTokens;
	const dashOffset = circumference * (1 - usedPercent);

	return (
		<Svg
			accessibilityLabel={i18n._(
				msg({
					message: "Model context usage",
				}),
			)}
			height={20}
			viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
			width={20}
		>
			<Circle
				cx={ICON_CENTER}
				cy={ICON_CENTER}
				fill="none"
				opacity={0.25}
				r={ICON_RADIUS}
				stroke={THEME.dark.foreground}
				strokeWidth={ICON_STROKE_WIDTH}
			/>
			<Circle
				cx={ICON_CENTER}
				cy={ICON_CENTER}
				fill="none"
				opacity={0.7}
				origin={`${ICON_CENTER}, ${ICON_CENTER}`}
				r={ICON_RADIUS}
				rotation={-90}
				stroke={THEME.dark.foreground}
				strokeDasharray={`${circumference} ${circumference}`}
				strokeDashoffset={dashOffset}
				strokeLinecap="round"
				strokeWidth={ICON_STROKE_WIDTH}
			/>
		</Svg>
	);
};

export type ContextTriggerProps = ButtonProps;

export const ContextTrigger = ({ children, ...props }: ContextTriggerProps) => {
	const { usedTokens, maxTokens } = useContextValue();
	const usedPercent = usedTokens / maxTokens;
	const renderedPercent = formatPercent(usedPercent);

	return (
		<HoverCardTrigger asChild>
			{children ?? (
				<Button variant="ghost" {...props}>
					<Text className="font-medium text-muted-foreground">
						{renderedPercent}
					</Text>
					<ContextIcon />
				</Button>
			)}
		</HoverCardTrigger>
	);
};

export type ContextContentProps = React.ComponentProps<typeof HoverCardContent>;

export const ContextContent = ({
	className,
	...props
}: ContextContentProps) => (
	<HoverCardContent
		className={cn("min-w-60 overflow-hidden p-0", className)}
		{...props}
	/>
);

export type ContextContentHeaderProps = React.ComponentProps<typeof View>;

export const ContextContentHeader = ({
	children,
	className,
	...props
}: ContextContentHeaderProps) => {
	const { usedTokens, maxTokens } = useContextValue();
	const usedPercent = usedTokens / maxTokens;
	const displayPct = formatPercent(usedPercent);
	const used = formatCompactNumber(usedTokens);
	const total = formatCompactNumber(maxTokens);

	return (
		<View
			className={cn("w-full gap-2 border-border border-b p-3", className)}
			{...props}
		>
			{children ?? (
				<>
					<View className="flex-row items-center justify-between gap-3">
						<Text className="text-xs">{displayPct}</Text>
						<Text className="font-mono text-muted-foreground text-xs">
							{used} / {total}
						</Text>
					</View>
					<View className="gap-2">
						<Progress className="bg-muted" value={usedPercent * PERCENT_MAX} />
					</View>
				</>
			)}
		</View>
	);
};

export type ContextContentBodyProps = React.ComponentProps<typeof View>;

export const ContextContentBody = ({
	children,
	className,
	...props
}: ContextContentBodyProps) => (
	<View className={cn("w-full p-3", className)} {...props}>
		{children}
	</View>
);

export type ContextContentFooterProps = React.ComponentProps<typeof View>;

export const ContextContentFooter = ({
	children,
	className,
	...props
}: ContextContentFooterProps) => {
	const { modelId, usage } = useContextValue();
	const costUSD = modelId
		? getUsage({
				modelId,
				usage: {
					input: usage?.inputTokens ?? 0,
					output: usage?.outputTokens ?? 0,
				},
			}).costUSD?.totalUSD
		: undefined;
	const totalCost = formatCurrency(costUSD ?? 0);

	return (
		<TextClassContext.Provider value="text-xs">
			<View
				className={cn(
					"w-full flex-row items-center justify-between gap-3 border-border border-t bg-secondary p-3",
					className,
				)}
				{...props}
			>
				{children ?? (
					<>
						<Text className="text-muted-foreground">
							<Trans>Total cost</Trans>
						</Text>
						<Text>{totalCost}</Text>
					</>
				)}
			</View>
		</TextClassContext.Provider>
	);
};

const TokensWithCost = ({
	tokens,
	costText,
}: {
	tokens?: number;
	costText?: string;
}) => (
	<Text className="text-xs">
		{tokens === undefined ? "—" : formatCompactNumber(tokens)}
		{costText ? (
			<Text className="text-muted-foreground text-xs"> • {costText}</Text>
		) : null}
	</Text>
);

export type ContextInputUsageProps = React.ComponentProps<typeof View>;

export const ContextInputUsage = ({
	className,
	children,
	...props
}: ContextInputUsageProps) => {
	const { usage, modelId } = useContextValue();
	const inputTokens = usage?.inputTokens ?? 0;

	if (children) {
		return children;
	}

	if (!inputTokens) {
		return null;
	}

	const inputCost = modelId
		? getUsage({
				modelId,
				usage: { input: inputTokens, output: 0 },
			}).costUSD?.totalUSD
		: undefined;
	const inputCostText = formatCurrency(inputCost ?? 0);

	return (
		<View
			className={cn("flex-row items-center justify-between", className)}
			{...props}
		>
			<Text className="text-muted-foreground text-xs">
				<Trans>Input</Trans>
			</Text>
			<TokensWithCost costText={inputCostText} tokens={inputTokens} />
		</View>
	);
};

export type ContextOutputUsageProps = React.ComponentProps<typeof View>;

export const ContextOutputUsage = ({
	className,
	children,
	...props
}: ContextOutputUsageProps) => {
	const { usage, modelId } = useContextValue();
	const outputTokens = usage?.outputTokens ?? 0;

	if (children) {
		return children;
	}

	if (!outputTokens) {
		return null;
	}

	const outputCost = modelId
		? getUsage({
				modelId,
				usage: { input: 0, output: outputTokens },
			}).costUSD?.totalUSD
		: undefined;
	const outputCostText = formatCurrency(outputCost ?? 0);

	return (
		<View
			className={cn("flex-row items-center justify-between", className)}
			{...props}
		>
			<Text className="text-muted-foreground text-xs">
				<Trans>Output</Trans>
			</Text>
			<TokensWithCost costText={outputCostText} tokens={outputTokens} />
		</View>
	);
};

export type ContextReasoningUsageProps = React.ComponentProps<typeof View>;

export const ContextReasoningUsage = ({
	className,
	children,
	...props
}: ContextReasoningUsageProps) => {
	const { usage, modelId } = useContextValue();
	const reasoningTokens = usage?.reasoningTokens ?? 0;

	if (children) {
		return children;
	}

	if (!reasoningTokens) {
		return null;
	}

	const reasoningCost = modelId
		? getUsage({
				modelId,
				usage: { reasoningTokens },
			}).costUSD?.totalUSD
		: undefined;
	const reasoningCostText = formatCurrency(reasoningCost ?? 0);

	return (
		<View
			className={cn("flex-row items-center justify-between", className)}
			{...props}
		>
			<Text className="text-muted-foreground text-xs">
				<Trans>Reasoning</Trans>
			</Text>
			<TokensWithCost costText={reasoningCostText} tokens={reasoningTokens} />
		</View>
	);
};

export type ContextCacheUsageProps = React.ComponentProps<typeof View>;

export const ContextCacheUsage = ({
	className,
	children,
	...props
}: ContextCacheUsageProps) => {
	const { usage, modelId } = useContextValue();
	const cacheTokens = usage?.cachedInputTokens ?? 0;

	if (children) {
		return children;
	}

	if (!cacheTokens) {
		return null;
	}

	const cacheCost = modelId
		? getUsage({
				modelId,
				usage: { cacheReads: cacheTokens, input: 0, output: 0 },
			}).costUSD?.totalUSD
		: undefined;
	const cacheCostText = formatCurrency(cacheCost ?? 0);

	return (
		<View
			className={cn("flex-row items-center justify-between", className)}
			{...props}
		>
			<Text className="text-muted-foreground text-xs">
				<Trans>Cache</Trans>
			</Text>
			<TokensWithCost costText={cacheCostText} tokens={cacheTokens} />
		</View>
	);
};
