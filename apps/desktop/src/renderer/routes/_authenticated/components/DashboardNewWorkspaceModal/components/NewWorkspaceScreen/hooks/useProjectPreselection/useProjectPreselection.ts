import { useEffect, useRef, useState } from "react";

interface Options {
	isOpen: boolean;
	areProjectsReady: boolean;
	projects: readonly { id: string }[];
	preSelectedProjectId?: string | null;
	preSelectedSession: boolean;
	selectedProjectId: string | null;
	isSession: boolean;
	lastProjectId: string | null;
	selectProject: (id: string) => void;
	selectSession: () => void;
	updateDraft: (patch: { selectedProjectId: string | null }) => void;
}

export function useProjectPreselection({
	isOpen,
	areProjectsReady,
	projects,
	preSelectedProjectId,
	preSelectedSession,
	selectedProjectId,
	isSession,
	lastProjectId,
	selectProject,
	selectSession,
	updateDraft,
}: Options) {
	const [appliedProjectId, setAppliedProjectId] = useState<string | null>(null);
	const appliedSession = useRef(false);
	useEffect(() => {
		if (!preSelectedSession) appliedSession.current = false;
	}, [preSelectedSession]);
	useEffect(() => {
		if (!preSelectedProjectId) setAppliedProjectId(null);
	}, [preSelectedProjectId]);
	const isPending = Boolean(
		preSelectedProjectId && preSelectedProjectId !== appliedProjectId,
	);
	useEffect(() => {
		if (!isOpen || !areProjectsReady) return;
		if (preSelectedSession && !appliedSession.current) {
			appliedSession.current = true;
			selectSession();
			return;
		}
		const isValid = (id: string | null | undefined) =>
			Boolean(id && projects.some((project) => project.id === id));
		if (isPending && preSelectedProjectId) {
			if (isValid(preSelectedProjectId)) {
				selectProject(preSelectedProjectId);
				setAppliedProjectId(preSelectedProjectId);
			}
			return;
		}
		if (isSession || isValid(selectedProjectId)) return;
		updateDraft({
			selectedProjectId: isValid(lastProjectId)
				? lastProjectId
				: (projects[0]?.id ?? null),
		});
	}, [
		isOpen,
		areProjectsReady,
		preSelectedSession,
		preSelectedProjectId,
		isPending,
		projects,
		selectedProjectId,
		isSession,
		lastProjectId,
		selectProject,
		selectSession,
		updateDraft,
	]);
	return isPending && !preSelectedSession;
}
