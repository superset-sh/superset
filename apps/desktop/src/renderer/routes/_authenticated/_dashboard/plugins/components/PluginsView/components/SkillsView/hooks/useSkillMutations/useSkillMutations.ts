import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";
import type { SkillListItem } from "../useSkills";

export type SkillLocation =
	| { scope: "personal" }
	| { scope: "project"; projectId: string };

export type CreateSkillInput = SkillLocation & {
	name: string;
	description: string;
};

/** Async actions resolve to null on failure, after the error toast has fired. */
export function useSkillMutations() {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();
	const refreshList = () => utils.skills.list.invalidate();
	const failed = (title: string) => (error: { message: string }) =>
		toast.error(title, { description: errorMessage(error) });

	const setEnabledMutation = electronTrpc.skills.setEnabled.useMutation({
		onSuccess: async (_data, variables) => {
			await refreshList();
			posthog.capture(variables.enabled ? "skill_enabled" : "skill_disabled", {
				skill: variables.name,
			});
			toast.success(
				variables.enabled
					? t({ message: `${variables.name} enabled` })
					: t({ message: `${variables.name} disabled` }),
				{ description: t({ message: "Takes effect in new agent sessions." }) },
			);
		},
		onError: failed(t({ message: "Could not update skill" })),
	});

	const createMutation = electronTrpc.skills.create.useMutation({
		onSuccess: async (skill) => {
			await refreshList();
			posthog.capture("skill_created", { scope: skill.scope });
			toast.success(t({ message: `${skill.displayName} created` }), {
				description: t({ message: "Agents pick it up in new sessions." }),
			});
		},
		onError: failed(t({ message: "Could not create skill" })),
	});

	const importMutation = electronTrpc.skills.importFromFolder.useMutation({
		onSuccess: async (result) => {
			if (result.canceled) return;
			await refreshList();
			posthog.capture("skill_imported", { scope: result.skill.scope });
			toast.success(t({ message: `${result.skill.displayName} imported` }), {
				description: t({ message: "Agents pick it up in new sessions." }),
			});
		},
		onError: failed(t({ message: "Could not import skill" })),
	});

	const deleteMutation = electronTrpc.skills.delete.useMutation({
		onSuccess: async () => {
			await refreshList();
			posthog.capture("skill_deleted");
		},
		onError: failed(t({ message: "Could not delete skill" })),
	});

	return {
		setEnabled: (name: string, enabled: boolean) =>
			setEnabledMutation.mutate({ name, enabled }),
		create: async (input: CreateSkillInput) => {
			try {
				return await createMutation.mutateAsync(input);
			} catch {
				return null;
			}
		},
		importFromFolder: async (location: SkillLocation) => {
			try {
				return await importMutation.mutateAsync(location);
			} catch {
				return null;
			}
		},
		remove: async (skill: SkillListItem) => {
			try {
				await deleteMutation.mutateAsync({ dir: skill.dir });
				toast.success(t({ message: `${skill.displayName} deleted` }));
				return true;
			} catch {
				return false;
			}
		},
		isBusy:
			setEnabledMutation.isPending ||
			createMutation.isPending ||
			importMutation.isPending ||
			deleteMutation.isPending,
	};
}
