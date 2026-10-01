import { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  Send,
  HelpCircle,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Ban,
  Search,
  BellOff,
} from "lucide-react";

const SUGGESTED_QUESTIONS = [
  "Why is this page risky?",
  "Is this page safe?",
  "What should I do?",
  "Explain the domain risk",
  "Which threat categories are involved?",
  "Show the recommended actions",
];

function renderAnalysisSummary(analysis, isExpanded, onToggle, onAction) {
  if (!analysis) return null;

  const evidenceEntries = [
    analysis.evidenceSummary || "Privacy-safe review of the current page risk signals.",
    ...(analysis.categories ?? []).map((category) => `Threat cluster: ${category}`),
    ...(analysis.recommendedActions ?? []).map((action) => `Recommended: ${action}`),
  ];

  return (
    <div className="assistant-analysis-card">
      <div className="assistant-thread-header">
        <div className="agent-status">
          <span className="agent-status-indicator agent-status-live">
            <span className="agent-status-dot" aria-hidden="true" />
            AI Analyst
          </span>
          <span className="agent-status-subtext">
            {analysis.privacySafe ? "Privacy-safe" : "Live review"}
          </span>
        </div>
      </div>

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

      <div className="assistant-action-row">
        <button type="button" className="assistant-action-btn assistant-action-block" onClick={() => onAction("Block page")}>
          <Ban size={14} aria-hidden="true" />
          Block page
        </button>
        <button type="button" className="assistant-action-btn assistant-action-review" onClick={() => onAction("Review extensions")}>
          <Search size={14} aria-hidden="true" />
          Review extensions
        </button>
        <button type="button" className="assistant-action-btn assistant-action-ignore" onClick={() => onAction("Ignore risk")}>
          <BellOff size={14} aria-hidden="true" />
          Ignore risk
        </button>
      </div>

      <div className={`evidence-collapsible ${isExpanded ? "open" : ""}`}>
        <button type="button" className="evidence-collapsible-toggle" onClick={onToggle} aria-expanded={isExpanded}>
          <span className="evidence-collapsible-title">Evidence review</span>
          {isExpanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        </button>
        <div className="evidence-collapsible-body">
          <ul>
            {evidenceEntries.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
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
  const [expandedEvidence, setExpandedEvidence] = useState({});
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleActionClick = (actionLabel) => {
    setStatus(`Action queued: ${actionLabel}. Security review is ready to escalate.`);
  };

  const toggleEvidence = (index) => {
    setExpandedEvidence((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

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
        setStatus("AI analyst answered locally from the current scan because the optional assistant service is unavailable.");
      } else if (analysis) {
        setStatus("AI analyst generated a privacy-safe risk summary from the current page evidence.");
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
            <div className="agent-status agent-status-empty">
              <span className="agent-status-indicator agent-status-live">
                <span className="agent-status-dot" aria-hidden="true" />
                AI Analyst
              </span>
              <span className="agent-status-subtext">Ready</span>
            </div>
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
                  {message.role === "assistant" ? (
                    <>
                      <div className="chatbot-message-meta">
                        <span className="agent-status-indicator agent-status-live">
                          <span className="agent-status-dot" aria-hidden="true" />
                          Security analyst
                        </span>
                        <span className="agent-status-subtext">{message.analysis?.privacySafe ? "Privacy-safe" : "Reviewing"}</span>
                      </div>
                      <div className="chatbot-message-content">{message.content}</div>
                      {renderAnalysisSummary(message.analysis, !!expandedEvidence[index], () => toggleEvidence(index), handleActionClick)}
                    </>
                  ) : (
                    <div className="chatbot-message-content">{message.content}</div>
                  )}
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
