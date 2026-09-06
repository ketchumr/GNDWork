import { QueryCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not signed in");
  return userId;
}

export async function requireProfile(ctx: QueryCtx | MutationCtx) {
  const userId = await requireUser(ctx);
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!profile) throw new Error("No profile for user");
  return { userId, profile };
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const { userId, profile } = await requireProfile(ctx);
  if (profile.role !== "admin") throw new Error("Admins only");
  return { userId, profile };
}

// admin OR manager — can see cost, manage inventory/settings, delete orders
export async function requireManagerPlus(ctx: QueryCtx | MutationCtx) {
  const { userId, profile } = await requireProfile(ctx);
  if (profile.role !== "admin" && profile.role !== "manager") {
    throw new Error("Managers or admins only");
  }
  return { userId, profile };
}
