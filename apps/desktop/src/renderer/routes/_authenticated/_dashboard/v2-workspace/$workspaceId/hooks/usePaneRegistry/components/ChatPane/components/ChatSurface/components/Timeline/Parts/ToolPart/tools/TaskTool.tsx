/**
 * Task / subagent tool renderer. Shows the delegated task description
 * with an agent color accent. OpenCode's variant also links to a
 * nested session — we render just the card for now (subagent
 * navigation is Phase 7.3 wiring).
 */

import type { ToolPart } from "@superset/chat/shared";
import { Sparkles } from "lucide-react";
import { BasicTool } from "../BasicTool";
import { ToolErrorCard } from "../ToolErrorCard";
import {
	inputAsRecord,
	isToolError,
	pickString,
	statusFromToolState,
} from "../toolHelpers";

const DESC_KEYS = ["description", "prompt", "task", "purpose"] as const;
const AGENT_KEYS = ["subagent_type", "agent", "agentType", "kind"] as const;

export function TaskTool({ part }: { part: ToolPart }) {
	const input = inputAsRecord(part.state);
	const description = pickString(input, DESC_KEYS) ?? "";
	const agentName = pickString(input, AGENT_KEYS) ?? "agent";

	if (isToolError(part) && part.state.kind === "error") {
		return (
			<ToolErrorCard
				tool={capitalize(agentName)}
				error={part.state.error.message}
				subtitle={description || undefined}
			/>
		);
	}

	// Output of task tools is often a rolled-up summary string.
	const output =
		part.state.kind === "completed" && typeof part.state.output === "string"
			? (part.state.output as string)
			: "";

	return (
		<BasicTool
			icon={Sparkles}
			status={statusFromToolState(part.state)}
			defer
			trigger={{
				title: capitalize(agentName),
				subtitle: description,
			}}
		>
			{output ? (
				<div className="whitespace-pre-wrap break-words text-[12px]">
					{output}
				</div>
			) : (
				<div className="text-muted-foreground text-[11px] italic">
					(no summary)
				</div>
			)}
		</BasicTool>
	);
}

function capitalize(s: string): string {
	if (!s) return "";
	return s.charAt(0).toUpperCase() + s.slice(1);
}
