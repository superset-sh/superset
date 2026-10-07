import { expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

let updateSettings = async (_hostUrl: string) => settings;
let cloudWorkspaces = false;
let desktopPlatform = "darwin";
let otherHosts = [
	{ id: "remote", name: "Remote Mac", isOnline: true, platform: "darwin" },
];
mock.module("posthog-js/react", () => ({
	useFeatureFlagEnabled: () => cloudWorkspaces,
}));
mock.module("renderer/hooks/useIsV2CloudEnabled", () => ({
	useIsV2CloudEnabled: () => true,
}));
mock.module("renderer/stores/settings-state", () => ({
	useSettingsSearchQuery: () => "",
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		useUtils: () => ({}),
		githubUser: {
			get: {
				useQuery: () => ({ data: { connection: null }, isPending: false }),
			},
			connect: { useMutation: () => ({ isPending: false }) },
			disconnect: { useMutation: () => ({ isPending: false }) },
		},
	},
}));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: (hostUrl: string) => ({
		settings: {
			superwhisper: {
				get: { query: () => new Promise(() => {}) },
				set: { mutate: () => updateSettings(hostUrl) },
			},
		},
	}),
}));
mock.module("@tanstack/react-router", () => ({
	useNavigate: () => () => {},
}));
mock.module("renderer/components/Redirect", () => ({
	Redirect: ({ to }: { to: string }) => <a href={to}>redirect</a>,
}));
mock.module("renderer/hooks/host-service/useHostTargetUrl", () => ({
	useHostUrl: (hostId: string | undefined) =>
		hostId ? `http://${hostId}` : null,
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		window: { getPlatform: { useQuery: () => ({ data: desktopPlatform }) } },
	},
}));
mock.module(
	"renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions",
	() => ({
		useWorkspaceHostOptions: () => ({
			currentDeviceName: "Local Mac",
			localHostId: "local",
			otherHosts,
			settled: true,
		}),
	}),
);

const { SuperwhisperSettings } = await import("../SuperwhisperSettings");
const { ConnectionsSettings } = await import("../../../ConnectionsSettings");
const { useMacHostOptions } = await import(
	"../../../../../../hooks/useMacHostOptions"
);

function MacHostIds() {
	return (
		<>
			{useMacHostOptions()
				.options.map((option) => option.id)
				.join(",")}
		</>
	);
}
const settings = { enabled: true, installed: true, modeReady: true };
const queryKey = ["host-superwhisper", "http://remote"];
const remoteMac = {
	id: "remote",
	name: "Remote Mac",
	isOnline: true,
	platform: "darwin",
};
const linuxBox = {
	id: "linux",
	name: "Linux Box",
	isOnline: true,
	platform: "linux",
};

function renderSettings({
	data,
	error,
	isOnline = true,
	fullPage = false,
	hostId = "remote",
	platform = "darwin",
	hosts,
}: {
	data?: typeof settings;
	error?: Error;
	isOnline?: boolean;
	fullPage?: boolean;
	hostId?: string | null;
	platform?: string;
	hosts?: (typeof remoteMac)[];
} = {}) {
	desktopPlatform = platform;
	otherHosts = hosts ?? [{ ...remoteMac, isOnline }];
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: Infinity } },
	});
	if (data) client.setQueryData(queryKey, data);
	if (error)
		client
			.getQueryCache()
			.build(client, { queryKey })
			.setState({ status: "error", error, fetchStatus: "idle" });
	try {
		return renderToStaticMarkup(
			<QueryClientProvider client={client}>
				{fullPage ? (
					<ConnectionsSettings hostId={hostId} />
				) : (
					<SuperwhisperSettings hostId={hostId} />
				)}
			</QueryClientProvider>,
		);
	} finally {
		client.clear();
	}
}

function expectSelectorWithoutControls(html: string) {
	expect(html).toContain("Superwhisper</h3>");
	expect(html).toContain("Remote Mac");
	expect(html).not.toContain('id="superwhisper-enabled"');
}

test("keeps dictation controls but hides GitHub and the accounts text without cloud workspaces", () => {
	cloudWorkspaces = false;
	const html = renderSettings({ data: settings, fullPage: true });
	expect(html).toContain('id="superwhisper-enabled"');
	expect(html).not.toContain("GitHub");
	expect(html).not.toContain("Your own accounts");
	cloudWorkspaces = true;
	const withGithub = renderSettings({ data: settings, fullPage: true });
	expect(withGithub).toContain("GitHub");
	expect(withGithub).toContain("Your own accounts");
	cloudWorkspaces = false;
});

test("leaves Connections when no Mac is known and cloud workspaces are off", () => {
	cloudWorkspaces = false;
	const html = renderSettings({
		fullPage: true,
		hostId: null,
		platform: "linux",
		hosts: [linuxBox],
	});
	expect(html).toBe('<a href="/settings/account">redirect</a>');
});

test("keeps the Mac selector while settings load", () => {
	expectSelectorWithoutControls(renderSettings());
});
test("keeps the Mac selector for an old host", () => {
	const error = Object.assign(new Error("Not found"), {
		data: { code: "NOT_FOUND" },
	});
	expectSelectorWithoutControls(renderSettings({ error }));
});
test("keeps the Mac selector when the host is offline despite cached settings", () => {
	expectSelectorWithoutControls(
		renderSettings({ data: settings, isOnline: false }),
	);
});
test("keeps the Mac selector after a failed settings refresh", () => {
	expectSelectorWithoutControls(
		renderSettings({ data: settings, error: new Error("offline") }),
	);
});
test("shows the Mac selector and controls after a successful query", () => {
	const html = renderSettings({ data: settings });
	expect(html).toContain("Superwhisper</h3>");
	expect(html).toContain("Remote Mac");
	expect(html).toContain('id="superwhisper-enabled"');
});
test("selects a remote Mac from a Linux desktop and offers only macOS hosts", () => {
	const html = renderSettings({
		data: settings,
		hostId: null,
		platform: "linux",
		hosts: [remoteMac, linuxBox],
	});
	expect(html).toContain("Remote Mac");
	expect(html).toContain('id="superwhisper-enabled"');
	expect(renderToStaticMarkup(<MacHostIds />)).toBe("remote");
	desktopPlatform = "darwin";
	expect(renderToStaticMarkup(<MacHostIds />)).toBe("local,remote");
});

test("updates only the submitted host cache after the selected Mac changes", async () => {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	const { render, cleanup, act } = await import("@testing-library/react/pure");
	const { SuperwhisperControls } = await import(
		"../components/SuperwhisperControls/SuperwhisperControls"
	);
	let resolve!: (value: typeof settings) => void;
	let started!: () => void;
	const pending = new Promise<typeof settings>((yes) => {
		resolve = yes;
	});
	const submitting = new Promise<void>((yes) => {
		started = yes;
	});
	updateSettings = async (url) => {
		expect(url).toBe("http://first");
		started();
		return pending;
	};
	const firstKey = ["host-superwhisper", "http://first"];
	const secondKey = ["host-superwhisper", "http://second"];
	const previous = { enabled: false, installed: true, modeReady: true };
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
		},
	});
	client.setQueryData(firstKey, previous);
	client.setQueryData(secondKey, previous);
	const page = (url: string) => (
		<QueryClientProvider client={client}>
			<SuperwhisperControls hostUrl={url} enabled />
		</QueryClientProvider>
	);
	try {
		const rendered = render(page("http://first"));
		await act(async () => {
			rendered.getByRole("switch").click();
			await submitting;
		});
		rendered.rerender(page("http://second"));
		await act(async () => {
			resolve(settings);
			await pending;
		});
		expect(client.getQueryData<typeof settings>(firstKey)).toEqual(settings);
		expect(client.getQueryData<typeof settings>(secondKey)).toEqual(previous);
	} finally {
		cleanup();
		client.clear();
		await GlobalRegistrator.unregister();
	}
});
