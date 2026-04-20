export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-authorization, x-client-info, apikey, content-type",
  // Explicitly allow the verbs our Edge functions use so CORS preflight
  // succeeds for calls like DELETE (disconnect Google Calendar).
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
