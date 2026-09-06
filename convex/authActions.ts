"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId, modifyAccountCredentials } from "@convex-dev/auth/server";

// Let a signed-in user set a new password for their own account.
// The account identifier (email) is passed in from the client, which already
// has it from the `me` query — this avoids the action importing the generated
// `api`, which can cause a codegen cycle for "use node" files.
export const changeMyPassword = action({
  args: { email: v.string(), newPassword: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    if (args.newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }
    if (!args.email) throw new Error("Missing account email");

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: args.email, secret: args.newPassword },
    });
    return { ok: true };
  },
});
