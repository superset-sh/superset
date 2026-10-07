import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { startableCloudEnvironments } from "@superset/shared/cloud-environments";
import { useEffect, useRef } from "react";
import { useCloudEnvironments } from "@/hooks/useCloudEnvironments";
import type { CloudEnvironmentRow } from "@/hooks/useCloudEnvironments/useCloudEnvironments";
import { useSession } from "@/lib/auth/client";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
export type CloudGitlabSelection = Readonly<
	NonNullable<CloudEnvironmentRow["gitlabProject"]> & {
		organizationId: string;
		environmentId: string;
	}
>;
export function cloudGitlabSelectionKey(
	value: CloudGitlabSelection | null | undefined,
) {
	return value
		? JSON.stringify([
				value.organizationId,
				value.environmentId,
				value.connectionId,
				value.projectId,
				value.cloneUrl,
				value.pathWithNamespace,
				value.defaultBranch,
			])
		: null;
}
export function cloudGitlabSelectionError() {
	return new Error(
		i18n._(msg({ message: "Cloud environment changed. Select it again." })),
	);
}
export function useCloudCreateSelection() {
	const environmentId = useNewSessionPreferencesStore(
		(state) => state.environmentId,
	);
	const setBaseBranch = useNewSessionPreferencesStore(
		(state) => state.setBaseBranch,
	);
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const environmentsQuery = useCloudEnvironments();
	const environments = startableCloudEnvironments(environmentsQuery.data ?? []);
	const candidate =
		environments.find((row) => row.id === environmentId) ??
		environments[0] ??
		null;
	const isGitlab = Boolean(candidate?.gitlabProject);
	const environment =
		isGitlab &&
		(environmentsQuery.isError ||
			environmentsQuery.isPending ||
			candidate?.organizationId !== organizationId)
			? null
			: candidate;
	const gitlabProject = environment?.gitlabProject ?? null;
	const gitlab =
		gitlabProject && environment && organizationId
			? Object.freeze({
					...gitlabProject,
					organizationId,
					environmentId: environment.id,
				})
			: null;
	const selectionIdentity =
		candidate?.gitlabProject &&
		candidate.organizationId === organizationId &&
		organizationId
			? {
					...candidate.gitlabProject,
					organizationId,
					environmentId: candidate.id,
				}
			: null;
	const key = cloudGitlabSelectionKey(selectionIdentity);
	const previous = useRef(key);
	useEffect(() => {
		if (previous.current !== key && (previous.current !== null || key !== null))
			setBaseBranch(null);
		previous.current = key;
	}, [key, setBaseBranch]);
	return {
		environmentsQuery,
		environments,
		environment,
		repository: environment?.repositories[0] ?? null,
		gitlabProject,
		gitlab,
		isGitlab,
	};
}
