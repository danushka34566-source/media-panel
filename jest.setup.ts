import 'cross-fetch/polyfill';

// jsdom intentionally leaves media playback unimplemented. Stable no-op
// defaults let component cleanup exercise the real buffer-release path without
// emitting false console errors; individual tests can still spy on these.
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: jest.fn(),
});
Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  configurable: true,
  value: jest.fn(),
});
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn(() => Promise.resolve()),
});
