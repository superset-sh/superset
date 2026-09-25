import { useEffect, useMemo, useState } from "react";

interface ProjectPreference {
	id: string;
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
}: UseAgentLaunchPreferencesOptions<TAgent>) {
	const validAgentSet = useMemo(() => new Set(validAgents), [validAgents]);
	const [selectedProjectId, setSelectedProjectIdState] = useState<
		string | null
	>(() => {
		if (typeof window === "undefined" || !projectStorageKey) return null;
		return window.localStorage.getItem(projectStorageKey);
	});
	const [preferredAgent, setSelectedAgentState] = useState<TAgent | null>(
		() => {
			if (typeof window === "undefined") return null;
			const stored = window.localStorage.getItem(agentStorageKey);
			return stored ? (stored as TAgent) : null;
		},
	);
	const [autoRun, setAutoRunState] = useState(() => {
		if (typeof window === "undefined" || !autoRunStorageKey) {
			return initialAutoRun;
		}
		return window.localStorage.getItem(autoRunStorageKey) !== "false";
	});

	useEffect(() => {
		if (
			!projectStorageKey ||
			selectedProjectId ||
			recentProjects.length === 0
		) {
			return;
		}
		const initialProjectId = recentProjects[0]?.id ?? null;
		if (!initialProjectId) return;
		setSelectedProjectIdState(initialProjectId);
		window.localStorage.setItem(projectStorageKey, initialProjectId);
	}, [projectStorageKey, recentProjects, selectedProjectId]);

	// Availability is display state, not a new preference. Keeping the explicit
	// choice lets it recover after host switches or asynchronous agent loading.
	const requestedAgent = preferredAgent ?? defaultAgent;
	const selectedAgent =
		!agentsReady || validAgentSet.has(requestedAgent)
			? requestedAgent
			: fallbackAgent;

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
		// Radix's native select can emit an empty value as host options change.
		// It is not a user choice (the explicit opt-out is "none").
		if (!agent) return;
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
		? (selectedProjectId ?? recentProjects[0]?.id ?? null)
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
