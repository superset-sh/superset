import { useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { usePluginCatalog } from "renderer/hooks/usePluginCatalog";
import { useInstallAfterConnect } from "renderer/routes/_authenticated/_dashboard/hooks/useInstallAfterConnect";
import { PluginDetail } from "./components/PluginDetail";

export type PluginDetailSearch = {
	connect?: boolean;
	connected?: string;
	error?: string;
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/plugins/$pluginName/",
)({
	component: PluginDetailPage,
	validateSearch: (search: Record<string, unknown>): PluginDetailSearch => ({
		connect: search.connect === true ? true : undefined,
		connected:
			typeof search.connected === "string" ? search.connected : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
});

function useConnectOutcome(plugin: string, onConnected: () => void) {
	const { t } = useLingui();
	const navigate = Route.useNavigate();
	const { connected, error } = Route.useSearch();
	const onConnectedRef = useRef(onConnected);
	onConnectedRef.current = onConnected;

	useEffect(() => {
		if (connected === undefined && !error) return;

		if (connected !== undefined) {
			const label = plugin;
			toast.success(t({ message: `Connected ${label}` }));
			onConnectedRef.current();
		} else if (error === "oauth_denied") {
			toast.error(
				t({ message: `You declined the ${plugin} authorization request.` }),
			);
		} else if (error === "not_installed") {
			toast.error(t({ message: `${plugin} is no longer installed.` }));
		} else if (error === "invalid_state") {
			toast.error(
				t({
					message: `That ${plugin} sign-in link expired. Try connecting again.`,
				}),
			);
		} else if (error === "client_unconfigured") {
			toast.error(
				t({
					message: `${plugin} has no OAuth client configured on this deployment yet.`,
				}),
			);
		} else {
			toast.error(t({ message: `Could not connect ${plugin}. Try again.` }));
		}

		void navigate({ search: {}, replace: true });
	}, [connected, error, navigate, plugin, t]);
}

function PluginDetailPage() {
	const { pluginName } = Route.useParams();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS);
	const { plugins, isLoading } = usePluginCatalog();
	const plugin = plugins.find((entry) => entry.name === pluginName);
	const { connect } = Route.useSearch();
	const navigate = Route.useNavigate();

	const installAfterConnect = useInstallAfterConnect();
	const onConnected = useCallback(
		() => void installAfterConnect(pluginName),
		[installAfterConnect, pluginName],
	);
	const [connectedCount, setConnectedCount] = useState(0);
	const onConnectOutcome = useCallback(() => {
		setConnectedCount((count) => count + 1);
		onConnected();
	}, [onConnected]);

	useConnectOutcome(
		plugin?.interface.displayName ?? pluginName,
		onConnectOutcome,
	);

	useEffect(() => {
		if (connect) void navigate({ search: {}, replace: true });
	}, [connect, navigate]);

	if (env.NODE_ENV !== "development") {
		if (isEnabled === undefined) return null;
		if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	}
	if (isLoading) return null;
	if (!plugin) return <Redirect to="/plugins" />;

	return (
		<PluginDetail
			plugin={plugin}
			openConnect={connect}
			connectedCount={connectedCount}
			onConnected={onConnected}
		/>
	);
}
