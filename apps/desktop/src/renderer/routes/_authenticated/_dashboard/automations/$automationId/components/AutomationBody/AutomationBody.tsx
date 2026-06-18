import type { SelectAutomation } from "@superset/db/schema";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { EmojiTextInput } from "renderer/components/EmojiTextInput";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useProjectFileSearch } from "../../../hooks/useProjectFileSearch";

export function AutomationBody({
	automation,
	prompt,
	onPromptChange,
	onSaveShortcut,
}: {
	automation: SelectAutomation;
	prompt: string;
	onPromptChange: (prompt: string) => void;
	onSaveShortcut: () => void;
}) {
	const [name, setName] = useState(automation.name);

	const updateMutation = useMutation({
		mutationFn: (patch: { name?: string }) =>
			apiTrpcClient.automation.update.mutate({ id: automation.id, ...patch }),
	});

	const searchFiles = useProjectFileSearch({
		hostId: automation.targetHostId ?? null,
		projectId: automation.v2ProjectId,
	});

	return (
		<div className="flex-1 overflow-y-auto px-8 py-8">
			<EmojiTextInput
				value={name}
				onChange={setName}
				onBlur={(next) => {
					const trimmed = next.trim();
					if (trimmed && trimmed !== automation.name) {
						updateMutation.mutate({ name: trimmed });
					}
				}}
				placeholder="Automation title"
				className="mb-6 text-2xl font-semibold"
			/>
			<MarkdownEditor
				content={prompt}
				onChange={onPromptChange}
				onModEnter={onSaveShortcut}
				placeholder="Add prompt e.g. look for crashes in $sentry"
				searchFiles={searchFiles}
			/>
		</div>
	);
}
