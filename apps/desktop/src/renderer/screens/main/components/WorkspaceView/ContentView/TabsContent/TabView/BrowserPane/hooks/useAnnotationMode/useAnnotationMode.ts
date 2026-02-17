import type { AgentType } from "lib/trpc/routers/annotation/utils/formatAnnotationPrompt";
import { useCallback, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

interface AnnotationData {
	annotations: unknown[];
	output: string;
	pageUrl: string;
}

export function useAnnotationMode({
	paneId,
	workspaceId,
}: {
	paneId: string;
	workspaceId: string;
}) {
	const toggleAnnotation = useTabsStore((s) => s.toggleAnnotation);
	const isActive =
		useTabsStore((s) => s.panes[paneId]?.browser?.annotation?.isActive) ??
		false;

	const [dialogOpen, setDialogOpen] = useState(false);
	const [annotationData, setAnnotationData] = useState<AnnotationData | null>(
		null,
	);
	const [agent, setAgent] = useState<AgentType>("claude");

	const addTab = useTabsStore((s) => s.addTab);

	const { mutateAsync: injectOverlay } =
		electronTrpc.annotation.inject.useMutation();
	const { mutateAsync: removeOverlay } =
		electronTrpc.annotation.remove.useMutation();
	const { mutateAsync: formatSinglePrompt } =
		electronTrpc.annotation.formatSinglePrompt.useMutation();

	// Track the selected agent so the subscription callback always has the latest value
	const agentRef = useRef<AgentType>(agent);
	agentRef.current = agent;

	// Subscribe to bulk annotations submitted (Send button)
	electronTrpc.annotation.onAnnotationsSubmitted.useSubscription(
		{ paneId },
		{
			enabled: isActive,
			onData: (data) => {
				setAnnotationData(data as AnnotationData);
				setDialogOpen(true);
			},
		},
	);

	// Subscribe to individual annotation.add events for real-time tab creation.
	// Each annotation immediately launches an agent in a background tab.
	electronTrpc.annotation.onAnnotationAdded.useSubscription(
		{ paneId },
		{
			enabled: isActive,
			onData: (data) => {
				const { annotation, pageUrl } = data as {
					annotation: Record<string, unknown>;
					pageUrl: string;
				};
				formatSinglePrompt({
					annotation,
					pageUrl,
					agent: agentRef.current,
				}).then(({ command }) => {
					// Create a tab in the background — don't switch to it
					addTab(workspaceId, { initialCommands: [command] });
				});
			},
		},
	);

	const toggle = useCallback(async () => {
		if (isActive) {
			await removeOverlay({ paneId });
		} else {
			await injectOverlay({ paneId });
		}
		toggleAnnotation(paneId);
	}, [isActive, paneId, injectOverlay, removeOverlay, toggleAnnotation]);

	const closeDialog = useCallback(() => {
		setDialogOpen(false);
		setAnnotationData(null);
	}, []);

	return {
		isActive,
		toggle,
		dialogOpen,
		annotationData,
		closeDialog,
		agent,
		setAgent,
	};
}
