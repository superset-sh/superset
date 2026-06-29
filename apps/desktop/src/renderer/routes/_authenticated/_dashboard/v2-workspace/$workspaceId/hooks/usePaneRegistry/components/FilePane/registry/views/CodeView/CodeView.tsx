import { Button } from "@superset/ui/button";
import { useRef } from "react";
import { LuSparkles } from "react-icons/lu";
import { detectLanguage } from "shared/detect-language";
import type { ViewProps } from "../../types";
import { CodeEditor } from "./components/CodeEditor";
import type { CodeEditorAdapter } from "./components/CodeEditor/CodeEditorAdapter";
import { useSendSelectionToAgent } from "./components/CodeEditor/hooks/useSendSelectionToAgent";

export function CodeView({
	document,
	filePath,
	workspaceId,
	onCreateNewAgentSession,
}: ViewProps) {
	const editorRef = useRef<CodeEditorAdapter | null>(null);
	const { canSend, send, refreshCanSend, isPending } = useSendSelectionToAgent({
		workspaceId,
		filePath,
		getEditor: () => editorRef.current,
		onCreateNewAgentSession,
	});

	if (document.content.kind !== "text") {
		return null;
	}

	return (
		<div className="relative h-full w-full">
			<CodeEditor
				key={document.id}
				value={document.content.value}
				language={detectLanguage(filePath)}
				editorRef={editorRef}
				onChange={(next) => document.setContent(next)}
				onSave={() => void document.save()}
				onSelectionChange={refreshCanSend}
				onSendSelection={() => void send({})}
				fillHeight
			/>
			{canSend ? (
				<Button
					type="button"
					size="xs"
					disabled={isPending}
					onClick={() => void send()}
					className="absolute right-3 bottom-3 z-10 gap-1.5 shadow-md"
				>
					<LuSparkles className="size-3" />
					Send selection to agent
				</Button>
			) : null}
		</div>
	);
}
