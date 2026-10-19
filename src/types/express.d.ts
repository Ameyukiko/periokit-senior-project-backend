import type { User } from "@supabase/supabase-js";
import type { public_users } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        accessToken: string;
        user: User;
        profile: public_users;
      };
    }
  }
}

export {};
