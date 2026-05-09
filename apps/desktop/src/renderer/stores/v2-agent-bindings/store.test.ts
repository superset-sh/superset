import { beforeEach, describe, expect, it } from "bun:test";
import { useV2AgentBindingStore } from "./store";

function reset() {
	useV2AgentBindingStore.setState({ byTerminalId: {} });
}

describe("useV2AgentBindingStore", () => {
	beforeEach(reset);

	it("stores and clears identity per terminal", () => {
		const { setBinding, clearBinding } = useV2AgentBindingStore.getState();

		setBinding("term-1", { agentId: "claude", sessionId: "s1" }, 100);
		expect(useV2AgentBindingStore.getState().byTerminalId["term-1"]).toEqual({
			identity: { agentId: "claude", sessionId: "s1" },
			lastEventAt: 100,
		});

		clearBinding("term-1");
		expect(
			useV2AgentBindingStore.getState().byTerminalId["term-1"],
		).toBeUndefined();
	});

	it("retains the binding across repeated events for the same session", () => {
		const { setBinding } = useV2AgentBindingStore.getState();

		setBinding("term-1", { agentId: "claude", sessionId: "s1" }, 100);
		const firstRef = useV2AgentBindingStore.getState().byTerminalId["term-1"];
		setBinding("term-1", { agentId: "claude", sessionId: "s1" }, 50);
		setBinding("term-1", { agentId: "claude", sessionId: "s1" }, 200);

		// Identical identity events are no-ops; the icon does not need churn.
		expect(useV2AgentBindingStore.getState().byTerminalId["term-1"]).toBe(
			firstRef,
		);
	});

	it("replaces the binding when sessionId changes", () => {
		const { setBinding } = useV2AgentBindingStore.getState();

		setBinding("term-1", { agentId: "claude", sessionId: "s1" }, 100);
		setBinding("term-1", { agentId: "claude", sessionId: "s2" }, 200);

		expect(
			useV2AgentBindingStore.getState().byTerminalId["term-1"]?.identity,
		).toEqual({ agentId: "claude", sessionId: "s2" });
	});

	it("replaces the binding when agentId changes", () => {
		const { setBinding } = useV2AgentBindingStore.getState();

		setBinding("term-1", { agentId: "claude", sessionId: "s1" }, 100);
		setBinding("term-1", { agentId: "codex", sessionId: "s1" }, 200);

		expect(
			useV2AgentBindingStore.getState().byTerminalId["term-1"]?.identity
				.agentId,
		).toBe("codex");
	});

	it("ignores stale events for a different identity", () => {
		const { setBinding } = useV2AgentBindingStore.getState();

		setBinding("term-1", { agentId: "claude", sessionId: "s1" }, 100);
		setBinding("term-1", { agentId: "codex", sessionId: "s2" }, 200);
		setBinding("term-1", { agentId: "claude", sessionId: "s1" }, 150);

		expect(
			useV2AgentBindingStore.getState().byTerminalId["term-1"]?.identity,
		).toEqual({ agentId: "codex", sessionId: "s2" });
	});

	it("isolates bindings per terminal", () => {
		const { setBinding, clearBinding } = useV2AgentBindingStore.getState();

		setBinding("term-1", { agentId: "claude" }, 100);
		setBinding("term-2", { agentId: "codex" }, 100);
		clearBinding("term-1");

		expect(useV2AgentBindingStore.getState().byTerminalId).toEqual({
			"term-2": { identity: { agentId: "codex" }, lastEventAt: 100 },
		});
	});
});
