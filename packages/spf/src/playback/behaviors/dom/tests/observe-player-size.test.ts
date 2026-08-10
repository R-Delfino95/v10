import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextSignals, StateSignals } from '../../../../core/composition/create-composition';
import { signal } from '../../../../core/signals/primitives';
import {
  type ObservePlayerSizeConfig,
  observePlayerSize,
  type PlayerSizeContext,
  type PlayerSizeState,
} from '../observe-player-size';

// Device-pixel scaling is environment-dependent (headless Chromium reports 1, a
// retina run reports 2), so every test asserting a scale of 1 opts out of it.
// The DPR tests below stub `devicePixelRatio` and assert the scaling explicitly.
const CSS_PIXELS: ObservePlayerSizeConfig = { playerSizeCap: { useDevicePixelRatio: false } };

const elements: HTMLElement[] = [];

/**
 * A laid-out `<video>`. Size has to come from a real box in a real document —
 * a detached element is never measured, which is exactly the "no measurement"
 * case one of the tests covers.
 */
function makeVideo(width: number, height: number): HTMLVideoElement {
  const element = document.createElement('video');
  element.style.display = 'block';
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.append(element);
  elements.push(element);
  return element;
}

function makeState(initial: PlayerSizeState = {}): StateSignals<PlayerSizeState> {
  return {
    playerWidth: signal<number | undefined>(initial.playerWidth),
    playerHeight: signal<number | undefined>(initial.playerHeight),
    playerScale: signal<number | undefined>(initial.playerScale),
  };
}

function makeContext(initial: PlayerSizeContext = {}): ContextSignals<PlayerSizeContext> {
  return {
    mediaElement: signal<HTMLMediaElement | undefined>(initial.mediaElement),
  };
}

function setupObservePlayerSize(initialContext: PlayerSizeContext = {}, config?: ObservePlayerSizeConfig) {
  const state = makeState();
  const context = makeContext(initialContext);
  const cleanup = observePlayerSize.setup({ state, context, config });
  return { state, context, cleanup };
}

/** The measurement as one value, so a test reads as one assertion. */
function measurement(state: StateSignals<PlayerSizeState>) {
  return {
    width: state.playerWidth.get(),
    height: state.playerHeight.get(),
    scale: state.playerScale.get(),
  };
}

const NOT_MEASURED = { width: undefined, height: undefined, scale: undefined };

/** A `MediaQueryList` stand-in, so a density change can be staged by hand. */
class FakeMediaQueryList extends EventTarget {
  matches = true;
  constructor(readonly media: string) {
    super();
  }
}

function stubMatchMedia() {
  const queries: FakeMediaQueryList[] = [];
  vi.stubGlobal('matchMedia', (media: string) => {
    const query = new FakeMediaQueryList(media);
    queries.push(query);
    return query;
  });
  return queries;
}

// Drain microtasks so signal-driven effect re-runs land before assertions.
const flush = () => Promise.resolve().then(() => Promise.resolve());

afterEach(() => {
  vi.unstubAllGlobals();
  for (const element of elements.splice(0)) element.remove();
});

describe('observePlayerSize', () => {
  it('writes the rendered box of the attached media element', async () => {
    const mediaElement = makeVideo(320, 180);

    const { state, cleanup } = setupObservePlayerSize({ mediaElement }, CSS_PIXELS);

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 1 }));

    cleanup();
  });

  it('starts measuring when a media element is attached later', async () => {
    const { state, context, cleanup } = setupObservePlayerSize({}, CSS_PIXELS);

    await vi.waitFor(() => expect(measurement(state)).toEqual(NOT_MEASURED));

    context.mediaElement.set(makeVideo(640, 360));

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 640, height: 360, scale: 1 }));

    cleanup();
  });

  it('re-measures when the element resizes', async () => {
    const mediaElement = makeVideo(320, 180);

    const { state, cleanup } = setupObservePlayerSize({ mediaElement }, CSS_PIXELS);

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 1 }));

    mediaElement.style.width = '1280px';
    mediaElement.style.height = '720px';

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 1280, height: 720, scale: 1 }));

    cleanup();
  });

  it('measures the content box, so padding never counts as player size', async () => {
    const mediaElement = makeVideo(320, 180);
    mediaElement.style.boxSizing = 'content-box';
    mediaElement.style.padding = '20px';

    const { state, cleanup } = setupObservePlayerSize({ mediaElement }, CSS_PIXELS);

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 1 }));

    cleanup();
  });

  it('writes undefined for a zero-size element so the cap stays inert', async () => {
    const mediaElement = makeVideo(320, 180);
    mediaElement.style.display = 'none';

    const { state, cleanup } = setupObservePlayerSize({ mediaElement }, CSS_PIXELS);

    await vi.waitFor(() => expect(measurement(state)).toEqual(NOT_MEASURED));

    cleanup();
  });

  it('clears the measurement when the media element is detached', async () => {
    const mediaElement = makeVideo(320, 180);

    const { state, context, cleanup } = setupObservePlayerSize({ mediaElement }, CSS_PIXELS);

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 1 }));

    context.mediaElement.set(undefined);

    await vi.waitFor(() => expect(measurement(state)).toEqual(NOT_MEASURED));

    cleanup();
  });

  it('clears on element swap rather than carrying the old box over', async () => {
    const first = makeVideo(320, 180);
    const second = makeVideo(640, 360);

    const { state, context, cleanup } = setupObservePlayerSize({ mediaElement: first }, CSS_PIXELS);

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 1 }));

    context.mediaElement.set(second);
    await flush();
    // The new element hasn't been laid out for the observer yet, and the old
    // element's box would be a wrong answer rather than a missing one.
    expect(measurement(state)).toEqual(NOT_MEASURED);

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 640, height: 360, scale: 1 }));

    cleanup();
  });

  it('stops measuring the previous element when it is replaced', async () => {
    const first = makeVideo(320, 180);
    const second = makeVideo(640, 360);

    const { state, context, cleanup } = setupObservePlayerSize({ mediaElement: first }, CSS_PIXELS);

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 1 }));

    context.mediaElement.set(second);
    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 640, height: 360, scale: 1 }));

    first.style.width = '1920px';
    first.style.height = '1080px';
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(measurement(state)).toEqual({ width: 640, height: 360, scale: 1 });

    cleanup();
  });

  it('reports devicePixelRatio as the scale by default', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const mediaElement = makeVideo(320, 180);

    const { state, cleanup } = setupObservePlayerSize({ mediaElement });

    // Raw CSS pixels beside the scale — the squaring is the consumer's to do.
    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 2 }));

    cleanup();
  });

  it('re-publishes when the density changes without a resize', async () => {
    // Browser zoom and dragging the window to another display both do this: the
    // element keeps its CSS box while the device pixels behind it change.
    vi.stubGlobal('devicePixelRatio', 1);
    const queries = stubMatchMedia();
    const mediaElement = makeVideo(320, 180);

    const { state, cleanup } = setupObservePlayerSize({ mediaElement });

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 1 }));

    vi.stubGlobal('devicePixelRatio', 3);
    queries.at(-1)?.dispatchEvent(new Event('change'));

    expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 3 });

    cleanup();
  });

  it('pins the scale at 1 and ignores density when useDevicePixelRatio is false', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const queries = stubMatchMedia();
    const mediaElement = makeVideo(320, 180);

    const { state, cleanup } = setupObservePlayerSize({ mediaElement }, CSS_PIXELS);

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 1 }));
    expect(queries).toHaveLength(0);

    cleanup();
  });

  it('never measures when the cap is disabled', async () => {
    const mediaElement = makeVideo(320, 180);

    const { state, cleanup } = setupObservePlayerSize({ mediaElement }, { playerSizeCap: { enabled: false } });

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(measurement(state)).toEqual(NOT_MEASURED);

    cleanup();
  });

  it('stops observing on cleanup', async () => {
    const mediaElement = makeVideo(320, 180);

    const { state, cleanup } = setupObservePlayerSize({ mediaElement }, CSS_PIXELS);

    await vi.waitFor(() => expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 1 }));

    cleanup();

    mediaElement.style.width = '1280px';
    mediaElement.style.height = '720px';
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(measurement(state)).toEqual({ width: 320, height: 180, scale: 1 });
  });
});
