/**
 * PermissionDock — blocking UI when the agent requests approval to run
 * a tool. Renders the tool name, argument preview, and approve /
 * decline / always-allow actions.
 */

import type { ApprovalRequest } from "@superset/chat/shared";
import { Button } from "@superset/ui/button";
import { DockFrame } from "./DockFrame";

export interface PermissionDockProps {
	request: ApprovalRequest;
	submitting?: boolean;
	onRespond: (decision: "approve" | "decline" | "always_allow_category") => void;
}

export function PermissionDock({
	request,
	submitting = false,
	onRespond,
}: PermissionDockProps) {
	const argsPreview = previewArgs(request.args);
	return (
		<DockFrame
			tone="amber"
			label={`Tool approval needed — ${request.toolName}`}
			subtitle={argsPreview}
		>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant="default"
					disabled={submitting}
					onClick={() => onRespond("approve")}
				>
					Approve
				</Button>
				<Button
					size="sm"
					variant="secondary"
					disabled={submitting}
					onClick={() => onRespond("always_allow_category")}
				>
					Always allow
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={submitting}
					onClick={() => onRespond("decline")}
				>
					Decline
				</Button>
			</div>
		</DockFrame>
	);
}

function previewArgs(args: unknown, max = 140): string {
	if (args === null || args === undefined) return "";
	try {
		const text =
			typeof args === "string" ? args : JSON.stringify(args);
		if (!text) return "";
		return text.length > max ? `${text.slice(0, max)}…` : text;
	} catch {
		return "";
	}
}
