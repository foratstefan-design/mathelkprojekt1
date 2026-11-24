// A tiny Canvas2D recorder: tests exercise the actual scene without a browser.
export function skyHarness({ width = 1280, height = 900, reduced = false, dpr = 3 } = {}) {
  const originals = new Map(['window', 'document', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'].map(key => [key, globalThis[key]]));
  let now = 0, nextFrame = 0;
  const frames = new Map();
  const contexts = [];
  const media = { matches: reduced, listeners: new Set(), addEventListener(type, cb) { this.listeners.add(cb); }, removeEventListener(type, cb) { this.listeners.delete(cb); } };
  class Recorder {
    constructor() { this.commands = []; this.fillStyle = '#000'; this.globalAlpha = 1; this.matrix = [1, 0, 0, 1, 0, 0]; this.stack = []; }
    point(x, y) { const [a, b, c, d, e, f] = this.matrix; return [a * x + c * y + e, b * x + d * y + f]; }
    save() { this.stack.push({ matrix: [...this.matrix], alpha: this.globalAlpha, color: this.fillStyle }); }
    restore() { const saved = this.stack.pop(); this.matrix = saved.matrix; this.globalAlpha = saved.alpha; this.fillStyle = saved.color; }
    translate(x, y) { const [a, b, c, d, e, f] = this.matrix; this.matrix = [a, b, c, d, a * x + c * y + e, b * x + d * y + f]; }
    rotate(angle) { const [a,b,c,d,e,f]=this.matrix, cs=Math.cos(angle),sn=Math.sin(angle);this.matrix=[a*cs+c*sn,b*cs+d*sn,c*cs-a*sn,d*cs-b*sn,e,f]; }
    scale(x, y) { const [a, b, c, d, e, f] = this.matrix; this.matrix = [a * x, b * x, c * y, d * y, e, f]; }
    fillRect(x, y, w, h) { this.commands.push({ points: [this.point(x, y), this.point(x + w, y), this.point(x + w, y + h), this.point(x, y + h)], color: this.fillStyle, alpha: this.globalAlpha }); }
    beginPath() { this.path = []; }
    moveTo(x, y) { this.path.push(this.point(x, y)); }
    lineTo(x, y) { this.path.push(this.point(x, y)); }
    closePath() {}
    fill() { this.commands.push({ points: [...this.path], color: this.fillStyle, alpha: this.globalAlpha }); }
    drawImage() { this.drawn = true; }
  }
  class Canvas {
    constructor() { this.style = {}; this.attrs = {}; this.context = new Recorder(); contexts.push(this.context); }
    getContext() { return this.context; }
    setAttribute(key, value) { this.attrs[key] = value; }
    getBoundingClientRect() { return { width, height }; }
  }
  const canvas = new Canvas();
  globalThis.performance = { now: () => now };
  globalThis.window = { innerWidth: width, innerHeight: height, devicePixelRatio: dpr, matchMedia: () => media, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { createElement: () => new Canvas() };
  globalThis.requestAnimationFrame = fn => { const id = ++nextFrame; frames.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  return { canvas, media, contexts, frames,
    advance(ms) { now += ms; for(const c of contexts)c.commands.length=0; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(now); },
    frameAt(ms,scene) { now=ms; scene._animate(ms);scene._render(ms/1000,0); },
    changeMotion(value) { media.matches = value; for (const cb of media.listeners) cb(); },
    svg(scene) {
      const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${scene.w} ${scene.h}" shape-rendering="crispEdges">${scene.g.commands.map(c => `<polygon points="${c.points.map(p => p.join(',')).join(' ')}" fill="${escape(c.color)}" opacity="${c.alpha}"/>`).join('')}</svg>`;
    },
    restore() { for (const [key, value] of originals) value === undefined ? delete globalThis[key] : globalThis[key] = value; }
  };
}
