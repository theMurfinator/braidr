import { useState } from 'react';

interface FeedbackModalProps {
  onClose: () => void;
  onSubmit: (category: string, message: string) => void;
}

const CATEGORIES = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'general', label: 'General Feedback' },
];

export default function FeedbackModal({ onClose, onSubmit }: FeedbackModalProps) {
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');

  const canSubmit = message.trim().length > 0;

  return (
    <div className="feedback-overlay" onClick={onClose}>
      <div className="feedback-modal" onClick={e => e.stopPropagation()}>
        <div className="feedback-header">
          <h3 className="feedback-title">Send Feedback</h3>
          <p className="feedback-subtitle">This will open your email client with the message below.</p>
        </div>

        <div className="feedback-body">
          <div className="feedback-categories">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                className={`feedback-cat-btn ${category === cat.value ? 'selected' : ''}`}
                onClick={() => setCategory(cat.value)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <textarea
            className="feedback-textarea"
            placeholder="Tell us what's on your mind..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={5}
            autoFocus
          />
        </div>

        <div className="feedback-actions">
          <button className="feedback-cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className="feedback-send-btn"
            disabled={!canSubmit}
            onClick={() => onSubmit(category, message.trim())}
          >
            Open in Mail
          </button>
        </div>
      </div>
    </div>
  );
}
