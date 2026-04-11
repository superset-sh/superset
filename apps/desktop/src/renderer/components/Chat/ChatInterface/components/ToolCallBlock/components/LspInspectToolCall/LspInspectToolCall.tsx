import { ToolInput, ToolOutput } from "@superset/ui/ai-elements/tool";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { SearchCheckIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs } from "../../../../utils/tool-helpers";
import { getGenericToolCallState } from "../GenericToolCall/getGenericToolCallState";

interface LspInspectToolCallProps {
	part: ToolPart;
}

export function LspInspectToolCall({ part }: LspInspectToolCallProps) {
	const args = getArgs(part);
	const { output, isError, isNotConfigured, errorText } =
		getGenericToolCallState(part);
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";

	const rawPath = String(
		args.file_path ?? args.filePath ?? args.path ?? args.file ?? "",
	);
	const fileName = rawPath.includes("/")
		? rawPath.split("/").pop()
		: rawPath || undefined;

	const hasDetails = part.input != null || output != null || isError;

	return (
		<ToolCallRow
			icon={SearchCheckIcon}
			isError={isError}
			isNotConfigured={isNotConfigured}
			isPending={isPending}
			title="LSP Inspect"
			description={fileName}
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
