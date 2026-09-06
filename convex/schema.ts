import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  profiles: defineTable({
    userId: v.id("users"),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("manager"), v.literal("technician")),
  }).index("by_user", ["userId"]),

  // Single shared shop-wide settings row.
  shopSettings: defineTable({
    laborRate: v.number(),
    taxRate: v.number(), // fraction, e.g. 0.0725
  }),

  customers: defineTable({
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
  }).index("by_name", ["name"]),

  inventory: defineTable({
    partNumber: v.string(),
    description: v.string(),
    qty: v.number(),
    cost: v.number(),
    price: v.number(),
    location: v.optional(v.string()),
  }).index("by_part", ["partNumber"]),

  workOrders: defineTable({
    number: v.string(),
    tagNumber: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    status: v.union(
      v.literal("Pending"),
      v.literal("In Progress"),
      v.literal("Awaiting Parts"),
      v.literal("Completed"),
      v.literal("Invoice Paid"),
    ),
    equipment: v.optional(v.string()),
    year: v.optional(v.string()),
    serial: v.optional(v.string()),
    problem: v.optional(v.string()),
    // labor lines: [{ desc, hours, rate }]
    laborItems: v.array(
      v.object({ desc: v.string(), hours: v.number(), rate: v.number() }),
    ),
    // part lines: [{ partId, qty, price }]
    partItems: v.array(
      v.object({ partId: v.id("inventory"), qty: v.number(), price: v.number() }),
    ),
    notes: v.optional(v.string()),
    technician: v.optional(v.string()),
    // discount applied to the subtotal before tax
    discountType: v.optional(v.union(v.literal("none"), v.literal("amount"), v.literal("percent"))),
    discountValue: v.optional(v.number()),
    // tax rate locked at creation time so changing the shop rate later
    // does not alter past orders or their invoices.
    taxRate: v.number(),
    createdAt: v.string(), // "YYYY-MM-DD"
  }).index("by_number", ["number"]),
});
