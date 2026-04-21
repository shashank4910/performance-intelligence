"use client";

import { useMemo, type CSSProperties } from "react";

type Props = {
  text: string;
  /** Per-word stagger in ms. Defaults to a comfortable reading cadence. */
  stepMs?: number;
  /** Initial delay before the first word animates in. */
  startDelayMs?: number;
};

/**
 * Renders a paragraph where each word fades in with a staggered delay —
 * reading like captions under a video. Uses the `.exec-subtitle-word`
 * keyframe declared in `globals.css`, which already honors
 * `prefers-reduced-motion` (animation disabled, words remain visible).
 *
 * Rendering detail: words are wrapped in `inline-block` spans so the
 * animated transform does not affect the baseline layout, while a
 * regular space after each word preserves natural wrapping — the
 * paragraph continues to fill its container width and reflow
 * responsively.
 */
export function ExecutiveSummaryCaption({ text, stepMs = 55, startDelayMs = 120 }: Props) {
  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean), [text]);

  if (words.length === 0) return null;

  return (
    <p className="whitespace-normal break-words">
      {words.map((word, i) => {
        const style: CSSProperties = {
          animationDelay: `${startDelayMs + i * stepMs}ms`,
        };
        return (
          <span key={`${i}-${word}`}>
            <span
              className="exec-subtitle-word inline-block"
              style={style}
            >
              {word}
            </span>
            {i < words.length - 1 ? " " : null}
          </span>
        );
      })}
    </p>
  );
}
