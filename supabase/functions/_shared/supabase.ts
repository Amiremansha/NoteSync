import { createClient } from "npm:@supabase/supabase-js@2";

const getRequiredEnv = (name: string, ...aliases: string[]) => {
  const allNames = [name, ...aliases];
  for (const key of allNames) {
    const value = Deno.env.get(key);
    if (value) return value;
  }

  // If none of the provided names are set, throw using the primary name for clarity.
  throw new Error(`Missing ${allNames.join(" / ")} secret.`);
};

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || getRequiredEnv("SUPABASE_URL");
export const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") || getRequiredEnv("SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  getRequiredEnv("SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");

export const createUserClient = (authorization: string) =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

export const createAdminClient = () =>
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
