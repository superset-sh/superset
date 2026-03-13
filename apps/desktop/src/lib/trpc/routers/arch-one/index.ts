import { router } from "../..";
import { createDailyBriefingRouter } from "./daily-briefing";
import { createEnvSyncRouter } from "./env-sync";
import { createGitStatusRouter } from "./git-status";
import { createGreptileRouter } from "./greptile";
import { createSeedUsersRouter } from "./seed-users";
import { createServiceHealthRouter } from "./service-health";
import { createSlotManagerRouter } from "./slot-manager";
import { createTestResultsRouter } from "./test-results";

export const createArchOneRouter = () => {
	const gitStatusRouter = createGitStatusRouter();
	const serviceHealthRouter = createServiceHealthRouter();
	const testResultsRouter = createTestResultsRouter();
	const envSyncRouter = createEnvSyncRouter();
	const greptileRouter = createGreptileRouter();
	const seedUsersRouter = createSeedUsersRouter();
	const dailyBriefingRouter = createDailyBriefingRouter();
	const slotManagerRouter = createSlotManagerRouter();

	return router({
		...gitStatusRouter._def.procedures,
		...serviceHealthRouter._def.procedures,
		...testResultsRouter._def.procedures,
		...envSyncRouter._def.procedures,
		...greptileRouter._def.procedures,
		...seedUsersRouter._def.procedures,
		...dailyBriefingRouter._def.procedures,
		...slotManagerRouter._def.procedures,
	});
};
