import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80, "Name is too long"),
});

export const changePasswordSchema = z
  .object({
    /**
     * Required even though the user is already signed in.
     *
     * A session can be an unlocked laptop or a stolen cookie. Without this, an
     * attacker with a session could change the password and lock the real owner
     * out permanently -- turning temporary access into permanent takeover.
     */
    currentPassword: z.string().min(1, "Enter your current password"),
    // Same 72-byte bcrypt ceiling as signup; see validations/auth.ts.
    newPassword: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(72, "Use no more than 72 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Those passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "The new password must be different",
    path: ["newPassword"],
  });

export const renameWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Enter a workspace name").max(80, "Name is too long"),
});
