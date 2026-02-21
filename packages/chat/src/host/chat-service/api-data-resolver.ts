import type { DataResolver } from "./data-resolver";

export function createApiDataResolver(
	apiUrl: string,
	authToken: string,
): DataResolver {
	const headers = { Authorization: `Bearer ${authToken}` };

	return {
		async resolveCwd(sessionId: string): Promise<string> {
			try {
				const res = await fetch(`${apiUrl}/api/chat/${sessionId}`, {
					headers,
				});
				if (!res.ok) return process.env.HOME ?? "/";
				const data = (await res.json()) as { workspacePath?: string };
				return data.workspacePath ?? process.env.HOME ?? "/";
			} catch {
				return process.env.HOME ?? "/";
			}
		},

		async buildTaskMentionContext(slugs: string[]): Promise<string> {
			if (slugs.length === 0) return "";

			try {
				const results = await Promise.all(
					slugs.map(async (slug) => {
						const res = await fetch(
							`${apiUrl}/api/trpc/task.bySlug?input=${encodeURIComponent(JSON.stringify(slug))}`,
							{ headers },
						);
						if (!res.ok) return null;
						const json = (await res.json()) as {
							result?: {
								data?: {
									slug: string;
									title: string;
									statusId: string;
									description?: string;
								};
							};
						};
						return json.result?.data ?? null;
					}),
				);

				const taskList = results.filter(
					(
						t,
					): t is {
						slug: string;
						title: string;
						statusId: string;
						description?: string;
					} => t !== null,
				);
				if (taskList.length === 0) return "";

				const parts = taskList.map(
					(t) =>
						`<task slug="${t.slug}" title="${t.title}" status="${t.statusId}">${t.description ?? ""}</task>`,
				);

				return `\n\nThe user referenced the following tasks. Their details are provided below:\n\n${parts.join("\n\n")}`;
			} catch {
				return "";
			}
		},
	};
}
