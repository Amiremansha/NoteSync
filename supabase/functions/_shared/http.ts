import { corsHeaders } from "./cors.ts";

export const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

export const redirect = (location: string, status = 302) =>
  new Response(null, {
    status,
    headers: {
      ...corsHeaders,
      Location: location,
    },
  });
