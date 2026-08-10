import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ElementSize, observeElementSize, readContentBoxSize } from '../element-size';

const elements: HTMLElement[] = [];

/** A laid-out box in the real document — `ResizeObserver` reports nothing for a detached one. */
function makeElement(styles: Partial<CSSStyleDeclaration>): HTMLElement {
  const element = document.createElement('div');
  Object.assign(element.style, { display: 'block', ...styles });
  document.body.append(element);
  elements.push(element);
  return element;
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const element of elements.splice(0)) element.remove();
});

describe('readContentBoxSize', () => {
  it('maps inlineSize / blockSize to width / height', () => {
    const entry = { contentBoxSize: [{ inlineSize: 320.5, blockSize: 180.25 }] } as unknown as ResizeObserverEntry;

    expect(readContentBoxSize(entry)).toEqual({ width: 320.5, height: 180.25 });
  });

  it('measures a fragmented element as nothing rather than as one fragment', () => {
    const entry = { contentBoxSize: [] } as unknown as ResizeObserverEntry;

    expect(readContentBoxSize(entry)).toEqual({ width: 0, height: 0 });
  });
});

describe('observeElementSize', () => {
  it('reports the current box once observation starts', async () => {
    const element = makeElement({ width: '320px', height: '180px' });
    const sizes: ElementSize[] = [];

    const stop = observeElementSize(element, (size) => sizes.push(size));

    await vi.waitFor(() => expect(sizes.at(-1)).toEqual({ width: 320, height: 180 }));

    stop();
  });

  it('reports again when the box changes', async () => {
    const element = makeElement({ width: '320px', height: '180px' });
    const sizes: ElementSize[] = [];

    const stop = observeElementSize(element, (size) => sizes.push(size));
    await vi.waitFor(() => expect(sizes.at(-1)).toEqual({ width: 320, height: 180 }));

    element.style.width = '1280px';
    element.style.height = '720px';

    await vi.waitFor(() => expect(sizes.at(-1)).toEqual({ width: 1280, height: 720 }));

    stop();
  });

  it('reports the content box, excluding padding and border', async () => {
    // The distinction `clientWidth` would blur: it counts padding in, so this
    // element would measure 340 × 200 rather than the 320 × 180 it paints.
    const element = makeElement({
      boxSizing: 'content-box',
      width: '320px',
      height: '180px',
      padding: '10px',
      border: '5px solid',
    });
    const sizes: ElementSize[] = [];

    const stop = observeElementSize(element, (size) => sizes.push(size));

    await vi.waitFor(() => expect(sizes.at(-1)).toEqual({ width: 320, height: 180 }));
    expect(element.clientWidth).toBe(340);

    stop();
  });

  it('reports a fractional box without rounding', async () => {
    const element = makeElement({ width: '320.5px', height: '180.25px' });
    const sizes: ElementSize[] = [];

    const stop = observeElementSize(element, (size) => sizes.push(size));

    await vi.waitFor(() => expect(sizes.at(-1)?.width).toBeCloseTo(320.5, 1));
    expect(sizes.at(-1)?.height).toBeCloseTo(180.25, 1);

    stop();
  });

  it('reports a zero box for an unrendered element', async () => {
    const element = makeElement({ width: '320px', height: '180px', display: 'none' });
    const sizes: ElementSize[] = [];

    const stop = observeElementSize(element, (size) => sizes.push(size));

    await vi.waitFor(() => expect(sizes.at(-1)).toEqual({ width: 0, height: 0 }));

    stop();
  });

  it('stops reporting after cleanup', async () => {
    const element = makeElement({ width: '320px', height: '180px' });
    const sizes: ElementSize[] = [];

    const stop = observeElementSize(element, (size) => sizes.push(size));
    await vi.waitFor(() => expect(sizes.at(-1)).toEqual({ width: 320, height: 180 }));

    stop();
    element.style.width = '1280px';
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sizes.at(-1)).toEqual({ width: 320, height: 180 });
  });

  it('never reports where ResizeObserver is unavailable', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const element = makeElement({ width: '320px', height: '180px' });
    const sizes: ElementSize[] = [];

    const stop = observeElementSize(element, (size) => sizes.push(size));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sizes).toEqual([]);
    expect(() => stop()).not.toThrow();
  });
});
