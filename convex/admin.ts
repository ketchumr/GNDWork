import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib";

// Admin: delete a staff account. Removes their profile and auth records.
// Guards against deleting yourself or the last admin.
//
// Note: we query the Convex Auth tables by field with `.filter()` rather than
// by named index, so this keeps working regardless of the exact index names
// in your installed @convex-dev/auth version.
export const deleteStaff = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const { userId: callerId } = await requireAdmin(ctx);
    const target = await ctx.db.get(args.profileId);
    if (!target) throw new Error("Profile not found");
    if (target.userId === callerId) throw new Error("You can't delete your own account");

    if (target.role === "admin") {
      const admins = (await ctx.db.query("profiles").collect()).filter((p) => p.role === "admin");
      if (admins.length <= 1) throw new Error("Can't delete the last admin");
    }

    const targetUserId = target.userId;

    // Remove the profile first.
    await ctx.db.delete(args.profileId);

    // Remove Convex Auth records tied to this user.
    const accounts = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("userId"), targetUserId))
      .collect();
    for (const a of accounts) await ctx.db.delete(a._id);

    const sessions = await ctx.db
      .query("authSessions")
      .filter((q) => q.eq(q.field("userId"), targetUserId))
      .collect();
    for (const s of sessions) {
      const refresh = await ctx.db
        .query("authRefreshTokens")
        .filter((q) => q.eq(q.field("sessionId"), s._id))
        .collect();
      for (const r of refresh) await ctx.db.delete(r._id);
      await ctx.db.delete(s._id);
    }

    // Finally remove the user row itself.
    await ctx.db.delete(targetUserId);
  },
});
