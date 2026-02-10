import { router } from "../..";
import { createOperationsRouter } from "./operations";
import { createSearchRouter } from "./search";
import { createSubscriptionRouter } from "./subscription";

export const createFilesystemRouter = () => {
	const operationsRouter = createOperationsRouter();
	const searchRouter = createSearchRouter();
	const subscriptionRouter = createSubscriptionRouter();

	return router({
		...operationsRouter._def.procedures,
		...searchRouter._def.procedures,
		...subscriptionRouter._def.procedures,
	});
};
