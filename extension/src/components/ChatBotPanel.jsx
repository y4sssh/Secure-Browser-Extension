import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, HelpCircle } from "lucide-react";

const SUGGESTED_QUESTIONS = [
  "Why is this page risky?",
  "Is this page safe?",
  "What should I do?",
  "Explain the domain risk",
];

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = question.trim();
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
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
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

  const handleSuggestion = (suggestion) => {
    if (isSubmitting) return;
    setQuestion(suggestion);
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
