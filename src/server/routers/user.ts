import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";

export const userRouter = createTRPCRouter({
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),

  getSecretMessage: protectedProcedure.query(() => {
    return "You can see this secret message!";
  }),
});
