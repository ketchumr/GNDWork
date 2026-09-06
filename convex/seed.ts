import { mutation } from "./_generated/server";
import { requireManagerPlus } from "./lib";

// One-time sample data loader. Safe to call repeatedly — it no-ops if any
// customers already exist. Run it from the app's Settings (manager+) or from
// the Convex dashboard. Requires at least one signed-in manager/admin.
export const sample = mutation({
  args: {},
  handler: async (ctx) => {
    await requireManagerPlus(ctx);

    const existing = await ctx.db.query("customers").first();
    if (existing) return { skipped: true, reason: "Data already present" };

    // Settings
    const s = await ctx.db.query("shopSettings").first();
    if (!s) await ctx.db.insert("shopSettings", { laborRate: 75, taxRate: 0.0725 });

    // Customers
    const ray = await ctx.db.insert("customers", {
      name: "Ray Harmon", phone: "910-555-0142", email: "ray@example.com", address: "123 Pine Rd, Jacksonville NC",
    });
    const dana = await ctx.db.insert("customers", {
      name: "Dana Fowler", phone: "910-555-0198", email: "dana@example.com", address: "77 Oak Ave, Sneads Ferry NC",
    });

    // Inventory
    const spark = await ctx.db.insert("inventory", { partNumber: "SP-001", description: "Champion Spark Plug RJ19LM", qty: 24, cost: 2.49, price: 5.99, location: "A1" });
    const air = await ctx.db.insert("inventory", { partNumber: "AF-010", description: "Briggs Air Filter 491588S", qty: 12, cost: 4.10, price: 9.99, location: "A2" });
    const oil = await ctx.db.insert("inventory", { partNumber: "OL-002", description: "SAE 30 Motor Oil Qt", qty: 30, cost: 3.20, price: 7.49, location: "B1" });
    const carb = await ctx.db.insert("inventory", { partNumber: "CB-005", description: "Carburetor Kit Universal", qty: 8, cost: 8.75, price: 22.99, location: "B3" });
    await ctx.db.insert("inventory", { partNumber: "BL-003", description: 'Mower Blade 21" Hi-Lift', qty: 15, cost: 6.50, price: 16.99, location: "C1" });
    await ctx.db.insert("inventory", { partNumber: "FT-007", description: "Fuel Filter Inline", qty: 20, cost: 1.80, price: 4.99, location: "A3" });

    // Work orders (tax locked at 7.25%)
    await ctx.db.insert("workOrders", {
      number: "WO-0001", tagNumber: "T-114", customerId: ray, status: "Completed",
      equipment: "Husqvarna YTH24V48", year: "2019", serial: "HX12345",
      problem: "Won't start, oil change overdue",
      laborItems: [{ desc: "Diagnostic & Tune-up", hours: 1.5, rate: 75 }],
      partItems: [
        { partId: spark, qty: 1, price: 5.99 },
        { partId: air, qty: 1, price: 9.99 },
        { partId: oil, qty: 1, price: 7.49 },
      ],
      notes: "Replaced spark plug, air filter, oil. Running great.",
      technician: "Mike", taxRate: 0.0725, createdAt: "2024-06-01",
    });
    await ctx.db.insert("workOrders", {
      number: "WO-0002", tagNumber: "T-115", customerId: dana, status: "In Progress",
      equipment: "Echo CS-400 Chainsaw", year: "2020", serial: "EC99001",
      problem: "Chain brake sticking, carb cleaning needed",
      laborItems: [{ desc: "Carb Clean & Rebuild", hours: 2, rate: 75 }],
      partItems: [{ partId: carb, qty: 1, price: 22.99 }],
      notes: "", technician: "Mike", taxRate: 0.0725, createdAt: "2024-06-04",
    });

    return { skipped: false };
  },
});
