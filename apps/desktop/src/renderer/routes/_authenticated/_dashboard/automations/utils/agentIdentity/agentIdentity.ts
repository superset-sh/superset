import type { AgentSelectAgent } from "renderer/components/AgentSelect";

/**
 * Resolve a stored `automations.agent` value against a host's agent choices:
 * exact instance id first, then preset slug. Mirrors the host-side
 * `resolveHostAgentConfig` order (choices arrive in display order, so the
 * first preset match is the one the host would launch).
 */
export function matchAgentChoice(
	agents: AgentSelectAgent[],
	value: string | null | undefined,
): AgentSelectAgent | undefined {
	if (!value) return undefined;
	return (
		agents.find((agent) => agent.id === value) ??
		agents.find((agent) => agent.presetId === value)
	);
}

/**
 * The identifier persisted on an automation for a chosen agent. Host config
 * instance ids are random UUIDs regenerated on every seed/reset, so any
 * automation pinned to one breaks when the host DB is rebuilt. Preset slugs
 * survive that (and transfer across hosts), so prefer the slug whenever it
 * names exactly one config on this host. Keep the instance id only when
 * needed to disambiguate: duplicate configs of one preset, or "custom"
 * configs where the slug doesn't identify an agent at all.
 */
export function portableAgentValue(
	agents: AgentSelectAgent[],
	choice: AgentSelectAgent,
): string {
	const presetId = choice.presetId;
	if (!presetId || presetId === "custom") return choice.id;
	const sharingPreset = agents.filter(
		(agent) => agent.presetId === presetId,
	).length;
	return sharingPreset === 1 ? presetId : choice.id;
}
