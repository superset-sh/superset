import { publicProcedure, router } from "../../../core/trpc";
import { z } from "zod";

export const helloWorldRouter = router({
  hello: publicProcedure.query(() => {
    return { message: "Hello from tRPC!" };
  }),

  greet: publicProcedure.input(z.object({ name: z.string() })).query(({ input }) => {
    return { message: `Hello, ${input.name}!` };
  }),
});
