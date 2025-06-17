import { createTRPCRouter } from "@/server/trpc";
import { statementRouter } from "./statement";
import { bankAccountRouter } from "./bank-account";

export const appRouter = createTRPCRouter({
  statement: statementRouter,
  bankAccount: bankAccountRouter,
});

export type AppRouter = typeof appRouter; 