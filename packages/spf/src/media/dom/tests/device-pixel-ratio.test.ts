import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDevicePixelRatio, observeDevicePixelRatio } from '../device-pixel-ratio';

/**
 * A `MediaQueryList` stand-in. Real `(resolution: …dppx)` queries only fire when
 * the display actually changes density, which no test can stage — so the queries
 * are recorded and fired by hand, which is also what proves the watcher re-arms
 * against the *new* ratio rather than the one it started with.
 */
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

/** Change the reported ratio, then fire the query armed against the old one. */
function changeDevicePixelRatio(queries: FakeMediaQueryList[], ratio: number) {
  vi.stubGlobal('devicePixelRatio', ratio);
  queries.at(-1)?.dispatchEvent(new Event('change'));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getDevicePixelRatio', () => {
  it('reports the environment ratio', () => {
    vi.stubGlobal('devicePixelRatio', 3);

    expect(getDevicePixelRatio()).toBe(3);
  });

  it('falls back to 1 where the environment reports none', () => {
    vi.stubGlobal('devicePixelRatio', 0);
    expect(getDevicePixelRatio()).toBe(1);

    vi.stubGlobal('devicePixelRatio', undefined);
    expect(getDevicePixelRatio()).toBe(1);
  });
});

describe('observeDevicePixelRatio', () => {
  it('arms a resolution query against the current ratio', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const queries = stubMatchMedia();

    const stop = observeDevicePixelRatio(() => {});

    expect(queries).toHaveLength(1);
    expect(queries[0]?.media).toBe('(resolution: 2dppx)');

    stop();
  });

  it('reports the new ratio on change', () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const queries = stubMatchMedia();
    const seen: number[] = [];

    const stop = observeDevicePixelRatio((ratio) => seen.push(ratio));
    changeDevicePixelRatio(queries, 2);

    expect(seen).toEqual([2]);

    stop();
  });

  it('re-arms against the new ratio so consecutive changes keep reporting', () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const queries = stubMatchMedia();
    const seen: number[] = [];

    const stop = observeDevicePixelRatio((ratio) => seen.push(ratio));

    changeDevicePixelRatio(queries, 2);
    expect(queries.at(-1)?.media).toBe('(resolution: 2dppx)');

    changeDevicePixelRatio(queries, 3);
    expect(queries.at(-1)?.media).toBe('(resolution: 3dppx)');

    expect(seen).toEqual([2, 3]);

    stop();
  });

  it('detaches the superseded query so a stale one reports nothing', () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const queries = stubMatchMedia();
    const seen: number[] = [];

    const stop = observeDevicePixelRatio((ratio) => seen.push(ratio));
    changeDevicePixelRatio(queries, 2);

    queries[0]?.dispatchEvent(new Event('change'));

    expect(seen).toEqual([2]);

    stop();
  });

  it('stops reporting after cleanup', () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const queries = stubMatchMedia();
    const seen: number[] = [];

    const stop = observeDevicePixelRatio((ratio) => seen.push(ratio));
    stop();

    changeDevicePixelRatio(queries, 2);

    expect(seen).toEqual([]);
  });

  it('never reports where matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const seen: number[] = [];

    const stop = observeDevicePixelRatio((ratio) => seen.push(ratio));

    expect(seen).toEqual([]);
    expect(() => stop()).not.toThrow();
  });
});
