import { FolderIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { GenericToolCall } from "../GenericToolCall";

interface RequestExternalDirToolCallProps {
	part: ToolPart;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
	outputObject?: Record<string, unknown>;
	nestedResultObject?: Record<string, unknown>;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return undefined;
}

function toText(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return undefined;
}

function firstText(...values: unknown[]): string | undefined {
	for (const value of values) {
		const text = toText(value);
		if (text) return text;
	}
	return undefined;
}

function toApproval(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return undefined;

	const normalized = value.trim().toLowerCase();
	if (!normalized) return undefined;
	if (
		normalized === "approved" ||
		normalized === "allowed" ||
		normalized === "granted" ||
		normalized === "true"
	) {
		return true;
	}
	if (
		normalized === "denied" ||
		normalized === "rejected" ||
		normalized === "blocked" ||
		normalized === "false"
	) {
		return false;
	}
	return undefined;
}

function getStatusLabel({
	part,
	approval,
	statusText,
}: {
	part: ToolPart;
	approval: boolean | undefined;
	statusText: string | undefined;
}): string {
	if (part.state === "output-error") return "Failed";
	if (part.state !== "output-available") return "Pending";
	if (approval === true) return "Approved";
	if (approval === false) return "Denied";
	if (statusText) return statusText;
	return "Completed";
}

export function RequestExternalDirToolCall({
	part,
	args,
	result,
	outputObject,
	nestedResultObject,
}: RequestExternalDirToolCallProps) {
	const argsRequest = toRecord(args.request);
	const outputRecord = toRecord(result.output);
	const resultRecord = toRecord(result.result);

	const requestedPath = firstText(
		args.path,
		args.directory,
		args.dir,
		args.externalDirectory,
		args.requestedDirectory,
		args.requestedPath,
		argsRequest?.path,
		argsRequest?.directory,
		result.path,
		result.directory,
		outputObject?.path,
		outputObject?.directory,
		nestedResultObject?.path,
		nestedResultObject?.directory,
		outputRecord?.path,
		outputRecord?.directory,
		resultRecord?.path,
		resultRecord?.directory,
	);
	const reason = firstText(
		args.reason,
		args.justification,
		args.description,
		args.message,
		argsRequest?.reason,
		argsRequest?.justification,
	);
	const statusText = firstText(
		result.status,
		result.decision,
		outputObject?.status,
		outputObject?.decision,
		nestedResultObject?.status,
		nestedResultObject?.decision,
		outputRecord?.status,
		outputRecord?.decision,
		resultRecord?.status,
		resultRecord?.decision,
	);
	const approval = toApproval(
		firstText(
			result.approved,
			result.allowed,
			result.granted,
			outputObject?.approved,
			outputObject?.allowed,
			outputObject?.granted,
			nestedResultObject?.approved,
			nestedResultObject?.allowed,
			nestedResultObject?.granted,
			outputRecord?.approved,
			outputRecord?.allowed,
			outputRecord?.granted,
			resultRecord?.approved,
			resultRecord?.allowed,
			resultRecord?.granted,
			statusText,
		),
	);
	const statusLabel = getStatusLabel({ part, approval, statusText });
	const hasSummary = Boolean(requestedPath || reason || statusText);

	return (
		<div className="space-y-2">
			{hasSummary ? (
				<div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
					<div className="font-medium text-foreground">
						External directory access
					</div>
					{requestedPath ? (
						<div className="mt-1 text-muted-foreground">
							Path:{" "}
							<code className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
								{requestedPath}
							</code>
						</div>
					) : null}
					{reason ? (
						<div className="mt-1 text-muted-foreground">Reason: {reason}</div>
					) : null}
					<div className="mt-1 text-muted-foreground">
						Status: {statusLabel}
					</div>
				</div>
			) : null}
			<GenericToolCall
				part={part}
				toolName="Request external directory access"
				icon={FolderIcon}
			/>
		</div>
	);
}
