import type { SelectAutomation } from "@superset/db/schema";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EmojiTextInput } from "renderer/components/EmojiTextInput";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useProjectFileSearch } from "../../../hooks/useProjectFileSearch";

export function AutomationBody({
	automation,
	readOnly,
}: {
	automation: SelectAutomation;
	readOnly?: boolean;
}) {
	const [name, setName] = useState(automation.name);
	const [prompt, setPrompt] = useState(automation.prompt);
	const lastSyncedPromptRef = useRef(automation.prompt);
	const queryClient = useQueryClient();

	useEffect(() => {
		if (automation.prompt !== lastSyncedPromptRef.current) {
			lastSyncedPromptRef.current = automation.prompt;
			setPrompt(automation.prompt);
		}
	}, [automation.prompt]);

	const updateMutation = useMutation({
		mutationFn: (patch: { name?: string }) =>
			apiTrpcClient.automation.update.mutate({ id: automation.id, ...patch }),
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to update automation",
			),
	});

	const setPromptMutation = useMutation({
		mutationFn: (next: string) =>
			apiTrpcClient.automation.setPrompt.mutate({
				id: automation.id,
				prompt: next,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["automation-versions", automation.id],
			});
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to update prompt",
			),
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
				editable={!readOnly}
				onBlur={(next) => {
					if (readOnly) return;
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
				onChange={setPrompt}
				editable={!readOnly}
				onSave={(next) => {
					if (readOnly) return;
					if (next !== automation.prompt) {
						setPromptMutation.mutate(next);
					}
				}}
				placeholder="Add prompt e.g. look for crashes in $sentry"
				searchFiles={searchFiles}
			/>
		</div>
	);
}
