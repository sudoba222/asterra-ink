'use client';
import * as React from 'react';
import './assistant.css';
import { renderMarkdown } from './renderMarkdown';
import type { ChatMessage, FieldContext, SourceTrace } from '../../lib/assistant/types';

interface UiMessage extends ChatMessage { sources?: SourceTrace[]; failed?: boolean }
export interface AssistantPanelProps {
  countryCode: string;
  countryName?: string;
  field?: FieldContext;
  endpoint?: string;
  suggestions?: string[];
}

const DEFAULT_SUGGESTIONS = [
  'What crops could I plant next?',
  'Why do you recommend that crop?',
  'What does the vegetation data say about my area?',
  'What should I do to improve my soil?',
];

export function AssistantPanel({ countryCode, countryName, field, endpoint = '/api/assistant/chat', suggestions = DEFAULT_SUGGESTIONS }: AssistantPanelProps) {
  const storageKey = `asterra-assistant:${countryCode}`;
  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    try { setMessages(JSON.parse(sessionStorage.getItem(storageKey) ?? '[]')); } catch { setMessages([]); }
    setError(null);
  }, [storageKey]);
  React.useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-40))); } catch { /* storage unavailable */ }
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, loading, storageKey]);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const send = React.useCallback(async (text: string, base: UiMessage[]) => {
    const history = [...base, { role: 'user' as const, content: text }];
    setMessages(history);
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    const ctrl = (abortRef.current = new AbortController());
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({ countryCode, field, messages: history.filter((m) => !m.failed).slice(-20).map(({ role, content }) => ({ role, content })) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? 'The assistant is unavailable right now.');
      setMessages([...history, { role: 'assistant', content: json.data.reply, sources: json.data.sources }]);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setMessages(history.map((m, i) => (i === history.length - 1 ? { ...m, failed: true } : m)));
      setError(e?.message ?? 'Could not reach the assistant. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [countryCode, endpoint, field]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = input.trim();
    if (!t || loading) return;
    setInput('');
    void send(t, messages.filter((m) => !m.failed));
  };
  const retry = () => {
    const last = messages[messages.length - 1];
    if (last?.failed) void send(last.content, messages.slice(0, -1).filter((m) => !m.failed));
  };

  return (
    <section className="asterra-ai" aria-label="ASTERRA assistant">
      <header className="asterra-ai__head">
        <h2>Ask ASTERRA</h2>
        <p>{countryName ? `Advice for ${countryName}. ` : ''}Guidance only. Check with a local agronomist before big decisions.</p>
      </header>
      <div className="asterra-ai__log" role="log" aria-live="polite" aria-busy={loading}>
        {messages.length === 0 && (
          <div className="asterra-ai__empty">
            <p>Ask about crops, soil, water or the season ahead.</p>
            <div className="asterra-ai__chips">
              {suggestions.map((s) => <button key={s} type="button" onClick={() => void send(s, [])} disabled={loading}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`asterra-ai__msg asterra-ai__msg--${m.role}${m.failed ? ' is-failed' : ''}`}>
            {m.role === 'assistant' ? renderMarkdown(m.content) : <p>{m.content}</p>}
            {m.sources && m.sources.length > 0 && (
              <details className="asterra-ai__sources">
                <summary>Data used ({m.sources.length})</summary>
                <ul>
                  {m.sources.map((s, k) => (
                    <li key={k}>{s.ok ? `${s.source ?? s.tool}${s.dataStatus ? `, ${s.dataStatus}` : ''}${s.lastUpdated ? `, updated ${s.lastUpdated.slice(0, 10)}` : ''}` : `${s.tool}: unavailable (${s.errorCode})`}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        {loading && <div className="asterra-ai__msg asterra-ai__msg--assistant asterra-ai__typing" role="status">Checking your data…</div>}
        {error && (
          <div className="asterra-ai__error" role="alert">
            <span>{error}</span>
            {messages[messages.length - 1]?.failed && <button type="button" onClick={retry}>Try again</button>}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="asterra-ai__form" onSubmit={submit}>
        <label htmlFor="asterra-ai-input" className="asterra-ai__sr">Your question</label>
        <textarea
          id="asterra-ai-input" rows={1} value={input} maxLength={2000} placeholder="Type your question"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <button type="submit" disabled={loading || !input.trim()}>Send</button>
      </form>
    </section>
  );
}
export default AssistantPanel;
