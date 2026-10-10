/**
 * ThinkingOrb Standalone Browser & Custom Element Bundle
 * Powered by thinking-orbs from libraries.dev
 */

import {
  M as MODE_FRAMES,
  r as resolvePreset,
  p as paintFrame,
  s as scaleCounts,
  a as scaleRadii
} from '../node_modules/thinking-orbs/dist/index-B8WsUNf5.js';

function parseTint(color) {
  if (!color) return undefined;
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h2 = hex[1];
    if (h2.length === 3) h2 = h2.replace(/./g, (c2) => c2 + c2);
    const n = parseInt(h2, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const fn = color.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (fn) return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]) };
  return undefined;
}

export function createThinkingOrb(container, options = {}) {
  const state = options.state || 'working';
  const size = options.size || 64;
  const speed = options.speed || 1;
  const dark = options.dark !== undefined ? options.dark : true;
  const color = options.color || '#a78bfa';
  const paused = options.paused || false;

  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.style.display = 'inline-block';
  canvas.style.verticalAlign = 'middle';

  container.innerHTML = '';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return { destroy: () => {} };

  const { mode, speed: baseSpeed, opts: presetOpts } = resolvePreset(state, size);
  let opts = presetOpts;
  const frameFn = MODE_FRAMES[mode];
  const tint = parseTint(color);
  const effSpeed = baseSpeed * speed;

  let rafId = 0;
  let isRunning = !paused;

  const renderFrame = (tSec) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    paintFrame(ctx, frameFn(size, tSec, opts), dark, tint);
  };

  const loop = () => {
    renderFrame((performance.now() / 1000) * effSpeed);
    if (isRunning) {
      rafId = requestAnimationFrame(loop);
    }
  };

  if (isRunning) {
    rafId = requestAnimationFrame(loop);
  } else {
    renderFrame(0.6);
  }

  return {
    canvas,
    setState: (newState) => {
      createThinkingOrb(container, { ...options, state: newState });
    },
    destroy: () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
    }
  };
}

// Custom Element definition: <thinking-orb>
class ThinkingOrbElement extends HTMLElement {
  static get observedAttributes() {
    return ['state', 'size', 'speed', 'color', 'paused'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    const state = this.getAttribute('state') || 'working';
    const size = parseInt(this.getAttribute('size') || '64', 10);
    const speed = parseFloat(this.getAttribute('speed') || '1');
    const color = this.getAttribute('color') || '#a78bfa';
    const paused = this.hasAttribute('paused');

    if (this._orbInstance) {
      this._orbInstance.destroy();
    }
    this._orbInstance = createThinkingOrb(this, { state, size, speed, color, paused, dark: true });
  }

  disconnectedCallback() {
    if (this._orbInstance) {
      this._orbInstance.destroy();
    }
  }
}

if (typeof window !== 'undefined') {
  window.createThinkingOrb = createThinkingOrb;
  if (!customElements.get('thinking-orb')) {
    customElements.define('thinking-orb', ThinkingOrbElement);
  }
}
