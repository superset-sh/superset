import { IOS_APP } from "@superset/shared/constants";

export const dynamic = "force-static";

export function GET(): Response {
	return Response.json({
		applinks: {
			details: [
				{
					appIDs: [IOS_APP.APP_ID],
					components: [{ "/": "/page/*" }],
				},
			],
		},
	});
}
