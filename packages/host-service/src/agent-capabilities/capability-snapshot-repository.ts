import { Buffer } from "node:buffer";
import type { AgentCapabilityTrait } from "@superset/shared/agent-models";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../db";
import { hostAgentCapabilitySnapshots, hostAgentConfigs } from "../db/schema";
import type {
	AgentCapabilityErrorKind,
	AgentCapabilityModel,
	AgentCapabilityStatus,
} from "./agent-capabilities";
import type { AgentExecutableSource } from "./executable-resolver";

export const CAPABILITY_INVENTORY_SCHEMA_VERSION = 2;
export const MAX_CAPABILITY_INVENTORY_BYTES = 512 * 1024;
export const MAX_CAPABILITY_MODELS = 2_000;
export const MAX_CAPABILITY_STRING_LENGTH = 512;
export const CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
export const CAPABILITY_SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export const SANITIZED_CAPABILITY_MESSAGES = {
	authenticationRequired: "Authentication required",
	missingExecutable: "Configured executable was not found",
	timeout: "Capability probe timed out",
	processFailure: "Capability probe process failed",
	parseFailure: "Capability response could not be parsed",
} as const;

export const SANITIZED_CAPABILITY_MESSAGE_VALUES: ReadonlySet<string> = new Set(
	Object.values(SANITIZED_CAPABILITY_MESSAGES),
);

export type AgentHealthStatus = AgentCapabilityStatus | "unknown";

type PersistedAuth = "authenticated" | "unauthenticated" | "unknown";

export interface AgentCapabilityInventory {
	schemaVersion: typeof CAPABILITY_INVENTORY_SCHEMA_VERSION;
	agentId: string;
	presetId: string;
	configRevision: number;
	detectedVersion: string | null;
	modelSource: "runtime" | "curated";
	models: AgentCapabilityModel[];
	inventoryCheckedAt: string;
}

export interface PersistedAgentCapabilitySnapshot {
	agentId: string;
	presetId: string;
	configRevision: number;
	inventory: AgentCapabilityInventory | null;
	status: AgentHealthStatus;
	installed: boolean | null;
	auth: PersistedAuth;
	errorKind: AgentCapabilityErrorKind | null;
	message: string | null;
	resolverSource: AgentExecutableSource | null;
	inventoryCheckedAt: number | null;
	statusCheckedAt: number;
	writtenAt: number;
}

export interface CapabilitySnapshotWrite {
	agentId: string;
	presetId: string;
	configRevision: number;
	inventory: AgentCapabilityInventory | null;
	status: AgentHealthStatus;
	installed: boolean | null;
	auth: PersistedAuth;
	errorKind?: AgentCapabilityErrorKind | null;
	message?: string | null;
	resolverSource?: AgentExecutableSource | null;
	inventoryCheckedAt: number | null;
	statusCheckedAt: number;
	writtenAt: number;
}

export class CapabilityInventoryValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CapabilityInventoryValidationError";
	}
}

const boundedString = z.string().min(1).max(MAX_CAPABILITY_STRING_LENGTH);
const optionSchema = z
	.object({
		id: boundedString,
		label: boundedString,
	})
	.strict();
const traitSchema: z.ZodType<
	AgentCapabilityTrait<{ id: string; label: string }>
> = z.discriminatedUnion("state", [
	z.object({ state: z.literal("unknown") }).strict(),
	z.object({ state: z.literal("unsupported") }).strict(),
	z
		.object({
			state: z.literal("supported"),
			options: z.array(optionSchema).min(1).max(MAX_CAPABILITY_MODELS),
			defaultId: boundedString.optional(),
		})
		.strict(),
]);
const modelSchema: z.ZodType<AgentCapabilityModel> = z
	.object({
		id: boundedString,
		label: boundedString,
		provider: boundedString.optional(),
		reasoning: traitSchema,
		variant: z
			.object({
				familyId: boundedString,
				familyLabel: boundedString,
				effort: boundedString,
				speed: z.enum(["standard", "fast"]),
				mode: z.enum(["standard", "thinking"]),
				contextWindow: z.enum(["default", "1m"]),
			})
			.strict()
			.optional(),
	})
	.strict();
const inventorySchema: z.ZodType<AgentCapabilityInventory> = z
	.object({
		schemaVersion: z.literal(CAPABILITY_INVENTORY_SCHEMA_VERSION),
		agentId: boundedString,
		presetId: boundedString,
		configRevision: z.number().int().positive(),
		detectedVersion: boundedString.nullable(),
		modelSource: z.enum(["runtime", "curated"]),
		models: z.array(modelSchema).max(MAX_CAPABILITY_MODELS),
		inventoryCheckedAt: z.string().datetime(),
	})
	.strict();

function assertUniqueIds(inventory: AgentCapabilityInventory): void {
	const modelIds = new Set<string>();
	for (const model of inventory.models) {
		if (modelIds.has(model.id)) {
			throw new CapabilityInventoryValidationError(
				`Duplicate capability model id: ${model.id}`,
			);
		}
		modelIds.add(model.id);
		if (model.reasoning.state !== "supported") continue;
		const optionIds = new Set<string>();
		for (const option of model.reasoning.options) {
			if (optionIds.has(option.id)) {
				throw new CapabilityInventoryValidationError(
					`Duplicate reasoning option id for ${model.id}: ${option.id}`,
				);
			}
			optionIds.add(option.id);
		}
		if (
			model.reasoning.defaultId !== undefined &&
			!optionIds.has(model.reasoning.defaultId)
		) {
			throw new CapabilityInventoryValidationError(
				`Unknown default reasoning option for ${model.id}: ${model.reasoning.defaultId}`,
			);
		}
	}
}

function validateInventory(
	inventory: AgentCapabilityInventory,
): AgentCapabilityInventory {
	const result = inventorySchema.safeParse(inventory);
	if (!result.success) {
		throw new CapabilityInventoryValidationError(
			`Invalid capability inventory: ${result.error.issues[0]?.message ?? "unknown error"}`,
		);
	}
	assertUniqueIds(result.data);
	return result.data;
}

export function encodeCapabilityInventory(
	inventory: AgentCapabilityInventory,
): string {
	const parsed = validateInventory(inventory);
	const encoded = JSON.stringify(parsed);
	if (Buffer.byteLength(encoded, "utf8") > MAX_CAPABILITY_INVENTORY_BYTES) {
		throw new CapabilityInventoryValidationError(
			"Capability inventory exceeds the persistence size limit",
		);
	}
	return encoded;
}

export function decodeCapabilityInventory(
	encoded: string,
): AgentCapabilityInventory {
	if (Buffer.byteLength(encoded, "utf8") > MAX_CAPABILITY_INVENTORY_BYTES) {
		throw new CapabilityInventoryValidationError(
			"Capability inventory exceeds the persistence size limit",
		);
	}
	let decoded: ReturnType<typeof JSON.parse>;
	try {
		decoded = JSON.parse(encoded);
	} catch {
		throw new CapabilityInventoryValidationError(
			"Capability inventory is not valid JSON",
		);
	}
	const result = inventorySchema.safeParse(decoded);
	if (!result.success) {
		throw new CapabilityInventoryValidationError(
			`Invalid capability inventory: ${result.error.issues[0]?.message ?? "unknown error"}`,
		);
	}
	assertUniqueIds(result.data);
	return result.data;
}

function deleteSnapshot(db: HostDb, agentId: string): void {
	db.delete(hostAgentCapabilitySnapshots)
		.where(eq(hostAgentCapabilitySnapshots.agentId, agentId))
		.run();
}

const capabilityStatusSchema = z.enum([
	"ready",
	"unavailable",
	"authentication_required",
	"unknown",
]);
const persistedAuthSchema = z.enum([
	"authenticated",
	"unauthenticated",
	"unknown",
]);
const capabilityErrorKindSchema = z.enum([
	"timeout",
	"process_failure",
	"parse_failure",
	"missing_executable",
]);
const executableSourceSchema = z.enum(["explicit", "path", "wrapper"]);
const persistedDiagnosticsSchema = z.object({
	status: capabilityStatusSchema,
	auth: persistedAuthSchema,
	errorKind: capabilityErrorKindSchema.nullable(),
	resolverSource: executableSourceSchema.nullable(),
});

function isTimestamp(value: number | null): value is number {
	return value !== null && Number.isSafeInteger(value) && value >= 0;
}

export function displayableCapabilityInventory(
	inventory: AgentCapabilityInventory | null,
	now: number,
	maxDisplayAgeMs = CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS,
): AgentCapabilityInventory | null {
	if (!inventory) return null;
	const checkedAt = Date.parse(inventory.inventoryCheckedAt);
	if (!Number.isFinite(checkedAt) || now - checkedAt > maxDisplayAgeMs) {
		return null;
	}
	return inventory;
}

export function listCapabilitySnapshots(
	db: HostDb,
	options: {
		now?: number;
		maxDisplayAgeMs?: number;
		agentId?: string;
		includeHiddenInventory?: boolean;
	} = {},
): PersistedAgentCapabilitySnapshot[] {
	const now = options.now ?? Date.now();
	const maxDisplayAgeMs =
		options.maxDisplayAgeMs ?? CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS;
	const includeHiddenInventory = options.includeHiddenInventory === true;
	const baseQuery = db
		.select({
			agentId: hostAgentCapabilitySnapshots.agentId,
			presetId: hostAgentCapabilitySnapshots.presetId,
			configRevision: hostAgentCapabilitySnapshots.configRevision,
			schemaVersion: hostAgentCapabilitySnapshots.schemaVersion,
			inventoryJson: hostAgentCapabilitySnapshots.inventoryJson,
			status: hostAgentCapabilitySnapshots.status,
			installed: hostAgentCapabilitySnapshots.installed,
			auth: hostAgentCapabilitySnapshots.auth,
			errorKind: hostAgentCapabilitySnapshots.errorKind,
			message: hostAgentCapabilitySnapshots.message,
			resolverSource: hostAgentCapabilitySnapshots.resolverSource,
			inventoryCheckedAt: hostAgentCapabilitySnapshots.inventoryCheckedAt,
			statusCheckedAt: hostAgentCapabilitySnapshots.statusCheckedAt,
			writtenAt: hostAgentCapabilitySnapshots.writtenAt,
			currentPresetId: hostAgentConfigs.presetId,
			currentRevision: hostAgentConfigs.capabilityRevision,
		})
		.from(hostAgentCapabilitySnapshots)
		.innerJoin(
			hostAgentConfigs,
			eq(hostAgentCapabilitySnapshots.agentId, hostAgentConfigs.id),
		);

	const rows = options.agentId
		? baseQuery
				.where(eq(hostAgentCapabilitySnapshots.agentId, options.agentId))
				.all()
		: baseQuery.all();

	return rows.flatMap((row): PersistedAgentCapabilitySnapshot[] => {
		if (row.schemaVersion !== CAPABILITY_INVENTORY_SCHEMA_VERSION) {
			deleteSnapshot(db, row.agentId);
			return [];
		}
		if (
			row.presetId !== row.currentPresetId ||
			row.configRevision !== row.currentRevision
		) {
			deleteSnapshot(db, row.agentId);
			return [];
		}
		const diagnostics = persistedDiagnosticsSchema.safeParse(row);
		if (
			!diagnostics.success ||
			(row.message !== null &&
				!SANITIZED_CAPABILITY_MESSAGE_VALUES.has(row.message)) ||
			!isTimestamp(row.statusCheckedAt) ||
			!isTimestamp(row.writtenAt) ||
			(row.inventoryCheckedAt !== null && !isTimestamp(row.inventoryCheckedAt))
		) {
			deleteSnapshot(db, row.agentId);
			return [];
		}
		let inventory: AgentCapabilityInventory | null = null;
		if (row.inventoryJson !== null) {
			try {
				inventory = decodeCapabilityInventory(row.inventoryJson);
			} catch {
				deleteSnapshot(db, row.agentId);
				return [];
			}
			if (
				row.inventoryCheckedAt === null ||
				Date.parse(inventory.inventoryCheckedAt) !== row.inventoryCheckedAt ||
				inventory.agentId !== row.agentId ||
				inventory.presetId !== row.presetId ||
				inventory.configRevision !== row.configRevision ||
				inventory.schemaVersion !== row.schemaVersion
			) {
				deleteSnapshot(db, row.agentId);
				return [];
			}
		} else if (row.inventoryCheckedAt !== null) {
			deleteSnapshot(db, row.agentId);
			return [];
		}

		let visibleInventory = inventory;
		if (
			!includeHiddenInventory &&
			row.inventoryCheckedAt !== null &&
			now - row.inventoryCheckedAt > maxDisplayAgeMs
		) {
			visibleInventory = null;
		}

		return [
			{
				agentId: row.agentId,
				presetId: row.presetId,
				configRevision: row.configRevision,
				inventory: visibleInventory,
				status: diagnostics.data.status,
				installed: row.installed,
				auth: diagnostics.data.auth,
				errorKind: diagnostics.data.errorKind,
				message: row.message,
				resolverSource: diagnostics.data.resolverSource,
				inventoryCheckedAt: row.inventoryCheckedAt,
				statusCheckedAt: row.statusCheckedAt,
				writtenAt: row.writtenAt,
			},
		];
	});
}

export function writeCapabilitySnapshotIfCurrentRevision(
	db: HostDb,
	input: CapabilitySnapshotWrite,
	options: { persist?: boolean } = {},
): boolean {
	const persist = options.persist !== false;
	if (persist) {
		if (
			!isTimestamp(input.statusCheckedAt) ||
			!isTimestamp(input.writtenAt) ||
			(input.inventoryCheckedAt !== null &&
				!isTimestamp(input.inventoryCheckedAt))
		) {
			throw new CapabilityInventoryValidationError(
				"Capability snapshot contains an invalid timestamp",
			);
		}
		if (
			(input.message != null &&
				!SANITIZED_CAPABILITY_MESSAGE_VALUES.has(input.message)) ||
			(input.errorKind != null &&
				!capabilityErrorKindSchema.safeParse(input.errorKind).success) ||
			(input.resolverSource != null &&
				!executableSourceSchema.safeParse(input.resolverSource).success) ||
			!capabilityStatusSchema.safeParse(input.status).success
		) {
			throw new CapabilityInventoryValidationError(
				"Capability snapshot contains invalid diagnostics",
			);
		}
		if (input.inventory === null && input.inventoryCheckedAt !== null) {
			throw new CapabilityInventoryValidationError(
				"Capability snapshot without inventory must clear inventoryCheckedAt",
			);
		}
		if (
			input.inventory !== null &&
			(input.inventory.agentId !== input.agentId ||
				input.inventory.presetId !== input.presetId ||
				input.inventory.configRevision !== input.configRevision)
		) {
			throw new CapabilityInventoryValidationError(
				"Capability inventory identity does not match its snapshot",
			);
		}
		if (
			input.inventory !== null &&
			(input.inventoryCheckedAt === null ||
				Date.parse(input.inventory.inventoryCheckedAt) !==
					input.inventoryCheckedAt)
		) {
			throw new CapabilityInventoryValidationError(
				"Capability inventory timestamp does not match its snapshot",
			);
		}
	}

	let inventoryJson: string | null = null;
	if (persist && input.inventory !== null) {
		inventoryJson = encodeCapabilityInventory(input.inventory);
	}

	return db.transaction((tx) => {
		const current = tx
			.select({
				presetId: hostAgentConfigs.presetId,
				capabilityRevision: hostAgentConfigs.capabilityRevision,
			})
			.from(hostAgentConfigs)
			.where(eq(hostAgentConfigs.id, input.agentId))
			.get();
		if (
			!current ||
			current.presetId !== input.presetId ||
			current.capabilityRevision !== input.configRevision
		) {
			return false;
		}
		if (!persist) return true;

		const values = {
			agentId: input.agentId,
			presetId: input.presetId,
			configRevision: input.configRevision,
			schemaVersion: CAPABILITY_INVENTORY_SCHEMA_VERSION,
			inventoryJson,
			status: input.status,
			installed: input.installed,
			auth: input.auth,
			errorKind: input.errorKind ?? null,
			message: input.message ?? null,
			resolverSource: input.resolverSource ?? null,
			inventoryCheckedAt: input.inventoryCheckedAt,
			statusCheckedAt: input.statusCheckedAt,
			writtenAt: input.writtenAt,
		};
		tx.insert(hostAgentCapabilitySnapshots)
			.values(values)
			.onConflictDoUpdate({
				target: hostAgentCapabilitySnapshots.agentId,
				set: values,
			})
			.run();
		return true;
	});
}

export function invalidateCapabilitySnapshot(
	db: HostDb,
	agentId: string,
): void {
	deleteSnapshot(db, agentId);
}

export function pruneExpiredCapabilitySnapshots(
	db: HostDb,
	options: { now?: number; retentionMs?: number } = {},
): number {
	const now = options.now ?? Date.now();
	const retentionMs = options.retentionMs ?? CAPABILITY_SNAPSHOT_RETENTION_MS;
	return db
		.delete(hostAgentCapabilitySnapshots)
		.where(lt(hostAgentCapabilitySnapshots.writtenAt, now - retentionMs))
		.run().changes;
}
