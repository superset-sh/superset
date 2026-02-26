import { ToolCall } from "@superset/ui/ai-elements/tool-call";
import { getToolName } from "ai";
import {
	FileIcon,
	FileSearchIcon,
	FolderTreeIcon,
	SearchIcon,
} from "lucide-react";
import type { ToolPart } from "../../utils/tool-helpers";
import { getArgs, normalizeToolName } from "../../utils/tool-helpers";

export function ReadOnlyToolCall({ part }: { part: ToolPart }) {
	const args = getArgs(part);
	const toolName = normalizeToolName(getToolName(part));
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";

	let title = "Read file";
	let subtitle = String(args.path ?? args.filePath ?? args.query ?? "");
	let icon = FileIcon;

	switch (toolName) {
		case "mastra_workspace_read_file":
			title = isPending ? "Reading" : "Read";
			subtitle = String(
				args.path ?? args.filePath ?? args.file_path ?? args.file ?? "",
			);
			icon = FileIcon;
			break;
		case "mastra_workspace_list_files":
			title = isPending ? "Listing files" : "Listed files";
			subtitle = String(
				args.path ??
					args.directory ??
					args.directoryPath ??
					args.directory_path ??
					args.root ??
					args.cwd ??
					"",
			);
			icon = FolderTreeIcon;
			break;
		case "mastra_workspace_file_stat":
			title = isPending ? "Checking" : "Checked";
			subtitle = String(args.path ?? args.file_path ?? args.file ?? "");
			icon = FileSearchIcon;
			break;
		case "mastra_workspace_search":
			title = isPending ? "Searching" : "Searched";
			subtitle = String(
				args.query ??
					args.pattern ??
					args.regex ??
					args.substring_pattern ??
					args.text ??
					"",
			);
			icon = SearchIcon;
			break;
		case "mastra_workspace_index":
			title = isPending ? "Indexing" : "Indexed";
			icon = SearchIcon;
			break;
	}

	// Show just the filename for paths
	if (subtitle.includes("/")) {
		subtitle = subtitle.split("/").pop() ?? subtitle;
	}

	return (
		<ToolCall
			icon={icon}
			title={title}
			subtitle={subtitle}
			isPending={isPending}
			isError={part.state === "output-error"}
		/>
	);
}
