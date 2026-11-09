import type { User } from "@supabase/supabase-js";
import type { public_users } from "@prisma/client";
import { AppError } from "../../utils/errors";
import { findUserProfileByUserId } from "../users/users.repository";
import { getUserByAccessToken } from "./auth.service";

export type AuthenticatedIdentity = {
  accessToken: string;
  user: User;
  profile: public_users;
};

export const requireEnabledProfile = async (userId: string) => {
  const profile = await findUserProfileByUserId(userId);

  if (!profile) {
    throw new AppError("User profile not found", 403);
  }

  if (profile.is_deleted || !profile.is_active) {
    throw new AppError("User account is disabled", 403);
  }

  return profile;
};

export const authenticateAccessToken = async (
  accessToken: string
): Promise<AuthenticatedIdentity> => {
  const user = await getUserByAccessToken(accessToken);
  const profile = await requireEnabledProfile(user.id);

  return { accessToken, user, profile };
};
