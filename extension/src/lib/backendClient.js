export const BACKEND_API_BASE = "http://127.0.0.1:8000";

export async function fetchChatExplain(question, evidence = {}) {
  const response = await fetch(`${BACKEND_API_BASE}/api/v1/chat/explain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question, evidence }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || "Chat backend error");
  }

  return response.json();
}
