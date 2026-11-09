export class AdminUserError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export const ADMIN_USER_ERRORS = {
  forbidden: () => new AdminUserError("ADMIN_USER_FORBIDDEN", "You cannot manage this user", 403),
  roleForbidden: () => new AdminUserError("ROLE_CHANGE_FORBIDDEN", "Only a super admin can change roles", 403),
  selfRole: () => new AdminUserError("SELF_ROLE_CHANGE_FORBIDDEN", "You cannot change your own role", 403),
  selfLifecycle: () => new AdminUserError("SELF_LIFECYCLE_CHANGE_FORBIDDEN", "You cannot change your own account status", 403),
  lastSuperAdmin: () => new AdminUserError("LAST_SUPER_ADMIN_PROTECTED", "The last active super admin cannot be disabled or demoted", 409),
  notFound: () => new AdminUserError("ADMIN_USER_NOT_FOUND", "User not found", 404),
  conflict: (message: string) => new AdminUserError("ADMIN_USER_STATE_CONFLICT", message, 409),
  provider: () => new AdminUserError("AUTH_PROVIDER_UNAVAILABLE", "Authentication provider is unavailable", 503),
} as const;
