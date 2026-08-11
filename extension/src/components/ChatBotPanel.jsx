import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";

export function ChatBotPanel({ latestEvidence, onAsk }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [status, setStatus] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!question.trim() || typeof onAsk !== "function") {
      return;
    }

    setStatus("Sending question...");
    setAnswer(null);
    try {
      const response = await onAsk(question.trim(), latestEvidence);
      setAnswer(response.answer ?? "No answer returned.");
      setStatus("");
    } catch (err) {
      setStatus(err?.message ?? "Chatbot request failed");
    }
  };

  return (
    <section className="chatbot-panel">
      <div className="section-header">
        <MessageCircle size={18} aria-hidden="true" />
        <h3>Ask the security assistant</h3>
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
          rows={3}
        />
        <button className="button-primary" type="submit">
          <Send size={16} aria-hidden="true" /> Ask
        </button>
      </form>
      {status ? <p className="status-line">{status}</p> : null}
      {answer ? <div className="chatbot-answer">{answer}</div> : null}
    </section>
  );
}
