import { z } from "zod";

/**
 * Validation lives in ONE place and is used on BOTH sides.
 *
 * Client-side validation is a convenience for the user -- it makes the form
 * feel responsive. It is NOT security: anyone can POST straight to the server
 * action and skip the form entirely. So the server re-validates with the same
 * schema, every time. Never trust input because a form already checked it.
 */

const email = z
  .email("Enter a valid email address")
  // Postgres compares text case-sensitively, so "Aditya@x.com" and
  // "aditya@x.com" would become two accounts. Normalising here means the
  // @unique index actually does what we want.
  .transform((value) => value.trim().toLowerCase());

const password = z
  .string()
  .min(8, "Use at least 8 characters")
  // bcrypt silently truncates input at 72 BYTES. Without this cap, two
  // different long passwords could hash identically -- so reject rather than
  // quietly accept a password whose tail is ignored.
  .max(72, "Use no more than 72 characters");

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80, "Name is too long"),
  email,
  password,
});

export const signInSchema = z.object({
  email,
  // Deliberately NOT the strict `password` rule. Sign-in must accept whatever
  // the user types and simply fail to match; applying signup rules here would
  // leak which passwords could possibly exist, and would lock out any account
  // created before the rules changed.
  password: z.string().min(1, "Enter your password"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
