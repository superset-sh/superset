import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
	getAgentEffortSupport,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import { useAgentEffortPreference } from "../useAgentEffortPreference/useAgentEffortPreference";
import { useAgentModelPreference } from "../useAgentModelPreference/useAgentModelPreference";
import { useAgentLaunchPreferences } from "./useAgentLaunchPreferences";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");
const options = {
	agentStorageKey: "test-agent",
	defaultAgent: "claude",
	fallbackAgent: "claude",
	validAgents: ["none", "claude", "cursor"],
	agentsReady: true,
};
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

test("remembers the explicitly selected agent across creations", () => {
	const first = renderHook(() => useAgentLaunchPreferences(options));
	act(() => first.result.current.setSelectedAgent("cursor"));
	first.unmount();
	const next = renderHook(() => useAgentLaunchPreferences(options));
	expect(next.result.current.selectedAgent).toBe("cursor");
});

test("temporary unavailability does not erase the preference and it recovers", () => {
	window.localStorage.setItem(options.agentStorageKey, "cursor");
	const { result, rerender } = renderHook(useAgentLaunchPreferences, {
		initialProps: options,
	});
	rerender({ ...options, validAgents: ["claude", "none"] });
	expect(result.current.selectedAgent).toBe("claude");
	expect(window.localStorage.getItem(options.agentStorageKey)).toBe("cursor");
	rerender(options);
	expect(result.current.selectedAgent).toBe("cursor");
});

test("asynchronous first-agent defaults are not saved as user choices", () => {
	const { result, rerender } = renderHook(useAgentLaunchPreferences, {
		initialProps: { ...options, defaultAgent: "none", agentsReady: false },
	});
	rerender(options);
	expect(result.current.selectedAgent).toBe("claude");
	expect(window.localStorage.getItem(options.agentStorageKey)).toBeNull();
	act(() => result.current.setSelectedAgent("none"));
	rerender({ ...options, defaultAgent: "cursor" });
	expect(result.current.selectedAgent).toBe("none");
});

test("model and reasoning effort survive agent switches and remounts", () => {
	const model = getAgentModelSupport("claude")?.models[0]?.id;
	const effort = getAgentEffortSupport("claude")?.efforts[0]?.id;
	expect(model).toBeDefined();
	expect(effort).toBeDefined();
	if (!model || !effort)
		throw new Error("Expected Claude model and effort options");
	const usePreferences = (presetId: string) => ({
		...useAgentModelPreference("test-model", presetId),
		...useAgentEffortPreference("test-effort", presetId),
	});
	const first = renderHook(usePreferences, { initialProps: "claude" });
	act(() => {
		first.result.current.setSelectedModel(model ?? null);
		first.result.current.setSelectedEffort(effort ?? null);
	});
	first.rerender("cursor");
	first.rerender("claude");
	expect(first.result.current.selectedModel).toBe(model);
	expect(first.result.current.selectedEffort).toBe(effort);
	first.unmount();
	const next = renderHook(usePreferences, { initialProps: "claude" });
	expect(next.result.current.selectedModel).toBe(model);
	expect(next.result.current.selectedEffort).toBe(effort);
});

test("ignores empty native-select events during host option changes", () => {
	window.localStorage.setItem(options.agentStorageKey, "cursor");
	const { result, rerender } = renderHook(useAgentLaunchPreferences, {
		initialProps: options,
	});
	rerender({ ...options, validAgents: ["claude", "none"] });
	act(() => result.current.setSelectedAgent(""));
	expect(window.localStorage.getItem(options.agentStorageKey)).toBe("cursor");
	rerender(options);
	expect(result.current.selectedAgent).toBe("cursor");
});
