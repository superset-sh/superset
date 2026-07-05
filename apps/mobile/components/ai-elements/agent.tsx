import { BotIcon } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

export type ToolDefinition = {
	description?: string;
	inputSchema?: unknown;
	jsonSchema?: unknown;
};

export type AgentProps = React.ComponentProps<typeof View>;

export const Agent = memo(({ className, ...props }: AgentProps) => (
	<View
		className={cn("w-full rounded-md border border-border", className)}
		{...props}
	/>
));

export type AgentHeaderProps = React.ComponentProps<typeof View> & {
	name: string;
	model?: string;
};

export const AgentHeader = memo(
	({ className, name, model, ...props }: AgentHeaderProps) => (
		<View
			className={cn(
				"w-full flex-row items-center justify-between gap-4 p-3",
				className,
			)}
			{...props}
		>
			<View className="flex-row items-center gap-2">
				<Icon as={BotIcon} className="size-4 text-muted-foreground" />
				<Text className="font-medium text-sm">{name}</Text>
				{model && (
					<Badge variant="secondary">
						<Text className="font-mono text-xs">{model}</Text>
					</Badge>
				)}
			</View>
		</View>
	),
);

export type AgentContentProps = React.ComponentProps<typeof View>;

export const AgentContent = memo(
	({ className, ...props }: AgentContentProps) => (
		<View className={cn("gap-4 p-4 pt-0", className)} {...props} />
	),
);

export type AgentInstructionsProps = React.ComponentProps<typeof View> & {
	children: string;
};

export const AgentInstructions = memo(
	({ className, children, ...props }: AgentInstructionsProps) => (
		<View className={cn("gap-2", className)} {...props}>
			<Text className="font-medium text-muted-foreground text-sm">
				Instructions
			</Text>
			<View className="rounded-md bg-muted/50 p-3">
				<Text className="text-muted-foreground text-sm">{children}</Text>
			</View>
		</View>
	),
);

export type AgentToolsProps = React.ComponentProps<typeof Accordion>;

export const AgentTools = memo(({ className, ...props }: AgentToolsProps) => (
	<View className={cn("gap-2", className)}>
		<Text className="font-medium text-muted-foreground text-sm">Tools</Text>
		<Accordion className="rounded-md border border-border" {...props} />
	</View>
));

export type AgentToolProps = React.ComponentProps<typeof AccordionItem> & {
	tool: ToolDefinition;
};

export const AgentTool = memo(
	({ className, tool, value, ...props }: AgentToolProps) => {
		const schema = tool.jsonSchema ?? tool.inputSchema;

		return (
			<AccordionItem className={className} value={value} {...props}>
				<AccordionTrigger className="px-3 py-2">
					<Text className="flex-1 text-sm">
						{tool.description ?? "No description"}
					</Text>
				</AccordionTrigger>
				<AccordionContent className="px-3 pb-3">
					<View className="rounded-md bg-muted/50">
						<CodeBlock code={JSON.stringify(schema, null, 2)} language="json" />
					</View>
				</AccordionContent>
			</AccordionItem>
		);
	},
);

export type AgentOutputProps = React.ComponentProps<typeof View> & {
	schema: string;
};

export const AgentOutput = memo(
	({ className, schema, ...props }: AgentOutputProps) => (
		<View className={cn("gap-2", className)} {...props}>
			<Text className="font-medium text-muted-foreground text-sm">
				Output Schema
			</Text>
			<View className="rounded-md bg-muted/50">
				<CodeBlock code={schema} language="typescript" />
			</View>
		</View>
	),
);

Agent.displayName = "Agent";
AgentHeader.displayName = "AgentHeader";
AgentContent.displayName = "AgentContent";
AgentInstructions.displayName = "AgentInstructions";
AgentTools.displayName = "AgentTools";
AgentTool.displayName = "AgentTool";
AgentOutput.displayName = "AgentOutput";
