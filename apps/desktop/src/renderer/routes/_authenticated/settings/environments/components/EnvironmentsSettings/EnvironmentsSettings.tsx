import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { SHARED_ENVIRONMENT_ORGANIZATION_ID } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import {
	HiOutlineArchiveBox,
	HiOutlineCube,
	HiOutlinePencil,
	HiOutlinePlus,
} from "react-icons/hi2";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import {
	EnvironmentEditorDialog,
	type EnvironmentEditorSeed,
} from "./components/EnvironmentEditorDialog";
import { EnvironmentSecrets } from "./components/EnvironmentSecrets";

interface EnvironmentsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function EnvironmentsSettings({
	visibleItems,
}: EnvironmentsSettingsProps) {
	const { t } = useLingui();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const [editor, setEditor] = useState<
		| { mode: "closed" }
		| { mode: "create" }
		| { mode: "edit"; seed: EnvironmentEditorSeed }
	>({ mode: "closed" });
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const showList = isItemVisible(
		SETTING_ITEM_ID.ENVIRONMENTS_LIST,
		visibleItems,
	);
	const showSecrets = isItemVisible(
		SETTING_ITEM_ID.ENVIRONMENTS_SECRETS,
		visibleItems,
	);

	const {
		data: environments,
		isPending,
		isError,
		error,
	} = cloudTrpc.environment.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: Boolean(organizationId) },
	);

	const archive = cloudTrpc.environment.archive.useMutation({
		onSuccess: async () => {
			await utils.environment.list.invalidate();
			setSelectedId(null);
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	if (selectedId) {
		return (
			<EnvironmentSecrets
				environmentId={selectedId}
				onBack={() => setSelectedId(null)}
			/>
		);
	}

	if (!showList && !showSecrets) return null;

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8 flex items-center justify-between gap-6">
				<div>
					<h2 className="text-xl font-semibold">
						<Trans>Environments</Trans>
					</h2>
					<p className="text-sm text-muted-foreground mt-1 max-w-prose">
						<Trans>
							The starting point a cloud workspace boots from. Variables set
							here reach every sandbox started from it.
						</Trans>
					</p>
				</div>
				<Button onClick={() => setEditor({ mode: "create" })} size="sm">
					<HiOutlinePlus className="h-4 w-4" />
					<Trans>New environment</Trans>
				</Button>
			</div>

			{isError ? (
				<div className="text-center py-12 text-sm text-destructive">
					<Trans>Could not load environments.</Trans>
					<p className="text-xs text-muted-foreground mt-1">
						{errorMessage(error)}
					</p>
				</div>
			) : isPending ? (
				<div className="divide-y divide-border">
					<div className="py-3">
						<Skeleton className="h-9 w-full" />
					</div>
					<div className="py-3">
						<Skeleton className="h-9 w-full" />
					</div>
				</div>
			) : environments && environments.length > 0 ? (
				<div className="divide-y divide-border">
					{environments.map((environment) => (
						<div
							className="group flex items-center justify-between gap-4 py-3"
							key={environment.id}
						>
							<button
								className="flex items-center gap-3 min-w-0 flex-1 text-left"
								onClick={() => setSelectedId(environment.id)}
								type="button"
							>
								<HiOutlineCube className="h-4 w-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0">
									<div className="text-sm font-medium truncate">
										{environment.name}
										{environment.scope === "personal" && (
											<span className="ml-2 text-xs font-normal text-muted-foreground">
												<Trans>Personal</Trans>
											</span>
										)}
									</div>
									<div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
										{environment.repositories.length > 0
											? environment.repositories
													.map((repo) => repo.fullName)
													.join(", ")
											: environment.sourceRef}
									</div>
								</div>
							</button>
							{environment.organizationId !==
								SHARED_ENVIRONMENT_ORGANIZATION_ID && (
								<div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
									<Button
										aria-label={t({ message: "Edit environment" })}
										className="h-8 w-8 text-muted-foreground"
										onClick={() =>
											setEditor({
												mode: "edit",
												seed: {
													id: environment.id,
													name: environment.name,
													scope: environment.scope,
													repositoryIds: environment.repositories.map(
														(repo) => repo.id,
													),
													hooksRepositoryId: environment.hooksRepositoryId,
												},
											})
										}
										size="icon"
										variant="ghost"
									>
										<HiOutlinePencil className="h-4 w-4" />
									</Button>
									<Button
										aria-label={t({ message: "Archive environment" })}
										className="h-8 w-8 text-muted-foreground hover:text-destructive"
										onClick={() => archive.mutate({ id: environment.id })}
										size="icon"
										variant="ghost"
									>
										<HiOutlineArchiveBox className="h-4 w-4" />
									</Button>
								</div>
							)}
						</div>
					))}
				</div>
			) : (
				<div className="text-center py-12 text-sm text-muted-foreground">
					<Trans>No environments yet.</Trans>
					<p className="text-xs mt-1">
						<Trans>Create one to start a cloud workspace from it.</Trans>
					</p>
				</div>
			)}

			{organizationId && editor.mode !== "closed" && (
				<EnvironmentEditorDialog
					environment={editor.mode === "edit" ? editor.seed : undefined}
					key={editor.mode === "edit" ? editor.seed.id : "create"}
					onOpenChange={(open) => {
						if (!open) setEditor({ mode: "closed" });
					}}
					open
					organizationId={organizationId}
				/>
			)}
		</div>
	);
}
