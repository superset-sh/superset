import { useEffect, useMemo, useState } from "react";

interface ProjectPreference {
	id: string;
	name?: string;
	mainRepoPath?: string;
}

interface UseAgentLaunchPreferencesOptions<TAgent extends string> {
	agentStorageKey: string;
	defaultAgent: TAgent;
	fallbackAgent: TAgent;
	validAgents: readonly TAgent[];
	agentsReady?: boolean;
	projectStorageKey?: string;
	recentProjects?: ProjectPreference[];
	autoRunStorageKey?: string;
	initialAutoRun?: boolean;
	/** When set, auto-selects the project whose id/name/path matches this value instead of using localStorage. */
	preferredProjectMatch?: string;
}

export function useAgentLaunchPreferences<TAgent extends string>({
	agentStorageKey,
	defaultAgent,
	fallbackAgent,
	validAgents,
	agentsReady = true,
	projectStorageKey,
	recentProjects = [],
	autoRunStorageKey,
	initialAutoRun = true,
	preferredProjectMatch,
}: UseAgentLaunchPreferencesOptions<TAgent>) {
	const validAgentSet = useMemo(() => new Set(validAgents), [validAgents]);
	const [selectedProjectId, setSelectedProjectIdState] = useState<
		string | null
	>(() => {
		if (typeof window === "undefined" || !projectStorageKey) return null;
		return window.localStorage.getItem(projectStorageKey);
	});
	const [selectedAgent, setSelectedAgentState] = useState<TAgent>(() => {
		if (typeof window === "undefined") return defaultAgent;
		const stored = window.localStorage.getItem(agentStorageKey);
		return stored ? (stored as TAgent) : defaultAgent;
	});
	const [autoRun, setAutoRunState] = useState(() => {
		if (typeof window === "undefined" || !autoRunStorageKey) {
			return initialAutoRun;
		}
		return window.localStorage.getItem(autoRunStorageKey) !== "false";
	});

	// Auto-match project from preferredProjectMatch (e.g. OneDev projectPath)
	const matchedProjectId = useMemo(() => {
		if (!preferredProjectMatch || recentProjects.length === 0) return null;
		const needle = preferredProjectMatch.toLowerCase();
		const lastSegment = needle.split("/").pop() ?? needle;
		const match = recentProjects.find((p) => {
			const name = p.name?.toLowerCase() ?? "";
			const repoPath = p.mainRepoPath?.toLowerCase() ?? "";
			return (
				name === needle ||
				name === lastSegment ||
				repoPath.endsWith(`/${needle}`) ||
				repoPath.endsWith(`/${lastSegment}`)
			);
		});
		return match?.id ?? null;
	}, [preferredProjectMatch, recentProjects]);

	useEffect(() => {
		if (!projectStorageKey || recentProjects.length === 0) {
			return;
		}
		if (matchedProjectId) {
			if (selectedProjectId !== matchedProjectId) {
				setSelectedProjectIdState(matchedProjectId);
			}
			return;
		}
		if (selectedProjectId) {
			return;
		}
		const initialProjectId = recentProjects[0]?.id ?? null;
		if (!initialProjectId) return;
		setSelectedProjectIdState(initialProjectId);
		window.localStorage.setItem(projectStorageKey, initialProjectId);
	}, [projectStorageKey, recentProjects, selectedProjectId, matchedProjectId]);

	// Never persist the fallback to localStorage — a transient unavailability
	// should not permanently overwrite the user's explicit choice.
	useEffect(() => {
		if (!agentsReady) {
			return;
		}
		if (validAgentSet.has(selectedAgent)) {
			return;
		}

		const stored =
			typeof window === "undefined"
				? null
				: window.localStorage.getItem(agentStorageKey);
		if (stored && validAgentSet.has(stored as TAgent)) {
			setSelectedAgentState(stored as TAgent);
			return;
		}

		setSelectedAgentState(fallbackAgent);
	}, [
		agentStorageKey,
		agentsReady,
		fallbackAgent,
		selectedAgent,
		validAgentSet,
	]);

	const setSelectedProjectId = (projectId: string | null) => {
		setSelectedProjectIdState(projectId);
		if (typeof window === "undefined" || !projectStorageKey) return;
		if (projectId) {
			window.localStorage.setItem(projectStorageKey, projectId);
			return;
		}
		window.localStorage.removeItem(projectStorageKey);
	};

	const setSelectedAgent = (agent: TAgent) => {
		setSelectedAgentState(agent);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(agentStorageKey, agent);
		}
	};

	const setAutoRun = (value: boolean) => {
		setAutoRunState(value);
		if (typeof window !== "undefined" && autoRunStorageKey) {
			window.localStorage.setItem(autoRunStorageKey, String(value));
		}
	};

	const effectiveProjectId = projectStorageKey
		? (matchedProjectId ?? selectedProjectId ?? recentProjects[0]?.id ?? null)
		: null;

	return {
		autoRun,
		effectiveProjectId,
		selectedAgent,
		selectedProjectId,
		setAutoRun,
		setSelectedAgent,
		setSelectedProjectId,
	};
}
