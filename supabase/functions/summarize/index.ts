import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { corsHeaders } from "../_shared/cors.ts";
import { getAuthorizedUser } from "../_shared/auth.ts";

type GroqChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const SYSTEM_PROMPT =
  "You are a helpful note-taking copilot. Use the note content as context and follow the user's instruction. Keep responses concise and directly useful. If the user gives no instruction, provide a brief, scannable summary.";

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const groqApiKey = Deno.env.get("GROQ_API_KEY");

  if (!groqApiKey) {
    return json({ error: "Missing GROQ_API_KEY secret." }, 500);
  }

  let user;
  try {
    user = await getAuthorizedUser(req);
  } catch {
    return json({ error: "Unauthorized." }, 401);
  }

  let payload: { note_content?: unknown; prompt?: unknown };

  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const noteContent =
    typeof payload.note_content === "string" ? payload.note_content.trim() : "";
  const userPrompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";

  if (!noteContent) {
    return json({ error: "note_content is required." }, 400);
  }

  const userMessage = userPrompt
    ? `Note content:\n${noteContent}\n\nInstruction from user:\n${userPrompt}`
    : `Note content:\n${noteContent}\n\nNo extra instruction provided; give a concise, scannable summary.`;

  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  if (!groqResponse.ok) {
    return json(
      {
        error: "Groq request failed.",
        details: await groqResponse.text(),
      },
      502
    );
  }

  const groqData = (await groqResponse.json()) as GroqChatCompletionResponse;
  const summary = groqData.choices?.[0]?.message?.content?.trim();

  if (!summary) {
    return json({ error: "Groq returned an empty summary." }, 502);
  }

  return json({ summary });
});
