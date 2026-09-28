"use client";

import { AiInput } from "../../components/ai-input";

// Local preview surface for components/ai-input.tsx. The reply is stubbed so the
// thinking state and message animations can be judged without a model call.
const REPLIES = [
  "Paris. Though I hear Lyon has better food.",
  "Working on it - give me a second.",
  "That one I actually know.",
  "I dunnoo 😭",
];

export default function AiInputDemoPage() {
  return (
    <div className="h-screen w-full">
      <AiInput
        onSend={async (_text, deepThinking) => {
          await new Promise((resolve) => setTimeout(resolve, deepThinking ? 2600 : 1200));
          return REPLIES[Math.floor(Math.random() * REPLIES.length)];
        }}
      />
    </div>
  );
}
