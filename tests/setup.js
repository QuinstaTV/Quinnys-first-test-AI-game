/**
 * Jest test setup - mocks browser globals for Node.js testing
 */

// Minimal canvas mock
const mockCtx = {
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  strokeRect: jest.fn(),
  beginPath: jest.fn(),
  closePath: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  drawImage: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  rotate: jest.fn(),
  scale: jest.fn(),
  createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  createImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
  putImageData: jest.fn(),
  getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
  measureText: jest.fn(() => ({ width: 50 })),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left',
  textBaseline: 'top',
  globalAlpha: 1,
  fillText: jest.fn(),
  strokeText: jest.fn(),
  setTransform: jest.fn(),
  imageSmoothingEnabled: true,
};

const mockCanvas = {
  getContext: jest.fn(() => mockCtx),
  width: 960,
  height: 640,
  addEventListener: jest.fn(),
  toDataURL: jest.fn(),
  getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0, width: 960, height: 640 })),
  style: {},
};

// Mock document
global.document = {
  getElementById: jest.fn(() => mockCanvas),
  createElement: jest.fn((tag) => {
    if (tag === 'canvas') {
      return {
        getContext: jest.fn(() => mockCtx),
        width: 32,
        height: 32,
        style: {},
      };
    }
    return { style: {} };
  }),
  readyState: 'complete',
  addEventListener: jest.fn(),
  fullscreenElement: null,
  webkitFullscreenElement: null,
  exitFullscreen: jest.fn(),
  documentElement: {
    requestFullscreen: jest.fn(() => Promise.resolve()),
  },
};

// Mock window
global.window = global.window || {};
global.window.addEventListener = jest.fn();
global.window.innerWidth = 960;
global.window.innerHeight = 640;
global.window.devicePixelRatio = 1;
global.window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn() }));
global.requestAnimationFrame = jest.fn();
global.setTimeout = global.setTimeout;
global.navigator = global.navigator || {};
global.navigator.vibrate = jest.fn(() => true);
global.navigator.maxTouchPoints = 0;
global.navigator.userAgent = global.navigator.userAgent || 'node-test';
global.screen = global.screen || {};
global.screen.orientation = { lock: jest.fn(() => Promise.resolve()), type: 'landscape-primary' };

// Mock Audio API
global.AudioContext = jest.fn(() => ({
  createOscillator: jest.fn(() => ({
    connect: jest.fn(), start: jest.fn(), stop: jest.fn(),
    frequency: { value: 440, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
    type: 'sine',
  })),
  createGain: jest.fn(() => ({
    connect: jest.fn(),
    gain: { value: 1, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
  })),
  createBiquadFilter: jest.fn(() => ({
    connect: jest.fn(),
    frequency: { value: 1000 },
    Q: { value: 1 },
    type: 'lowpass',
  })),
  destination: {},
  currentTime: 0,
  state: 'running',
  resume: jest.fn(),
}));
global.webkitAudioContext = global.AudioContext;

// Export for use in tests
module.exports = { mockCanvas, mockCtx };

// Ensure Game namespace is available as a global for IIFEs that destructure from it
Object.defineProperty(global, 'Game', {
  get: function () { return global.window.Game; },
  set: function (v) { global.window.Game = v; },
  configurable: true
});
