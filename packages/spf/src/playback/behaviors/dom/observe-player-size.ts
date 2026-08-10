/**
 * **Player-size measurement.** Mirrors the rendered box of the attached media
 * element into `state.playerWidth`, `state.playerHeight` and
 * `state.playerScale`. Measurement is the whole job — the policy built on it is
 * `track-switching`'s `capToPlayerSize` rule.
 *
 * The measuring itself belongs to `media/dom`: `observeElementSize` watches the
 * box and `observeDevicePixelRatio` watches the density. This behavior only
 * composes them and publishes what they report, so both halves stay usable —
 * and testable — outside playback.
 *
 * Width and height are stored raw, in CSS pixels, with the scale beside them
 * rather than multiplied in. An area is one consumer's question; a height cap
 * or a density-driven policy asks a different one, and each can do its own
 * arithmetic from these three.
 *
 * An unmeasurable element — detached, `display: none`, not yet laid out —
 * reports a `0` box, which writes `undefined` rather than `0`. The three slots
 * clear and fill together, so "no measurement" is unambiguous from any of them.
 */

import { defineBehavior } from '../../../core/composition/create-composition';
import { effect } from '../../../core/signals/effect';
import type { ReadonlySignal, Signal } from '../../../core/signals/primitives';
import { getDevicePixelRatio, observeDevicePixelRatio } from '../../../media/dom/device-pixel-ratio';
import { type ElementSize, observeElementSize } from '../../../media/dom/element-size';

export interface PlayerSizeState {
  /** Content-box width of the media element, in CSS pixels. */
  playerWidth?: number;
  /** Content-box height of the media element, in CSS pixels. */
  playerHeight?: number;
  /**
   * Device pixels per CSS pixel at measurement time. `1` when
   * `useDevicePixelRatio` is off, so consumers can always multiply by it.
   */
  playerScale?: number;
}

export interface PlayerSizeContext {
  mediaElement?: HTMLMediaElement | undefined;
}

/** Player-size cap policy. Supplied via engine config. */
export interface PlayerSizeCapConfig {
  /** Measure at all. `false` leaves the slots unset, so the cap is inert. */
  enabled: boolean;
  /**
   * Track `devicePixelRatio` as the scale. A 640-CSS-px player on a 2x display
   * is really 1280 device pixels; reporting a scale of `1` there would cap it
   * to 720p and under-serve the display. `false` pins the scale at `1` and
   * stops watching the ratio, which is what a consumer measuring in CSS pixels
   * wants.
   */
  useDevicePixelRatio: boolean;
}

export const DEFAULT_PLAYER_SIZE_CAP_CONFIG: PlayerSizeCapConfig = {
  enabled: true,
  useDevicePixelRatio: true,
};

export interface ObservePlayerSizeConfig {
  /** Player-size cap policy; defaults to `DEFAULT_PLAYER_SIZE_CAP_CONFIG`. */
  playerSizeCap?: Partial<PlayerSizeCapConfig>;
}

function observePlayerSizeSetup({
  state,
  context,
  config = {},
}: {
  state: {
    playerWidth: Signal<PlayerSizeState['playerWidth']>;
    playerHeight: Signal<PlayerSizeState['playerHeight']>;
    playerScale: Signal<PlayerSizeState['playerScale']>;
  };
  context: { mediaElement: ReadonlySignal<PlayerSizeContext['mediaElement']> };
  config?: ObservePlayerSizeConfig;
}): () => void {
  const { enabled, useDevicePixelRatio } = { ...DEFAULT_PLAYER_SIZE_CAP_CONFIG, ...config.playerSizeCap };

  return effect(() => {
    const mediaElement = context.mediaElement.get();

    // The box the observer last reported, kept because a density change has no
    // entry of its own to re-derive it from — nothing resized.
    let size: ElementSize | undefined;
    let scale = useDevicePixelRatio ? getDevicePixelRatio() : 1;

    // No throttling: each slot compares by `Object.is`, so a resize that leaves
    // the numbers alone notifies nothing, and one that changes them costs a
    // re-run of the selection rule chain.
    const publish = () => {
      const measured = size && size.width > 0 && size.height > 0 ? size : undefined;
      state.playerWidth.set(measured?.width);
      state.playerHeight.set(measured?.height);
      state.playerScale.set(measured ? scale : undefined);
    };

    // Clear first: a swapped-in element hasn't been measured yet, and the
    // previous element's box is a worse answer than no answer. The observer
    // fills it back in on the next layout, well before any selection that
    // waits on a network round-trip.
    publish();

    if (!enabled || !mediaElement) return;

    const stopObservingSize = observeElementSize(mediaElement, (next) => {
      size = next;
      publish();
    });

    const stopObservingScale = useDevicePixelRatio
      ? observeDevicePixelRatio((next) => {
          scale = next;
          publish();
        })
      : undefined;

    return () => {
      stopObservingSize();
      stopObservingScale?.();
    };
  });
}

/**
 * Track the rendered box of the attached media element in `playerWidth`,
 * `playerHeight` and `playerScale`.
 *
 * @example
 * const cleanup = observePlayerSize.setup({ state, context });
 */
export const observePlayerSize = defineBehavior({
  stateKeys: ['playerWidth', 'playerHeight', 'playerScale'],
  contextKeys: ['mediaElement'],
  setup: observePlayerSizeSetup,
});
