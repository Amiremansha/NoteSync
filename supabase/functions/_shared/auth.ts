import type { User } from "npm:@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from "./supabase.ts";

const validateJwt = async (token: string): Promise<User | null> => {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json() as User;
  } catch {
    return null;
  }
};

const extractUserToken = (req: Request) => {
  // Prefer the custom header so we can keep Authorization for anon key to satisfy edge gateway.
  const rawHeader =
    req.headers.get("X-Authorization") ||
    req.headers.get("x-authorization") ||
    req.headers.get("Authorization") ||
    "";

  const token = rawHeader.replace(/^Bearer\s+/i, "").trim();

  // Avoid treating the anon/service role keys as a user token. Those are public and meant for gateway access.
  if (!token || token === SUPABASE_ANON_KEY || token === SUPABASE_SERVICE_ROLE_KEY) {
    return "";
  }

  return token;
};

export const getAuthorizedUser = async (req: Request, allowAnon = false) => {
  const token = extractUserToken(req);

  if (!token) {
    if (allowAnon) return null;
    throw new Error("Missing Authorization header.");
  }

  const user = await validateJwt(token);
  if (!user) {
    if (allowAnon) return null;
    throw new Error("Unauthorized.");
  }

  return user;
};
