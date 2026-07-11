import { mintUserJwt } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { v2UsersHosts } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "../../env";
import { jwtProcedure } from "../../trpc";
import { relayMutation } from "../automation/relay-client";
import {
	executeHostUpdate,
	type HostUpdateDependencies,
	type HostUpdateResult,
	hostUpdateInputSchema,
} from "./update-handler";

const hostUpdateDependencies: HostUpdateDependencies = {
	relayUrl: env.RELAY_URL,
	findHostRole: async ({ organizationId, userId, machineId }) => {
		const access = await db.query.v2UsersHosts.findFirst({
			where: and(
				eq(v2UsersHosts.organizationId, organizationId),
				eq(v2UsersHosts.userId, userId),
				eq(v2UsersHosts.hostId, machineId),
			),
			columns: { role: true },
		});
		return access?.role ?? null;
	},
	mintJwt: mintUserJwt,
	dispatch: ({ relayUrl, hostId, jwt, targetVersion }) =>
		relayMutation<{ targetVersion: string }, HostUpdateResult>(
			{ relayUrl, hostId, jwt },
			"host.update.start",
			{ targetVersion },
		),
};

export const hostUpdateProcedure = jwtProcedure
	.input(hostUpdateInputSchema)
	.mutation(({ ctx, input }) =>
		executeHostUpdate(ctx, input, hostUpdateDependencies),
	);
