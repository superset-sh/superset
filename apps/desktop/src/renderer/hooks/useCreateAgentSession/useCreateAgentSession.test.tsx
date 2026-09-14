import { beforeEach, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let machineId: string | null = "host-1";
let agents = [{ id: "claude" }, { id: "codex" }, { id: "superset" }];
let storedAgent: string | null = "codex";
let outcome: Promise<{ ok: boolean }> = Promise.resolve({ ok: true });
const submit = mock((_args: unknown) => ({
	workspaceId: "session-1",
	completed: outcome,
}));
const navigate = mock(() => Promise.resolve());
const showError = mock(() => {});

mock.module("renderer/hooks/useV2AgentChoices", () => ({
	useV2AgentChoices: () => ({ agents }),
}));
mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({
			machineId,
			activeHostUrl: "http://localhost:1234",
		}),
	}),
);
mock.module("renderer/stores/workspace-creates", () => ({
	useWorkspaceCreates: () => ({ submit }),
}));
mock.module("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
mock.module("@superset/ui/sonner", () => ({ toast: { error: showError } }));

const { useCreateAgentSession } = await import("./useCreateAgentSession");
let session: ReturnType<typeof useCreateAgentSession>;
function Probe() {
	session = useCreateAgentSession();
	return null;
}

beforeEach(() => {
	machineId = "host-1";
	agents = [{ id: "claude" }, { id: "codex" }, { id: "superset" }];
	storedAgent = "codex";
	outcome = Promise.resolve({ ok: true });
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: { getItem: () => storedAgent },
	});
	submit.mockClear();
	navigate.mockClear();
	showError.mockClear();
	renderToStaticMarkup(<Probe />);
});

describe("useCreateAgentSession", () => {
	test("seeds a project-less session with the remembered terminal agent and navigates immediately", async () => {
		expect(await session.createSession("Publish a page")).toBe(true);
		expect(submit).toHaveBeenCalledWith({
			hostId: "host-1",
			snapshot: {
				id: expect.any(String),
				projectId: null,
				agents: [{ agent: "codex", prompt: "Publish a page" }],
			},
		});
		expect(navigate).toHaveBeenCalledWith({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: "session-1" },
		});
	});
	test("falls back to a terminal agent when the remembered choice cannot run the CLI", async () => {
		storedAgent = "superset";
		await session.createSession("Coordinate agents");
		expect(submit.mock.calls[0]).toEqual([
			expect.objectContaining({
				snapshot: expect.objectContaining({
					agents: [{ agent: "claude", prompt: "Coordinate agents" }],
				}),
			}),
		]);
	});
	test("does not submit without a host or terminal agent", async () => {
		machineId = null;
		renderToStaticMarkup(<Probe />);
		expect(await session.createSession("test")).toBe(false);
		machineId = "host-1";
		agents = [{ id: "superset" }];
		renderToStaticMarkup(<Probe />);
		expect(await session.createSession("test")).toBe(false);
		expect(submit).not.toHaveBeenCalled();
		expect(showError).toHaveBeenCalledTimes(2);
	});
	test("prevents double submission, reports failed creation, and allows a retry", async () => {
		let settle!: (value: { ok: boolean }) => void;
		outcome = new Promise((resolve) => {
			settle = resolve;
		});
		const first = session.createSession("test");
		expect(navigate).toHaveBeenCalledTimes(1);
		expect(await session.createSession("test")).toBe(false);
		expect(submit).toHaveBeenCalledTimes(1);
		settle({ ok: false });
		expect(await first).toBe(false);
		outcome = Promise.resolve({ ok: true });
		expect(await session.createSession("retry")).toBe(true);
		expect(submit).toHaveBeenCalledTimes(2);
	});
});
