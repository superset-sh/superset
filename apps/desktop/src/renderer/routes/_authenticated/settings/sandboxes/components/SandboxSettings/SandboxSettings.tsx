import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	HostSelect,
	type HostSelectOption,
} from "../../../components/HostSelect";
import { SettingsRow } from "../../../components/SettingsRow";

type SandboxProvider = "docker";

interface SandboxSettingsProps {
	hostId: string | null;
}

/**
 * Host-wide sandbox defaults: whether NEW workspaces run their terminals and
 * agents inside an isolated sandbox, and which backend provides it. The
 * decision is snapshotted per workspace at creation; a project's explicit
 * `sandbox.enabled` in `.superset/config.json` always overrides the default.
 */
export function SandboxSettings({ hostId }: SandboxSettingsProps) {
	const navigate = useNavigate();
	const hostService = useLocalHostService();
	const { machineId } = hostService;
	const { currentDeviceName, localHostId, otherHosts } =
		useWorkspaceHostOptions();
	const targetHostUrl = useHostUrl(hostId);
	const targetHostId = hostId ?? machineId;
	const queryClient = useQueryClient();

	const hostOptions = useMemo<HostSelectOption[]>(() => {
		const options: HostSelectOption[] = [];
		if (localHostId) {
			options.push({
				id: localHostId,
				name: currentDeviceName ?? "This device",
				isLocal: true,
				isOnline: true,
			});
		}
		for (const host of otherHosts) {
			options.push({
				id: host.id,
				name: host.name,
				isLocal: false,
				isOnline: host.isOnline,
			});
		}
		if (targetHostId && !options.some((o) => o.id === targetHostId)) {
			options.push({
				id: targetHostId,
				name: targetHostId === machineId ? "This device" : targetHostId,
				isLocal: targetHostId === machineId,
				isOnline: targetHostId === machineId,
			});
		}
		return options;
	}, [currentDeviceName, localHostId, machineId, otherHosts, targetHostId]);

	const selectedHost = useMemo(
		() => hostOptions.find((o) => o.id === targetHostId) ?? null,
		[hostOptions, targetHostId],
	);
	const hasMultipleHosts = hostOptions.length > 1;
	const isHostOnline = selectedHost?.isOnline ?? true;
	const selectedHostName = selectedHost?.isLocal
		? "this device"
		: (selectedHost?.name ?? "this device");

	const defaultsQuery = useQuery({
		queryKey: ["host-sandbox-defaults", targetHostUrl] as const,
		enabled: !!targetHostUrl && isHostOnline,
		queryFn: () => {
			if (!targetHostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(
				targetHostUrl,
			).settings.sandboxDefaults.get.query();
		},
	});

	const enabled = defaultsQuery.data?.enabled ?? false;
	const provider: SandboxProvider = defaultsQuery.data?.provider ?? "docker";
	const dockerAvailable = defaultsQuery.data?.dockerAvailable ?? null;

	const setMutation = useMutation({
		mutationFn: (vars: { enabled: boolean; provider: SandboxProvider }) => {
			if (!targetHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "update sandbox settings",
					}),
				);
			}
			return getHostServiceClientByUrl(
				targetHostUrl,
			).settings.sandboxDefaults.set.mutate(vars);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["host-sandbox-defaults", targetHostUrl],
			});
		},
		onError: (err) =>
			toast.error(
				err instanceof Error
					? err.message
					: "Failed to update sandbox settings",
			),
	});

	// A failed fetch leaves `enabled`/`provider` on their fallbacks, which were
	// never read from the host — block writes so a toggle can't persist a value
	// derived from unknown current state.
	const controlsDisabled =
		!targetHostUrl ||
		!isHostOnline ||
		defaultsQuery.isLoading ||
		defaultsQuery.isError ||
		setMutation.isPending;

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<header className="mb-8 flex items-center justify-between gap-4">
				<div className="min-w-0">
					<h2 className="text-xl font-semibold">Sandboxes</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Isolation for new workspaces on {selectedHostName}. Projects can
						override this via <code>sandbox.enabled</code> in their Superset
						config.
					</p>
				</div>
				{hasMultipleHosts && targetHostId ? (
					<HostSelect
						value={targetHostId}
						options={hostOptions}
						onValueChange={(nextHostId) => {
							void navigate({
								to: "/settings/sandboxes",
								search: { hostId: nextHostId },
								replace: true,
							});
						}}
					/>
				) : null}
			</header>

			{defaultsQuery.isError ? (
				<p className="mb-4 text-sm text-destructive">
					Couldn't load sandbox settings from {selectedHostName}. Controls are
					disabled until the host responds.
				</p>
			) : null}

			<section>
				<SettingsRow
					label="Sandbox new workspaces"
					hint="Every new workspace opens its git worktree with terminals and agents running inside an isolated sandbox. Existing workspaces keep the mode they were created with."
				>
					<Switch
						checked={enabled}
						disabled={controlsDisabled}
						onCheckedChange={(next) =>
							setMutation.mutate({ enabled: next, provider })
						}
						aria-label="Sandbox new workspaces by default"
					/>
				</SettingsRow>
				<SettingsRow
					label="Provider"
					hint={
						dockerAvailable === false
							? "Docker daemon not detected — start Docker (or an alternative like OrbStack/Colima) before creating sandboxed workspaces."
							: "Which backend runs the sandbox. Docker uses one container per workspace."
					}
				>
					<Select
						value={provider}
						disabled={controlsDisabled}
						onValueChange={(next) =>
							setMutation.mutate({
								enabled,
								provider: next as SandboxProvider,
							})
						}
					>
						<SelectTrigger className="w-40">
							<SelectValue placeholder="Provider" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="docker">Docker</SelectItem>
						</SelectContent>
					</Select>
				</SettingsRow>
			</section>
		</div>
	);
}
