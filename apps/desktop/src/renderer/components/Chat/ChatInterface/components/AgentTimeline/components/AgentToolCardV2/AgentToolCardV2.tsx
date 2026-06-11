import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { cn } from "@superset/ui/utils";
import {
	BotIcon,
	FilePenLineIcon,
	FileTextIcon,
	GlobeIcon,
	PencilIcon,
	SearchIcon,
	SparklesIcon,
	TerminalIcon,
	WrenchIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import {
	type AgentToolDisplayModel,
	buildAgentToolDisplayModel,
} from "../../utils/buildAgentToolDisplayModel";

interface AgentToolCardV2Props {
	part: ToolPart;
	className?: string;
}

const KIND_ICON: Record<
	AgentToolDisplayModel["kind"],
	ComponentType<{ className?: string }>
> = {
	shell: TerminalIcon,
	read: FileTextIcon,
	edit: PencilIcon,
	write: FilePenLineIcon,
	search: SearchIcon,
	fetch: GlobeIcon,
	subagent: BotIcon,
	skill: SparklesIcon,
	unknown: WrenchIcon,
};

function DetailValue({ value }: { value: string }) {
	const isMultiline = value.includes("\n") || value.length > 120;
	if (!isMultiline) {
		return (
			<span className="select-text break-words font-mono text-xs text-foreground">
				{value}
			</span>
		);
	}
	return (
		<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
			{value}
		</pre>
	);
}

export function AgentToolCardV2({ part, className }: AgentToolCardV2Props) {
	const model = buildAgentToolDisplayModel(part);
	const Icon = KIND_ICON[model.kind];
	const isPending = model.status === "running" || model.status === "ready";
	const isError = model.status === "error";
	const hasDetails = model.details.length > 0 || Boolean(model.error);

	return (
		<ToolCallRow
			className={cn(
				"w-full max-w-[760px] font-sans",
				isError && "text-destructive",
				className,
			)}
			description={
				model.summary ? (
					<span className="font-sans text-xs">{model.summary}</span>
				) : undefined
			}
			icon={Icon}
			isError={isError}
			isPending={isPending}
			title={model.title}
		>
			{hasDetails && (
				<div className="space-y-2 py-1.5 pl-2">
					{model.error && (
						<div className="select-text break-words text-xs text-destructive">
							{model.error}
						</div>
					)}
					{model.details.map((detail) => (
						<div key={detail.label} className="grid gap-0.5">
							<div className="font-sans text-[11px] text-muted-foreground">
								{detail.label}
							</div>
							<DetailValue value={detail.value} />
						</div>
					))}
				</div>
			)}
		</ToolCallRow>
	);
}
