import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, requireManagerPlus } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("inventory").withIndex("by_part").collect();
  },
});

// Add/edit parts: managers & admins only.
export const create = mutation({
  args: {
    partNumber: v.string(),
    description: v.string(),
    qty: v.number(),
    cost: v.number(),
    price: v.number(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireManagerPlus(ctx);
    if (!args.partNumber.trim()) throw new Error("Part number is required");
    return await ctx.db.insert("inventory", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("inventory"),
    partNumber: v.string(),
    description: v.string(),
    qty: v.number(),
    cost: v.number(),
    price: v.number(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireManagerPlus(ctx);
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
  },
});

export const remove = mutation({
  args: { id: v.id("inventory") },
  handler: async (ctx, args) => {
    await requireManagerPlus(ctx);
    await ctx.db.delete(args.id);
  },
});

// Quantity adjustment is allowed for ALL signed-in staff (techs included).
export const adjustQty = mutation({
  args: { id: v.id("inventory"), delta: v.number() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const part = await ctx.db.get(args.id);
    if (!part) throw new Error("Part not found");
    await ctx.db.patch(args.id, { qty: Math.max(0, part.qty + args.delta) });
  },
});
