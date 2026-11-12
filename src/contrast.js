function luminance(rgb) {
  const [r, g, b] = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return .2126 * r + .7152 * g + .0722 * b;
}
export function contrastRatio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function readableRgb(preferred, background) {
  if (contrastRatio(preferred, background) >= 4.5) return preferred;
  return contrastRatio([0, 0, 0], background) > contrastRatio([255, 255, 255], background) ? [0, 0, 0] : [255, 255, 255];
}

/** Separate near-white neutral lettering from transparent logos. Never invert
 * the colored artwork, change the stored source, or remap opaque photographs. */
export function splitLightInk(pixels, width = pixels.length / 4) {
  const colors = new Uint8ClampedArray(pixels), mask = new Uint8ClampedArray(pixels.length);
  let transparent = false, found = false;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 250) { transparent = true; break; }
  if (!transparent) return undefined;
  const count = pixels.length / 4, candidate = new Uint8Array(count), visited = new Uint8Array(count);
  for (let p = 0; p < count; p++) {
    const i = p * 4, lo = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]), hi = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    candidate[p] = Number(lo >= 210 && hi - lo <= 22 && pixels[i + 3] > 0);
  }
  for (let p = 0; p < count; p++) {
    if (!candidate[p] || visited[p]) continue;
    const component = [p]; visited[p] = 1; let touchesTransparency = false;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const q = component[cursor], x = q % width;
      if (pixels[q * 4 + 3] < 250) touchesTransparency = true;
      for (const n of [x > 0 ? q - 1 : -1, x < width - 1 ? q + 1 : -1, q - width, q + width]) {
        if (n < 0 || n >= count) continue;
        if (pixels[n * 4 + 3] < 250) touchesTransparency = true;
        if (candidate[n] && !visited[n]) { visited[n] = 1; component.push(n); }
      }
    }
    // White lettering baked onto a colored plaque already has its own backdrop.
    if (!touchesTransparency) continue;
    for (const q of component) {
      const i = q * 4;
      mask[i] = mask[i + 1] = mask[i + 2] = 255;
      mask[i + 3] = pixels[i + 3]; colors[i + 3] = 0; found = true;
    }
  }
  return found ? { colors, mask } : undefined;
}

/** Read composited ancestor fills, including translucent custom sidebar tints.
 * Native vibrancy cannot be sampled; color-scheme supplies its fallback base. */
export function logoForeground(node, preferred) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return preferred || 'var(--dsw-alias-label-primary)';
  const ancestors = []; for (let parent = node.parentElement; parent; parent = parent.parentElement) ancestors.push(parent);
  const style = getComputedStyle(node);
  context.fillStyle = style.colorScheme === 'dark' || (style.colorScheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? '#1b1b1c' : '#f9fafb';
  context.fillRect(0, 0, 1, 1);
  for (const parent of ancestors.reverse()) {
    context.fillStyle = getComputedStyle(parent).backgroundColor;
    context.fillRect(0, 0, 1, 1);
  }
  const background = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  // Inherit theme text from the parent, not our own previously corrected color.
  context.clearRect(0, 0, 1, 1);
  const foreground = preferred || getComputedStyle(node.parentElement).color;
  context.fillStyle = foreground;
  context.fillRect(0, 0, 1, 1);
  const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  return contrastRatio(rgb, background) >= 4.5 ? foreground : `rgb(${readableRgb(rgb, background).join(', ')})`;
}

const cache = new Map();
export function adaptiveImage(source) {
  if (cache.has(source)) return cache.get(source);
  const result = new Promise(resolve => {
    const image = new Image();
    image.onerror = () => resolve(undefined);
    image.onload = () => {
      try {
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 16_777_216) return resolve(undefined);
        const scale = Math.min(1, 1200 / image.naturalWidth, 320 / image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return resolve(undefined);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const split = splitLightInk(pixels.data, canvas.width);
        if (!split) return resolve(undefined);
        pixels.data.set(split.colors); context.putImageData(pixels, 0, 0); const colors = canvas.toDataURL('image/png');
        pixels.data.set(split.mask); context.putImageData(pixels, 0, 0);
        resolve({ colors, mask: canvas.toDataURL('image/png') });
      } catch { resolve(undefined); }
    };
    image.src = source;
  });
  if (cache.size >= 4) cache.delete(cache.keys().next().value);
  cache.set(source, result); return result;
}
