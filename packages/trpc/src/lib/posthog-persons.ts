import { env } from "../env";
import { fetchWithTimeout } from "./growth/fetch";

// PostHog answers 202 with `persons_found: 0` for a distinct id that has no
// person, so deleting an already-deleted person succeeds. The person goes
// immediately; their events are queued for PostHog's async deletion job.
export async function deletePostHogPerson(distinctId: string): Promise<void> {
	const response = await fetchWithTimeout(
		`${env.POSTHOG_API_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/persons/bulk_delete/`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.POSTHOG_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				distinct_ids: [distinctId],
				delete_events: true,
			}),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`PostHog person deletion error: ${response.status} - ${errorText}`,
		);
	}

	const data = (await response.json()) as {
		deletion_errors?: Array<{ person_uuid: string }>;
	};
	if (data.deletion_errors?.length) {
		throw new Error(
			`PostHog could not delete person ${data.deletion_errors
				.map((error) => error.person_uuid)
				.join(", ")}`,
		);
	}
}
