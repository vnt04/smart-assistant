import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(12, "Mật khẩu phải có ít nhất 12 ký tự")
  .max(128, "Mật khẩu tối đa 128 ký tự");

export const emailSchema = z
  .string()
  .email("Email không hợp lệ")
  .max(254);

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(100),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const refreshInputSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshInputSchema>;

export const logoutInputSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutInput = z.infer<typeof logoutInputSchema>;
