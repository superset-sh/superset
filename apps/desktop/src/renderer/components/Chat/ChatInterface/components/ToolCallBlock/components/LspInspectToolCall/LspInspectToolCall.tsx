import { ToolInput, ToolOutput } from "@superset/ui/ai-elements/tool";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { AlertCircleIcon, SearchCheckIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs } from "../../../../utils/tool-helpers";
import { getGenericToolCallState } from "../GenericToolCall/getGenericToolCallState";

interface LspInspectToolCallProps {
	part: ToolPart;
}

const LSP_NOT_CONFIGURED_TEXT = "LSP is not configured for this workspace";

function LspNotConfiguredDescription() {
	return (
		<span className="ml-2 flex items-center gap-1 font-medium uppercase tracking-wide text-red-500">
			<AlertCircleIcon className="h-3 w-3 shrink-0" />
			Not Configured
		</span>
	);
}

export function LspInspectToolCall({ part }: LspInspectToolCallProps) {
	const args = getArgs(part);
	const { output, isError, errorText } = getGenericToolCallState(part);
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";

	const rawPath = String(
		args.file_path ?? args.filePath ?? args.path ?? args.file ?? "",
	);
	const fileName = rawPath.includes("/")
		? rawPath.split("/").pop()
		: rawPath || undefined;

	const isNotConfigured =
		isError &&
		typeof errorText === "string" &&
		errorText.includes(LSP_NOT_CONFIGURED_TEXT);

	const hasDetails = part.input != null || output != null || isError;

	return (
		<ToolCallRow
			icon={SearchCheckIcon}
			isError={isNotConfigured ? false : isError}
			isPending={isPending}
			title="LSP Inspect"
			description={isNotConfigured ? <LspNotConfiguredDescription /> : fileName}
		>
			{hasDetails ? (
				<div className="space-y-3 py-1 pl-3">
					{part.input != null && <ToolInput input={part.input} />}
					{(output != null || isError) && (
						<ToolOutput
							output={!isError ? output : undefined}
							errorText={isError ? errorText : undefined}
						/>
					)}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
