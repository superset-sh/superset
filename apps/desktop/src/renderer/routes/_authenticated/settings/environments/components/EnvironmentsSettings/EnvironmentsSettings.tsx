import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import {
	HiOutlineArchiveBox,
	HiOutlineCube,
	HiOutlinePlus,
} from "react-icons/hi2";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
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
	const [showCreate, setShowCreate] = useState(false);
	const [name, setName] = useState("");
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

	const create = cloudTrpc.environment.create.useMutation({
		onSuccess: async () => {
			await utils.environment.list.invalidate();
			setShowCreate(false);
			setName("");
			toast.success(
				t({
					message: "Environment created",
				}),
			);
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

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
				<Button onClick={() => setShowCreate(true)} size="sm">
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
									</div>
									<div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
										{environment.sourceRef}
									</div>
								</div>
							</button>
							<Button
								className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={() => archive.mutate({ id: environment.id })}
								size="icon"
								variant="ghost"
							>
								<HiOutlineArchiveBox className="h-4 w-4" />
							</Button>
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

			<Dialog onOpenChange={setShowCreate} open={showCreate}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							<Trans>New environment</Trans>
						</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="environment-name">
								<Trans>Name</Trans>
							</Label>
							<Input
								id="environment-name"
								onChange={(event) => setName(event.target.value)}
								placeholder={t({
									message: "monorepo-warm",
								})}
								value={name}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button onClick={() => setShowCreate(false)} variant="outline">
							<Trans>Cancel</Trans>
						</Button>
						<Button
							disabled={!name.trim() || !organizationId}
							onClick={() => {
								if (!organizationId) return;
								create.mutate({ organizationId, name: name.trim() });
							}}
						>
							<Trans>Create</Trans>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
