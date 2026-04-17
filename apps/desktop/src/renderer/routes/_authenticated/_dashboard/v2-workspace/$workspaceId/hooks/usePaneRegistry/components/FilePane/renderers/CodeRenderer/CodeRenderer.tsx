import { useCallback, useRef, useState } from "react";
import { CodeEditor } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor";
import { detectLanguage } from "shared/detect-language";
import { ExternalChangeBar } from "../../components/ExternalChangeBar";

interface CodeRendererProps {
	content: string;
	filePath: string;
	hasExternalChange: boolean;
	onDirtyChange: (dirty: boolean) => void;
	onReload: () => Promise<void>;
	onSave: (content: string) => Promise<unknown>;
}

export function CodeRenderer({
	content,
	filePath,
	hasExternalChange,
	onDirtyChange,
	onReload,
	onSave,
}: CodeRendererProps) {
	const language = detectLanguage(filePath);
	const currentContentRef = useRef(content);
	const [savedContent, setSavedContent] = useState(content);

	// Track the initial/saved content to detect dirty state
	if (content !== savedContent && !onDirtyChange) {
		setSavedContent(content);
	}

	const handleChange = useCallback(
		(value: string) => {
			currentContentRef.current = value;
			onDirtyChange(value !== savedContent);
		},
		[onDirtyChange, savedContent],
	);

	const handleSave = useCallback(async () => {
		await onSave(currentContentRef.current);
		setSavedContent(currentContentRef.current);
	}, [onSave]);

	return (
		<div className="flex h-full w-full flex-col">
			{hasExternalChange && <ExternalChangeBar onReload={onReload} />}
			<div className="min-h-0 min-w-0 flex-1">
				<CodeEditor
					value={content}
					language={language}
					onChange={handleChange}
					onSave={handleSave}
					fillHeight
				/>
			</div>
		</div>
	);
}
