import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireUser, requireProfile, requireAdmin, requireManagerPlus } from "./lib";

const roleV = v.union(v.literal("admin"), v.literal("manager"), v.literal("technician"));

// Ensure a profile exists after sign-in. First user becomes admin.
export const ensureProfile = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return existing._id;

    const anyProfile = await ctx.db.query("profiles").first();
    const role = anyProfile ? "technician" : "admin";
    const user = await ctx.db.get(userId);
    const name =
      args.name?.trim() ||
      (user as any)?.name ||
      (user as any)?.email?.split("@")[0] ||
      "User";

    // Seed a settings row the first time anyone signs up.
    const settings = await ctx.db.query("shopSettings").first();
    if (!settings) await ctx.db.insert("shopSettings", { laborRate: 75, taxRate: 0.0725 });

    return await ctx.db.insert("profiles", { userId, name, role });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) return null;
    const user = await ctx.db.get(userId);
    return { userId, name: profile.name, role: profile.role, email: (user as any)?.email ?? "" };
  },
});

// Used by the change-password action to find the password account identifier.
export const myEmail = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return (user as any)?.email ?? null;
  },
});

export const listStaff = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const profiles = await ctx.db.query("profiles").collect();
    const out = [];
    for (const p of profiles) {
      const user = await ctx.db.get(p.userId);
      out.push({ _id: p._id, userId: p.userId, name: p.name, role: p.role, email: (user as any)?.email ?? "" });
    }
    return out;
  },
});

export const setRole = mutation({
  args: { profileId: v.id("profiles"), role: roleV },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.profileId);
    if (!target) throw new Error("Profile not found");
    if (target.role === "admin" && args.role !== "admin") {
      const admins = (await ctx.db.query("profiles").collect()).filter((p) => p.role === "admin");
      if (admins.length <= 1) throw new Error("Can't remove the last admin");
    }
    await ctx.db.patch(args.profileId, { role: args.role });
  },
});

/* ---------- SHOP SETTINGS ---------- */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const s = await ctx.db.query("shopSettings").first();
    return s ?? { laborRate: 75, taxRate: 0.0725 };
  },
});

export const updateSettings = mutation({
  args: { laborRate: v.number(), taxRate: v.number() },
  handler: async (ctx, args) => {
    await requireManagerPlus(ctx);
    const s = await ctx.db.query("shopSettings").first();
    const clean = { laborRate: Math.max(0, args.laborRate), taxRate: Math.max(0, args.taxRate) };
    if (s) await ctx.db.patch(s._id, clean);
    else await ctx.db.insert("shopSettings", clean);
  },
});
