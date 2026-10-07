import "../../../../i18n/test-setup";
import { expect, test } from "bun:test";
import {
	type DraftTrigger,
	draftTriggerSchema,
	triggerKindsForConnector,
} from "@superset/shared/automation-triggers";
import type { AutomationDbExecutor } from "./helpers";
import { saveTriggerSet } from "./triggerSet";

const triggerId = "6b140ee5-26d2-407d-a96f-7d502e93b6b4";
const connectionId = "4b3b73e4-65c4-4195-a272-6b3568fffd78";
const config = {
	kind: "gitlab" as const,
	event: "merge_request.opened" as const,
	projects: { mode: "list" as const, ids: ["Team/Widget"] },
	branches: { mode: "any" as const },
	labels: { mode: "any" as const },
	includeForks: false as const,
};

function fixture(existing: DraftTrigger[] = []) {
	const rows = existing.map((row) => ({ ...row, nextRunAt: null }));
	const writes: Array<Record<string, unknown>> = [];
	let reads = 0;
	const db = {
		select: () => ({
			from: () => ({ where: async () => (reads++ === 0 ? [...rows] : rows) }),
		}),
		delete: () => ({ where: async () => writes.push({ operation: "delete" }) }),
		insert: () => ({
			values: (value: Record<string, unknown>) => ({
				returning: async () => {
					writes.push(value);
					rows.push({ ...value, id: triggerId } as (typeof rows)[number]);
					return [{ id: triggerId }];
				},
			}),
		}),
		update: () => ({
			set: (value: Record<string, unknown>) => ({
				where: () => ({
					returning: async () => {
						writes.push(value);
						Object.assign(rows[0] ?? {}, value);
						return [{ id: triggerId }];
					},
				}),
			}),
		}),
	};
	return { db: db as unknown as AutomationDbExecutor, writes };
}

test("saving a GitLab trigger retains the selected project and account", async () => {
	const { db, writes } = fixture();
	const trigger = draftTriggerSchema.parse({ config, connectionId });
	expect(triggerKindsForConnector("gitlab")).toEqual(["gitlab"]);
	const saved = await saveTriggerSet(db, {
		automationId: "automation",
		organizationId: "organization",
		triggers: [trigger],
	});
	expect(saved).toHaveLength(1);
	expect(writes[1]).toMatchObject({
		kind: "gitlab",
		config,
		connectionId,
		organizationId: "organization",
	});
});

test("a released client without account fields retains the existing GitLab pin", async () => {
	const { db, writes } = fixture([{ id: triggerId, config, connectionId }]);
	const saved = await saveTriggerSet(db, {
		automationId: "automation",
		organizationId: "organization",
		triggers: [{ id: triggerId, config }],
	});
	expect(writes[1]).not.toHaveProperty("connectionId");
	expect(saved[0]?.connectionId).toBe(connectionId);
});

test("explicit any-account selection clears an existing GitLab pin", async () => {
	const { db, writes } = fixture([{ id: triggerId, config, connectionId }]);
	const saved = await saveTriggerSet(db, {
		automationId: "automation",
		organizationId: "organization",
		triggers: [{ id: triggerId, config, connectionId: null }],
	});
	expect(writes[1]?.connectionId).toBeNull();
	expect(saved[0]?.connectionId).toBeNull();
});

test("an unavailable trigger kind is refused before any write", async () => {
	const { db, writes } = fixture();
	await expect(
		saveTriggerSet(db, {
			automationId: "automation",
			organizationId: "organization",
			triggers: [
				{
					config: { ...config, kind: "unavailable" },
				} as unknown as DraftTrigger,
			],
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(writes).toEqual([]);
});
