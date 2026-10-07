import { expect, test } from "bun:test";
import {
	mobileM2Fixture,
	runMobileM2Child,
} from "@/hooks/useOpenLink/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"Cloud creation remains discoverable with zero workspaces and no machines",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileM2Fixture();
	let cloudEnabled = true;
	let hosts = { isSuccess: true, data: [] as { id: string }[] };
	f.mockLeaf("@/hooks/useOrgHosts", { useOrgHosts: () => ({ query: hosts }) });
	f.mockLeaf("@/lib/posthog", { useFeatureFlag: () => cloudEnabled });
	const filters = { scope: "host", hasHydrated: true };
	f.mockLeaf(
		"@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore",
		{
			useWorkspacesFilterStore: (select: (state: typeof filters) => unknown) =>
				select(filters),
		},
	);
	const preferences = { targetKey: null, hasHydrated: true };
	f.mockLeaf(
		"@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore",
		{
			useNewSessionPreferencesStore: (
				select: (state: typeof preferences) => unknown,
			) => select(preferences),
		},
	);
	f.mockLeaf("@/screens/(authenticated)/(home)/hooks/useSelectedHost", {
		useSelectedHost: () => null,
	});
	f.mockLeaf("@/hooks/useHostProjects", {
		toHostProjectItem: () => {
			throw Error("No host projects expected");
		},
	});
	const { useNewChatTargets } = await import("./useNewChatTargets");
	let value: ReturnType<typeof useNewChatTargets>;
	function Probe() {
		value = useNewChatTargets([]);
		return null;
	}
	test("settled empty host scope offers a default Cloud target before the first workspace", async () => {
		await f.render(Probe);
		expect(value.targets).toMatchObject([
			{ kind: "cloud", machineId: "cloud", projectName: "Cloud" },
		]);
		expect(value.defaultTarget?.kind).toBe("cloud");
		expect(f.state.requests).toEqual([]);
		await f.cleanup();
	});
	test("pending hosts and disabled Cloud preserve established machine scope", async () => {
		hosts = { isSuccess: false, data: [] };
		await f.render(Probe);
		expect(value.targets).toEqual([]);
		hosts = { isSuccess: true, data: [] };
		cloudEnabled = false;
		await f.render(Probe);
		expect(value.targets).toEqual([]);
		await f.cleanup();
	});
}
