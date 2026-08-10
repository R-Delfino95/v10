/**
 * **Device-pixel-ratio measurement.** How many device pixels one CSS pixel is
 * painted with, and a watcher for when that changes.
 *
 * There is no `devicePixelRatio` event. The standing trick is a
 * `(resolution: Ndppx)` media query, which matches only the ratio it was built
 * with — so every change detaches the current query and arms a fresh one
 * against the new ratio.
 *
 * Worth watching separately from element size: browser zoom and dragging a
 * window between displays of different densities both change the ratio without
 * resizing anything, so a `ResizeObserver` alone would miss them.
 */

import { listen } from '@videojs/utils/dom';

/**
 * The current device pixel ratio. Falls back to `1` where the environment
 * doesn't report one, so callers can always multiply by it.
 */
export function getDevicePixelRatio(): number {
  return globalThis.devicePixelRatio || 1;
}

/**
 * Call `onChange` with the new ratio whenever `devicePixelRatio` changes.
 * Returns a function that stops watching.
 *
 * Degrades quietly, in two ways worth knowing about. Without `matchMedia` no
 * query is armed at all. And a browser that doesn't understand the `resolution`
 * feature parses the query as never-matching, so `change` never fires — the
 * ratio read at setup stays put instead of erroring.
 *
 * @example
 * const stop = observeDevicePixelRatio((ratio) => console.log(ratio));
 */
export function observeDevicePixelRatio(onChange: (ratio: number) => void): () => void {
  if (typeof globalThis.matchMedia !== 'function') return () => {};

  let removeListener = () => {};

  const arm = () => {
    const query = globalThis.matchMedia(`(resolution: ${getDevicePixelRatio()}dppx)`);
    removeListener = listen(query, 'change', handleChange);
  };

  const handleChange = () => {
    removeListener();
    arm();
    onChange(getDevicePixelRatio());
  };

  arm();
  return () => removeListener();
}
