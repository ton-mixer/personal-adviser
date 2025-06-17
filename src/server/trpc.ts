import { initTRPC, TRPCError } from "@trpc/server";
import { getServerSession } from "next-auth";
import superjson from "superjson";
import { ZodError } from "zod";
import { PrismaClient } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";

/**
 * 1. CONTEXT
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await getServerSession(authOptions);

  return {
    prisma: new PrismaClient(),
    session,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * 3. ROUTER & PROCEDURE HELPERS
 */
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});
