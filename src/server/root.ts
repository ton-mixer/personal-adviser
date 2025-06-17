import { createTRPCRouter } from "./trpc";
import { userRouter } from "./routers/user";
import { statementRouter } from "./routers/statement";

export const appRouter = createTRPCRouter({
  user: userRouter,
  statement: statementRouter,
});

export type AppRouter = typeof appRouter;
