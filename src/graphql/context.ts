import { authenticateAccessToken } from "../modules/auth/auth.identity";

export type GraphQLContext = {
  accessToken?: string;
  user?: {
    id: string;
    email?: string | null;
    role?: string | null;
  };
};

export const getContextFromAuthHeader = async (
  authorizationHeader: string | undefined
): Promise<GraphQLContext> => {
  if (!authorizationHeader) return {};

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1]?.trim();
  if (!accessToken) return {};

  const { user, profile } = await authenticateAccessToken(accessToken);

  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      role: profile.role,
    },
  };
};
