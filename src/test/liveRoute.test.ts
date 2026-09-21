// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/live/session/route";

beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = (body: unknown, origin = "https://coach.example") => new NextRequest("https://coach.example/api/live/session", {
  method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
});

it("creates a Live session with server-owned model and prompt, no stored recording", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ session: { id: "live_123" }, transport: { sdp: "answer" } })));
  const response = await POST(request({ sdp: "offer", scenario: "meeting", model: "untrusted-model" }));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ session: { id: "live_123" }, transport: { type: "webrtc", sdp: "answer" } });
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
  expect(body.session.model).toBe("gpt-live-1"); expect(body.session.store).toBe(false);
  expect(body.session.instructions).toContain("work meetings");
  expect(body.session.client.data_channel.allowed_client_events).toEqual(["session.close"]);
});
it("rejects invalid scenarios and cross-origin requests before contacting OpenAI", async () => {
  expect((await POST(request({ sdp: "offer", scenario: "__proto__" }))).status).toBe(400);
  expect((await POST(request({ sdp: "offer", scenario: "meeting" }, "https://other.example"))).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it("reports access errors without exposing upstream secrets", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("sensitive upstream detail", { status: 403 }));
  const response = await POST(request({ sdp: "offer", scenario: "meeting" }));
  const body = await response.json();
  expect(body.error).toContain("GPT-Live-1 access"); expect(body.error).not.toContain("sensitive");
});
