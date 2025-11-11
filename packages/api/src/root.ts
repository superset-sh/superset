import { organizationRouter } from "./router/organization";
import { repositoryRouter } from "./router/repository";
import { taskRouter } from "./router/task";
import { userRouter } from "./router/user";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
	organization: organizationRouter,
	repository: repositoryRouter,
	task: taskRouter,
	user: userRouter,
});

export type AppRouter = typeof appRouter;

// Export tRPC instance for extending in other packages (e.g., Electron app)
export { createTRPCRouter } from "./trpc";
