export function requireOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured. Add it to .env.local locally and to Vercel Environment Variables for deployment.");
  return key;
}
