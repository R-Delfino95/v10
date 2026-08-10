/**
 * **Element box measurement.** `ResizeObserver` as a callback-and-cleanup
 * primitive: `observeElementSize` reports an element's content box, in CSS
 * pixels, whenever layout changes it.
 *
 * The size comes from the observer entry rather than from the element. Reading
 * `clientWidth`/`clientHeight` inside the callback forces a synchronous layout
 * and rounds to integers; the entry already carries the box the observer just
 * measured, fractionally and for free.
 *
 * Callers own the policy — no throttling, no dedupe, no interpretation of a
 * zero box. Whoever holds the callback decides what a measurement means.
 */

export interface ElementSize {
  /** Content-box width in CSS pixels. Excludes padding and border. */
  width: number;
  /** Content-box height in CSS pixels. */
  height: number;
}

/**
 * The content box an entry reports, as width × height in CSS pixels.
 *
 * Reads `contentBoxSize`, the modern shape — `contentRect` only survives for
 * pre-2020 browsers, which this engine doesn't target. Its `inlineSize` /
 * `blockSize` are writing-mode relative and map to width / height in the
 * horizontal writing modes a replaced element like `<video>` is laid out with;
 * a vertical writing mode would transpose them.
 *
 * The array is per fragment and holds a single box for everything but a
 * fragmented (multi-column) element, so the first entry is the whole box. A
 * fragmented one measures as nothing rather than as an arbitrary fragment.
 */
export function readContentBoxSize(entry: ResizeObserverEntry): ElementSize {
  const [box] = entry.contentBoxSize;
  return { width: box?.inlineSize ?? 0, height: box?.blockSize ?? 0 };
}

/**
 * Call `onResize` with `element`'s content box on every layout change,
 * including once with the current box shortly after observation starts.
 *
 * Returns a function that stops observing. Environments without
 * `ResizeObserver` never report a size — the caller sees the same "no
 * measurement yet" state it starts in.
 *
 * @example
 * const stop = observeElementSize(video, ({ width, height }) => {
 *   console.log(width, height);
 * });
 */
export function observeElementSize(element: Element, onResize: (size: ElementSize) => void): () => void {
  if (typeof ResizeObserver !== 'function') return () => {};

  // Entries are one-per-observed-element per delivery; observing a single
  // element means the last one is that element's newest box.
  const observer = new ResizeObserver((entries) => {
    const entry = entries.at(-1);
    if (entry) onResize(readContentBoxSize(entry));
  });

  observer.observe(element);
  return () => observer.disconnect();
}
