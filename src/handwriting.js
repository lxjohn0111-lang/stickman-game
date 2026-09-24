// A tiny single-stroke "hand" font drawn as SVG paths, so the handwritten
// titles look the same on every machine without shipping a font file.
// Glyph box: x-height 55..100, ascender 22, descender to 132.

const G = {
  C: [54, 'M47 36 C38 21 10 24 8 60 C6 96 30 106 48 90'],
  E: [48, 'M42 28 C30 26 19 26 10 27 C10 50 10 76 11 100 C22 100 32 100 43 99 M10 62 C20 62 28 62 36 61'],
  W: [88,'M4 26 C9 50 15 76 22 100 L44 46 L64 100 C70 76 77 50 84 24'],
  N: [64, 'M8 101 C8 76 9 50 9 27 L54 99 C55 74 55 50 56 25'],
  P: [52, 'M10 101 L11 26 C42 18 52 42 41 56 C33 66 19 64 11 61'],
  a: [50, 'M41 62 C33 52 12 54 9 76 C6 98 30 104 40 84 M42 56 C41 70 41 88 44 101'],
  c: [42, 'M37 63 C30 53 10 54 9 76 C8 98 28 104 38 92'],
  d: [50,'M41 62 C33 52 11 54 9 76 C7 98 30 103 40 84 M42 22 C41 50 41 80 44 101'],
  e: [46, 'M9 78 C22 79 38 76 38 68 C38 54 12 52 9 74 C6 96 28 106 40 92'],
  g: [50, 'M41 62 C33 51 11 54 9 75 C7 95 30 99 40 81 M41 55 C41 80 42 105 40 118 C38 134 14 134 8 122'],
  h: [50, 'M9 22 C9 50 8 78 9 101 M9 76 C14 60 38 52 41 72 C42 82 41 92 42 101'],
  i: [20, 'M10 58 C10 72 10 88 11 101 M10 38 L11 40'],
  l: [20, 'M10 22 C10 50 10 78 11 101'],
  m: [72, 'M9 56 C9 72 9 88 9 101 M9 74 C13 58 34 54 36 72 C37 82 36 92 37 101 M36 74 C40 58 61 54 63 72 C64 82 63 92 64 101'],
  n: [50,'M9 56 C9 72 9 88 9 101 M9 76 C14 60 38 52 41 72 C42 82 41 92 42 101'],
  o: [50, 'M25 55 C8 56 5 99 25 100 C45 101 45 55 25 55 C20 55 17 58 16 61'],
  p: [50, 'M10 56 C10 80 10 106 11 132 M10 70 C18 54 42 54 42 76 C42 98 20 104 10 90'],
  r: [38,'M9 57 C9 72 9 88 10 101 M10 78 C14 62 24 55 35 58'],
  s: [40, 'M34 60 C28 52 8 54 9 66 C10 78 32 74 33 88 C34 102 10 104 5 94'],
  t: [34, 'M17 30 C16 55 15 80 17 94 C19 101 27 101 31 95 M4 56 C14 55 22 55 31 54'],
  u: [50, 'M8 56 C8 72 7 86 12 95 C18 104 36 101 40 84 M41 55 C41 72 41 88 43 101'],
  v: [46, 'M5 56 C10 70 16 86 22 100 L41 55'],
  w: [68,'M4 57 C8 72 12 86 17 100 L33 64 L48 100 C53 86 58 70 63 55'],
  y: [48, 'M6 56 C10 72 16 88 25 99 M43 55 C36 80 28 106 18 126 C14 134 6 133 4 126'],
  '.': [18, 'M9 97 L10 99'],
  ' ': [24, ''],
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Returns an <svg> element with the text written by hand. The strokes draw
// themselves in when `animate` is true.
export function handwrite(text, { height = 64, stroke = 6.5, animate = true, delay = 0, seed = 7, className = '' } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const r = rng(seed);
  let x = 0;
  let idx = 0;
  const glyphs = [];
  for (const ch of text) {
    const g = G[ch] || G[ch.toLowerCase()] || G[' '];
    const [w, d] = g;
    if (d) {
      const grp = document.createElementNS(NS, 'g');
      const rot = (r() - 0.5) * 6;
      const dy = (r() - 0.5) * 4;
      grp.setAttribute('transform', `translate(${x.toFixed(1)} ${dy.toFixed(1)}) rotate(${rot.toFixed(1)} ${w / 2} 78)`);
      for (const part of d.split(/(?=M)/)) {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', part.trim());
        p.setAttribute('pathLength', '1');
        if (animate) {
          p.style.strokeDasharray = '1';
          p.style.strokeDashoffset = '1';
          p.style.animation = `hw-draw 0.32s ease-out ${(delay + idx * 0.075).toFixed(3)}s forwards`;
        }
        grp.appendChild(p);
        idx++;
      }
      glyphs.push(grp);
    }
    x += w - 3;
  }
  const W = Math.max(10, x + 8);
  svg.setAttribute('viewBox', `-4 12 ${W} 128`);
  svg.setAttribute('height', String(height));
  svg.setAttribute('width', String((height * W) / 128));
  svg.setAttribute('class', `hw ${className}`);
  svg.setAttribute('aria-label', text);
  svg.setAttribute('role', 'img');
  svg.style.strokeWidth = String(stroke);
  for (const g of glyphs) svg.appendChild(g);
  return svg;
}
