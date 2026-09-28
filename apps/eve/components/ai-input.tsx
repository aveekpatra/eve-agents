"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

// Chat composer modelled on Skiper UI's "AI Input 005": a fixed bottom input
// with its own placeholder layer, a deep-thinking toggle, shimmering thinking
// state, and bubbles that ease in as they arrive. Built from the rendered
// design rather than the (paid) original source, and with no new dependencies:
// the animations are CSS keyframes and the icons are inline SVG, so this drops
// into the app as-is.

const SURFACE = "#121212";
const FIELD = "#080808";
const HAIRLINE = "#181818";
const MUTED = "#4f4f4e";

export interface AiInputMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface AiInputProps {
  /** Resolves to the assistant's reply. The thinking state runs until it settles. */
  onSend?: (text: string, deepThinking: boolean) => Promise<string> | string;
  placeholder?: string;
  /** Bottom-right caption, matching the original's "AGI is here". */
  caption?: string;
  initialMessages?: AiInputMessage[];
}

function ArrowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `m${idCounter}`;
}

export function AiInput({
  onSend,
  placeholder = "Ask anything...",
  caption = "AGI is here",
  initialMessages = [],
}: AiInputProps) {
  const [messages, setMessages] = useState<AiInputMessage[]>(initialMessages);
  const [value, setValue] = useState("");
  const [thinking, setThinking] = useState(false);
  const [deepThinking, setDeepThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Pin to the newest message the way a chat log should, including while the
  // thinking pill is what just appeared.
  useEffect(() => {
    const node = scrollRef.current;
    if (node === null) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function submit() {
    const text = value.trim();
    if (text.length === 0 || thinking) return;

    setMessages((current) => [...current, { id: nextId(), role: "user", text }]);
    setValue("");
    setThinking(true);
    try {
      const reply = (await onSend?.(text, deepThinking)) ?? "…";
      setMessages((current) => [...current, { id: nextId(), role: "assistant", text: reply }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: nextId(), role: "assistant", text: error instanceof Error ? error.message : "Something went wrong." },
      ]);
    } finally {
      setThinking(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line - the convention every chat UI shares.
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submit();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center" style={{ background: FIELD, color: "#ededed" }}>
      <style>{`
        @keyframes ai-input-rise {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ai-input-shimmer {
          from { background-position: 150% 0; }
          to { background-position: -50% 0; }
        }
        .ai-input-rise { animation: ai-input-rise 260ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .ai-input-shimmer {
          background: linear-gradient(90deg, ${MUTED} 0%, ${MUTED} 40%, #ededed 50%, ${MUTED} 60%, ${MUTED} 100%);
          background-size: 250% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: ai-input-shimmer 1.6s linear infinite;
        }
        .ai-input-scroll::-webkit-scrollbar { display: none; }
        .ai-input-scroll { scrollbar-width: none; }
        @media (prefers-reduced-motion: reduce) {
          .ai-input-rise, .ai-input-shimmer { animation: none; }
          .ai-input-shimmer { color: #ededed; }
        }
      `}</style>

      <div ref={scrollRef} className="ai-input-scroll flex h-full w-full max-w-3xl flex-1 flex-col overflow-y-auto scroll-smooth px-3 pb-32 pt-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`ai-input-rise my-2 w-fit max-w-xs break-words rounded-2xl px-4 py-2 ${
              message.role === "user" ? "self-end" : "self-start"
            }`}
            style={{ background: SURFACE }}
          >
            {message.text}
          </div>
        ))}
        {thinking ? (
          <div className="ai-input-rise my-2 w-fit rounded-2xl px-4 py-2 self-start" style={{ background: SURFACE }}>
            <span className="ai-input-shimmer">{deepThinking ? "Thinking deeply..." : "Thinking..."}</span>
          </div>
        ) : null}
      </div>

      <div className="fixed bottom-2 w-full max-w-3xl px-3 pb-3">
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border"
          style={{ background: SURFACE, borderColor: HAIRLINE }}
        >
          <div className="relative rounded-2xl" style={{ background: FIELD, outline: `1px solid ${HAIRLINE}` }}>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              // field-sizing grows the box with the text where supported; max-h
              // caps it so a long draft scrolls instead of eating the page.
              className="max-h-52 w-full resize-none bg-transparent p-4 pr-[60px] text-base leading-[1.2] outline-none [field-sizing:content]"
              aria-label={placeholder}
            />
            {value.length === 0 ? (
              <p className="pointer-events-none absolute left-4 top-4 text-base leading-[1.2]" style={{ color: "rgba(237,237,237,0.2)" }}>
                {placeholder}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={thinking || value.trim().length === 0}
              // Dim only the "nothing to send" state. The working state is also
              // disabled, but it reads as a solid stop button, not a dead one.
              className={`absolute right-2 top-2 flex size-10 items-center justify-center rounded-xl border border-transparent transition-colors ${
                thinking ? "" : "disabled:opacity-40"
              }`}
              style={thinking ? { background: "#ededed", color: FIELD } : undefined}
              onMouseEnter={(event) => {
                if (thinking) return;
                event.currentTarget.style.background = SURFACE;
                event.currentTarget.style.borderColor = HAIRLINE;
              }}
              onMouseLeave={(event) => {
                if (thinking) return;
                event.currentTarget.style.background = "";
                event.currentTarget.style.borderColor = "transparent";
              }}
              aria-label={thinking ? "Working" : "Send message"}
            >
              {thinking ? <span className="size-3 rounded-sm" style={{ background: FIELD }} /> : <ArrowUpIcon />}
            </button>
          </div>

          <div className="flex items-center justify-between px-2 py-1.5">
            <button
              type="button"
              onClick={() => setDeepThinking((current) => !current)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all duration-100 active:scale-95"
              style={
                deepThinking
                  ? { background: "rgba(8,8,8,0.5)", color: "#ededed" }
                  : { color: MUTED }
              }
              aria-pressed={deepThinking}
            >
              <BookIcon />
              {deepThinking ? "Deep Thinking Now" : "Try Deep Thinking"}
            </button>
            <p className="pr-2 text-xs" style={{ color: "rgba(79,79,78,0.5)" }}>
              {caption}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
