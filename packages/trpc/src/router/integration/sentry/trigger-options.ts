import { orgConnection } from "../../../lib/connectors";
import type { TriggerOptionSource } from "../trigger-options";
import { fetchSentryProjects, getSentryAccessToken, SENTRY_URL } from "./utils";

/**
 * The numeric project id is what the matcher compares against — a slug would
 * stop matching the moment someone renames the project. The slug is the label.
 */
const projects: TriggerOptionSource = async ({ organizationId }) => {
	const connection = await orgConnection(organizationId, "sentry");
	if (!connection) return [];

	const token = await getSentryAccessToken(connection.id);
	if (token.disconnected) return [];

	const state =
		connection.state?.provider === "sentry" ? connection.state : null;
	const list = await fetchSentryProjects(
		state?.regionUrl ?? SENTRY_URL,
		connection.externalAccountId,
		token.accessToken,
	);
	return list.map((project) => ({ id: project.id, label: project.slug }));
};

export const sentryTriggerOptions = { projects };
