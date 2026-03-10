import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useHostService } from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";

type HealthStatus = "unknown" | "ok" | "error";

interface ServiceInfo {
	platform: string;
	arch: string;
	nodeVersion: string;
	uptime: number;
}

export function HostServiceStatus() {
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.V2_CLOUD);
	const { services } = useHostService();
	const { data: session } = authClient.useSession();

	const activeOrgId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const service = activeOrgId ? services.get(activeOrgId) : null;

	const [status, setStatus] = useState<HealthStatus>("unknown");
	const [info, setInfo] = useState<ServiceInfo | null>(null);

	const checkHealth = useCallback(async () => {
		if (!service) {
			setStatus("unknown");
			return;
		}

		try {
			const result = await service.client.health.check.query();
			setStatus(result.status === "ok" ? "ok" : "error");
		} catch {
			setStatus("error");
		}
	}, [service]);

	const fetchInfo = useCallback(async () => {
		if (!service) return;

		try {
			const result = await service.client.health.info.query();
			setInfo(result);
		} catch {
			setInfo(null);
		}
	}, [service]);

	useEffect(() => {
		checkHealth();
		const interval = setInterval(checkHealth, 15_000);
		return () => clearInterval(interval);
	}, [checkHealth]);

	if (!enabled) return null;

	const dotColor =
		status === "ok"
			? "bg-green-500"
			: status === "error"
				? "bg-red-500"
				: "bg-yellow-500";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={() => fetchInfo()}
				>
					<span className={`size-2 rounded-full ${dotColor}`} />
				</Button>
			</PopoverTrigger>
			<PopoverContent side="top" align="start" className="w-64 text-xs">
				<div className="space-y-1">
					<div className="font-medium">Workspace Service</div>
					<div className="text-muted-foreground">Status: {status}</div>
					{service && (
						<div className="text-muted-foreground">{service.url}</div>
					)}
					{info && (
						<>
							<div className="text-muted-foreground">
								Platform: {info.platform} ({info.arch})
							</div>
							<div className="text-muted-foreground">
								Node: {info.nodeVersion}
							</div>
							<div className="text-muted-foreground">
								Uptime: {Math.floor(info.uptime)}s
							</div>
						</>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
