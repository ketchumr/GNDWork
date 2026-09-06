import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("customers").withIndex("by_name").collect();
  },
});

export const create = mutation({
  args: { name: v.string(), phone: v.optional(v.string()), email: v.optional(v.string()), address: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (!args.name.trim()) throw new Error("Name is required");
    return await ctx.db.insert("customers", args);
  },
});

export const update = mutation({
  args: { id: v.id("customers"), name: v.string(), phone: v.optional(v.string()), email: v.optional(v.string()), address: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { id, ...rest } = args;
    if (!rest.name.trim()) throw new Error("Name is required");
    await ctx.db.patch(id, rest);
  },
});

export const remove = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await ctx.db.delete(args.id);
  },
});
