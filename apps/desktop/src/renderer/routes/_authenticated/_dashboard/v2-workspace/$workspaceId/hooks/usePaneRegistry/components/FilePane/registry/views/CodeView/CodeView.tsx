import { detectLanguage } from "shared/detect-language";
import type { ViewProps } from "../../types";
import { CodeEditor } from "./components/CodeEditor";

export function CodeView({ document, filePath }: ViewProps) {
	if (document.content.kind !== "text") {
		return null;
	}

	return (
		<CodeEditor
			key={document.id}
			value={document.content.value}
			language={detectLanguage(filePath)}
			onChange={(next) => document.setContent(next)}
			onSave={() => void document.save()}
			fillHeight
		/>
	);
}
