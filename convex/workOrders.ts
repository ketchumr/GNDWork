import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, requireManagerPlus } from "./lib";

const statusV = v.union(
  v.literal("Pending"),
  v.literal("In Progress"),
  v.literal("Awaiting Parts"),
  v.literal("Completed"),
  v.literal("Invoice Paid"),
);
const laborV = v.array(v.object({ desc: v.string(), hours: v.number(), rate: v.number() }));
const partsV = v.array(v.object({ partId: v.id("inventory"), qty: v.number(), price: v.number() }));

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("workOrders").collect();
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },
});

// Create a new work order. Snapshots the current shop tax rate onto the order
// (locking it), and deducts the used parts from inventory.
export const create = mutation({
  args: {
    number: v.string(),
    tagNumber: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    status: statusV,
    equipment: v.optional(v.string()),
    year: v.optional(v.string()),
    serial: v.optional(v.string()),
    problem: v.optional(v.string()),
    laborItems: laborV,
    partItems: partsV,
    notes: v.optional(v.string()),
    technician: v.optional(v.string()),
    discountType: v.optional(v.union(v.literal("none"), v.literal("amount"), v.literal("percent"))),
    discountValue: v.optional(v.number()),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const settings = await ctx.db.query("shopSettings").first();
    const taxRate = settings?.taxRate ?? 0.0725;

    const id = await ctx.db.insert("workOrders", { ...args, taxRate });

    // Deduct parts from inventory.
    for (const p of args.partItems) {
      const part = await ctx.db.get(p.partId);
      if (part) await ctx.db.patch(p.partId, { qty: Math.max(0, part.qty - p.qty) });
    }
    return id;
  },
});

// Update keeps the order's existing locked taxRate (not re-stamped).
export const update = mutation({
  args: {
    id: v.id("workOrders"),
    number: v.string(),
    tagNumber: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    status: statusV,
    equipment: v.optional(v.string()),
    year: v.optional(v.string()),
    serial: v.optional(v.string()),
    problem: v.optional(v.string()),
    laborItems: laborV,
    partItems: partsV,
    notes: v.optional(v.string()),
    technician: v.optional(v.string()),
    discountType: v.optional(v.union(v.literal("none"), v.literal("amount"), v.literal("percent"))),
    discountValue: v.optional(v.number()),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
  },
});

// Deleting a work order is manager+/admin only.
export const remove = mutation({
  args: { id: v.id("workOrders") },
  handler: async (ctx, args) => {
    await requireManagerPlus(ctx);
    await ctx.db.delete(args.id);
  },
});
