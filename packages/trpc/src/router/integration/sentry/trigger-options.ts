import type { SentryConfig } from "@superset/db/schema";
import { activeConnection } from "../connections";
import type { TriggerOptionSource } from "../trigger-options";
import { fetchSentryProjects, getSentryAccessToken, SENTRY_URL } from "./utils";

/**
 * The numeric project id is what the matcher compares against — a slug would
 * stop matching the moment someone renames the project. The slug is the label.
 */
const projects: TriggerOptionSource = async ({ organizationId }) => {
	const connection = await activeConnection(organizationId, "sentry", {
		id: true,
		externalOrgId: true,
		config: true,
	});
	if (!connection?.externalOrgId) return [];

	const token = await getSentryAccessToken(connection.id);
	if (token.disconnected) return [];

	const config = connection.config as SentryConfig | null;
	const list = await fetchSentryProjects(
		config?.regionUrl ?? SENTRY_URL,
		connection.externalOrgId,
		token.accessToken,
	);
	return list.map((project) => ({ id: project.id, label: project.slug }));
};

export const sentryTriggerOptions = { projects };
