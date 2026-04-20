import { supabase } from "../supabaseClient";

const getValidAccessToken = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isExpired =
    !session?.expires_at || session.expires_at * 1000 <= Date.now() + 60_000; // refresh if expiring within 60s

  if (session?.access_token && !isExpired) {
    return session.access_token;
  }

  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    throw new Error("Session expired. Please log in again.");
  }

  const refreshed = data.session?.access_token;
  if (!refreshed) {
    throw new Error("Session expired. Please log in again.");
  }

  return refreshed;
};

export const invokeSupabaseFunction = async (name, body = {}, options = {}, _retried = false) => {
  let token = "";

  try {
    token = await getValidAccessToken();
  } catch (e) {
    throw e instanceof Error ? e : new Error("Session expired. Please log in again.");
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: options.method ?? "POST",
    headers: {
      // Send anon key for the gateway and the user JWT in X-Authorization for manual validation inside the function.
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "X-Authorization": `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.method === "GET" ? undefined : JSON.stringify(body),
  });

  const parseJson = async () => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const payload = await parseJson();

  if (!response.ok) {
    if (response.status === 401) {
      if (!_retried) {
        // Force refresh once and retry.
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session?.access_token) {
          return invokeSupabaseFunction(name, body, options, true);
        }
      }
      // Still unauthorized: surface an auth error but leave session intact.
      throw new Error("Authentication required. Please sign in again.");
    }

    const message =
      payload?.error || payload?.message || payload?.details || `Function ${name} failed (${response.status}).`;
    throw new Error(message);
  }

  return payload;
};
