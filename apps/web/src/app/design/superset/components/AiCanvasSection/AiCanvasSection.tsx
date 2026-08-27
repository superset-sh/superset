"use client";

import { Canvas } from "@superset/ui/ai-elements/canvas";
import { Connection } from "@superset/ui/ai-elements/connection";
import { Controls } from "@superset/ui/ai-elements/controls";
import { Edge } from "@superset/ui/ai-elements/edge";
import {
	Node,
	NodeAction,
	NodeContent,
	NodeDescription,
	NodeFooter,
	NodeHeader,
	NodeTitle,
} from "@superset/ui/ai-elements/node";
import { Panel } from "@superset/ui/ai-elements/panel";
import {
	BellIcon,
	BotIcon,
	type LucideIcon,
	SettingsIcon,
	WebhookIcon,
} from "lucide-react";
import { type ComponentProps, useCallback, useState } from "react";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

// Derived from Canvas's own (i.e. @xyflow/react's) prop types rather than
// importing @xyflow/react directly, since only @superset/ui depends on it.
type CanvasProps = ComponentProps<typeof Canvas>;
type FlowNode = NonNullable<CanvasProps["nodes"]>[number];
type FlowEdge = NonNullable<CanvasProps["edges"]>[number];
type FlowNodeTypes = NonNullable<CanvasProps["nodeTypes"]>;
type FlowNodeComponentProps = ComponentProps<FlowNodeTypes[string]>;
type FlowOnConnect = NonNullable<CanvasProps["onConnect"]>;

type WorkflowNodeData = {
	title: string;
	description: string;
	detail: string;
	icon: LucideIcon;
	handles: { target: boolean; source: boolean };
	status?: string;
};

function WorkflowNode({ data }: FlowNodeComponentProps) {
	const {
		title,
		description,
		detail,
		icon: Icon,
		handles,
		status,
	} = data as WorkflowNodeData;

	return (
		<Node className="w-56" handles={handles}>
			<NodeHeader>
				<NodeTitle className="flex items-center gap-1.5 text-sm">
					<Icon className="size-3.5 text-muted-foreground" />
					{title}
				</NodeTitle>
				<NodeDescription>{description}</NodeDescription>
				{status && (
					<NodeAction>
						<button type="button" aria-label="Configure node">
							<SettingsIcon className="size-3.5 text-muted-foreground" />
						</button>
					</NodeAction>
				)}
			</NodeHeader>
			<NodeContent className="text-xs text-muted-foreground">
				{detail}
			</NodeContent>
			{status && (
				<NodeFooter className="text-xs text-muted-foreground">
					{status}
				</NodeFooter>
			)}
		</Node>
	);
}

const nodeTypes: FlowNodeTypes = { workflow: WorkflowNode };
const edgeTypes = { animated: Edge.Animated, temporary: Edge.Temporary };

const initialNodes: FlowNode[] = [
	{
		id: "trigger",
		type: "workflow",
		position: { x: 0, y: 96 },
		data: {
			title: "Webhook",
			description: "Pull request opened",
			detail: "POST /hooks/pr-opened",
			icon: WebhookIcon,
			handles: { target: false, source: true },
		} satisfies WorkflowNodeData,
	},
	{
		id: "agent",
		type: "workflow",
		position: { x: 320, y: 0 },
		data: {
			title: "Claude agent",
			description: "Reviews the diff",
			detail: "Runs tests · ~40s median",
			icon: BotIcon,
			handles: { target: true, source: true },
			status: "Last run: passed",
		} satisfies WorkflowNodeData,
	},
	{
		id: "notify",
		type: "workflow",
		position: { x: 640, y: 96 },
		data: {
			title: "Slack notify",
			description: "Posts the summary",
			detail: "#reviews",
			icon: BellIcon,
			handles: { target: true, source: false },
		} satisfies WorkflowNodeData,
	},
];

const initialEdges: FlowEdge[] = [
	{ id: "trigger-agent", source: "trigger", target: "agent", type: "animated" },
	{ id: "agent-notify", source: "agent", target: "notify", type: "animated" },
];

export function AiCanvasSection() {
	const [edges, setEdges] = useState<FlowEdge[]>(initialEdges);

	const onConnect = useCallback<FlowOnConnect>((connection) => {
		setEdges((current) => [
			...current,
			{
				id: `${connection.source}->${connection.target}-${current.length}`,
				source: connection.source,
				target: connection.target,
				sourceHandle: connection.sourceHandle,
				targetHandle: connection.targetHandle,
				type: "animated",
			} as FlowEdge,
		]);
	}, []);

	return (
		<ShowcaseSection
			id="ai-canvas"
			index="07"
			title="AI · Canvas"
			description="Node graph primitives: canvas, node, edge, connection, panel, controls"
		>
			<ComponentCard
				title="Canvas"
				importPath="@superset/ui/ai-elements/canvas"
				description="An @xyflow/react graph — draw a connection from a handle, pan, zoom, or use the controls"
				span
				bleed
			>
				<div className="h-96 w-full">
					<Canvas
						nodes={initialNodes}
						edges={edges}
						nodeTypes={nodeTypes}
						edgeTypes={edgeTypes}
						nodesDraggable={false}
						onConnect={onConnect}
						connectionLineComponent={Connection}
					>
						<Panel position="top-left">
							<span className="px-2 py-1 text-xs text-muted-foreground">
								PR review pipeline
							</span>
						</Panel>
						<Controls />
					</Canvas>
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
