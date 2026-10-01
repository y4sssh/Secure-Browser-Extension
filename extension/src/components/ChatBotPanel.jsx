import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, HelpCircle } from "lucide-react";

const SUGGESTED_QUESTIONS = [
  "Why is this page risky?",
  "Is this page safe?",
  "What should I do?",
  "Explain the domain risk",
  "Which threat categories are involved?",
  "Show the recommended actions",
];

function renderAnalysisSummary(analysis) {
  if (!analysis) return null;

  return (
    <div className="assistant-analysis-card">
      <div className="assistant-analysis-header">
        <span className={`assistant-pill assistant-pill-${String(analysis.riskLevel || "monitoring").toLowerCase()}`}>
          Risk level: {analysis.riskLevel || "Monitoring"}
        </span>
        <span className="assistant-confidence">Confidence {analysis.confidence ?? 0}%</span>
      </div>

      <div className="assistant-analysis-grid">
        <div className="assistant-analysis-block">
          <h4>Threat categories</h4>
          <ul>
            {(analysis.categories ?? []).map((category) => (
              <li key={category}>{category}</li>
            ))}
          </ul>
        </div>

        <div className="assistant-analysis-block">
          <h4>Recommended actions</h4>
          <ul>
            {(analysis.recommendedActions ?? []).map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="assistant-privacy-summary">
        {analysis.privacySafe ? "Privacy-safe analysis • sensitive values are redacted." : "Risk summary generated from current evidence."}
      </div>
    </div>
  );
}

export function ChatBotPanel({ latestEvidence, onAsk }) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const askQuestion = async (rawQuestion) => {
    const trimmed = String(rawQuestion ?? "").trim();
    if (!trimmed || typeof onAsk !== "function" || isSubmitting) {
      return;
    }

    const userMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    setIsSubmitting(true);
    setStatus("");

    try {
      const response = await onAsk(trimmed, latestEvidence);
      const answer = response?.answer ?? "No answer returned.";
      const analysis = response?.analysis ?? null;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: answer,
          analysis,
        },
      ]);
      if (response?.source === "local") {
        setStatus("Answered locally from the current scan because the optional assistant service is unavailable.");
      } else if (analysis) {
        setStatus("Risk analysis generated from current page evidence and privacy-safe findings.");
      }
    } catch (err) {
      const errorMessage = err?.message ?? "Chatbot request failed";
      setStatus(errorMessage);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMessage}` },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    void askQuestion(question);
  };

  const handleSuggestion = (suggestion) => {
    if (isSubmitting) return;
    // A suggested question is an action, not merely a text shortcut. This
    // makes the assistant useful with one click.
    void askQuestion(suggestion);
  };

  return (
    <section className="chatbot-panel">
      <div className="section-header">
        <MessageCircle size={18} aria-hidden="true" />
        <h3>Ask the security assistant</h3>
      </div>

      <div className="chatbot-messages">
        {messages.length === 0 ? (
          <div className="chatbot-empty">
            <HelpCircle size={32} aria-hidden="true" />
            <p>
              Ask a question about this page&apos;s risk. For example:
            </p>
            <div className="chatbot-suggestions">
              {SUGGESTED_QUESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chatbot-suggestion"
                  onClick={() => handleSuggestion(suggestion)}
                  disabled={isSubmitting}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chatbot-transcript">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`chatbot-message chatbot-message-${message.role}`}
              >
                <div className="chatbot-message-bubble">
                  {message.content}
                  {message.role === "assistant" && renderAnalysisSummary(message.analysis)}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form className="chatbot-form" onSubmit={handleSubmit}>
        <label htmlFor="chat-question" className="sr-only">
          Ask a question
        </label>
        <textarea
          id="chat-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Why does this page look risky?"
          rows={2}
          disabled={isSubmitting}
        />
        <button
          className="button-primary"
          type="submit"
          disabled={isSubmitting || !question.trim()}
        >
          <Send size={16} aria-hidden="true" />
          {isSubmitting ? "Asking..." : "Ask"}
        </button>
      </form>

      {status ? <p className="status-line">{status}</p> : null}
    </section>
  );
}

export default ChatBotPanel;
