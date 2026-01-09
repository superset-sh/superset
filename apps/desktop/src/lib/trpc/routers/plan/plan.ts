import { mergeRouters } from "../..";
import { createPlanCrudProcedures } from "./procedures/crud";
import { createExecutionProcedures } from "./procedures/execution";
import { createPlanTaskProcedures } from "./procedures/tasks";

/**
 * Plan router - manages plan lifecycle and task orchestration.
 *
 * Procedures are organized into logical groups:
 * - crud: create, get, getAll, getByProject, update, delete
 * - tasks: createTask, updateTask, moveTask, deleteTask, getTasksByPlan
 * - execution: start, stop, pause, resume, getStatus, subscribeProgress
 */
export const createPlanRouter = () => {
	return mergeRouters(
		createPlanCrudProcedures(),
		createPlanTaskProcedures(),
		createExecutionProcedures(),
	);
};

export type PlanRouter = ReturnType<typeof createPlanRouter>;
