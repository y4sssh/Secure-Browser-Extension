import { prepareAssistantEvidence } from "./assistantEvidence.js";
import { getConsentSettings } from "./consent.js";

export const BACKEND_API_BASE = "http://127.0.0.1:8000";

export async function fetchChatExplain(question, evidence = {}) {
  const { cloudAi: cloudAiEnabled } = await getConsentSettings();
  if (!cloudAiEnabled) {
    throw new Error("Cloud AI analysis requires explicit consent.");
  }

  // Keep the network boundary safe even if a future caller bypasses the
  // dashboard assistant wrapper.
  const sanitizedEvidence = prepareAssistantEvidence(evidence);
  const response = await fetch(`${BACKEND_API_BASE}/api/v1/chat/explain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question: String(question ?? "").slice(0, 256), evidence: sanitizedEvidence }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || "Chat backend error");
  }

  return response.json();
}
