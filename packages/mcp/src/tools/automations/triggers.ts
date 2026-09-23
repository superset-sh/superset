import { draftTriggerSchema } from "@superset/shared/automation-triggers";
import { LAUNCHED_TRIGGER_KINDS } from "@superset/shared/constants";
import { z } from "zod";

const SHAPE_HELP = [
	"Full replacement of the automation's triggers — omitted triggers are DELETED.",
	"Read automations_get first and resend the existing entries (with their `id`) alongside any new one; an entry without `id` is created, and an existing `id` is updated in place, which preserves a webhook's signing key and a schedule's next run.",
	`Each entry is {id?, config}. config.kind is one of: ${LAUNCHED_TRIGGER_KINDS.join(", ")}.`,
	"Every filter field is a scope object: {mode:'any'} matches everything, {mode:'list', ids:[...]} matches those ids, {mode:'me'} resolves to the automation owner's account at that provider. An empty ids list matches nothing and is rejected on save.",
	"Resolve ids with automations_trigger_options before writing a list scope — ids are provider ids (Slack channel ids, Linear team uuids, numeric Sentry project ids), never names.",
	"Examples:",
	'schedule: {"config":{"kind":"schedule","rrule":"FREQ=DAILY;BYHOUR=9;BYMINUTE=0","dtstart":"2026-01-01T09:00:00Z","timezone":"America/New_York"}}',
	'slack: {"config":{"kind":"slack","event":"reaction_added","channels":{"mode":"list","ids":["C123"]},"emoji":{"mode":"list","ids":["bug"]},"actor":{"mode":"any"}}}',
	'github: {"config":{"kind":"github","event":"pull_request.opened","repositories":{"mode":"list","ids":["owner/repo"]},"branches":{"mode":"any"},"labels":{"mode":"any"},"actor":{"mode":"any"}}}',
	'linear: {"config":{"kind":"linear","event":"issue.assigned","teams":{"mode":"list","ids":["<team-uuid>"]},"projects":{"mode":"any"},"labels":{"mode":"any"},"toStatus":{"mode":"any"},"assignee":{"mode":"me"}}}',
].join(" ");

export const triggersInput = z
	.array(draftTriggerSchema)
	.max(25)
	.optional()
	.describe(SHAPE_HELP);
