import { env } from "@/env";

function gone(): Response {
	return Response.json(
		{
			error: {
				code: "GONE",
				message: "The v1 MCP server has been removed.",
				hint: `Connect to ${env.NEXT_PUBLIC_API_URL}/api/v2/agent/mcp instead.`,
			},
		},
		{ status: 410 },
	);
}

export { gone as GET, gone as POST, gone as DELETE };
