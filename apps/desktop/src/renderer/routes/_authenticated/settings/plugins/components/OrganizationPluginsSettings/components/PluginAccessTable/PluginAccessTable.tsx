import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { OrganizationRole } from "@superset/shared/auth";
import {
	type OrganizationPluginPolicy,
	organizationPluginAccess,
} from "@superset/shared/plugins";
import { Badge } from "@superset/ui/badge";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { withRoleAccess } from "../../utils/withRoleAccess";
import { RoleAccessSelect } from "./components/RoleAccessSelect";

export function PluginAccessTable() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const { data: plugins, isPending } =
		cloudTrpc.plugins.organization.list.useQuery();

	const roles: { role: OrganizationRole; label: string }[] = [
		{ role: "owner", label: t({ message: "Owner" }) },
		{ role: "admin", label: t({ message: "Admin" }) },
		{ role: "member", label: t({ message: "Member" }) },
	];

	const setPolicy = cloudTrpc.plugins.organization.setPolicy.useMutation({
		onMutate: async ({ name, policy }) => {
			await utils.plugins.organization.list.cancel();
			const previous = utils.plugins.organization.list.getData();
			utils.plugins.organization.list.setData(undefined, (rows) =>
				rows?.map((row) => (row.name === name ? { ...row, policy } : row)),
			);
			return { previous };
		},
		onError: (error, _input, context) => {
			utils.plugins.organization.list.setData(undefined, context?.previous);
			toast.error(t({ message: "Could not change who gets this plugin" }), {
				description: errorMessage(error),
			});
		},
		onSettled: () =>
			Promise.all([
				utils.plugins.organization.list.invalidate(),
				utils.plugins.list.invalidate(),
			]),
	});

	return (
		<section className="space-y-4">
			<div>
				<h3 className="text-lg font-semibold">
					<Trans>Plugins</Trans>
				</h3>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>
						Available plugins show on each role's Plugins page. Installed
						plugins are installed for everyone in the role, who can disable but
						not remove them.
					</Trans>
				</p>
			</div>

			{isPending ? (
				<div className="space-y-2">
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
				</div>
			) : !plugins?.length ? (
				<div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
					<Trans>No plugins yet. Add a repository to sync them.</Trans>
				</div>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>
								<Trans>Plugin</Trans>
							</TableHead>
							<TableHead>
								<Trans>Source</Trans>
							</TableHead>
							{roles.map(({ role, label }) => (
								<TableHead key={role}>{label}</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{plugins.map((plugin) => {
							const policy = plugin.policy as OrganizationPluginPolicy;
							const pluginName = plugin.name;
							return (
								<TableRow key={plugin.name}>
									<TableCell className="max-w-56">
										<div className="flex min-w-0 items-center gap-1.5">
											<span className="truncate font-medium">
												{plugin.name}
											</span>
											<span className="shrink-0 text-xs text-muted-foreground">
												{plugin.version}
											</span>
										</div>
										{plugin.removedFromSourceAt && (
											<Badge
												variant="outline"
												className="mt-1 text-[10px] text-muted-foreground"
											>
												<Trans>No longer in source</Trans>
											</Badge>
										)}
									</TableCell>
									<TableCell className="max-w-40 truncate text-xs text-muted-foreground">
										{plugin.repo ?? "—"}
									</TableCell>
									{roles.map(({ role, label }) => (
										<TableCell key={role}>
											<RoleAccessSelect
												value={organizationPluginAccess(policy, role)}
												label={t({
													message: `${label} access to ${pluginName}`,
												})}
												disabled={setPolicy.isPending}
												onChange={(access) =>
													setPolicy.mutate({
														name: plugin.name,
														policy: withRoleAccess(policy, role, access),
													})
												}
											/>
										</TableCell>
									))}
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			)}
		</section>
	);
}
