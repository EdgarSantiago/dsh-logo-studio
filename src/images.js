import { MAX_IMAGE_LENGTH } from './model.js';

export const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** SVG is never injected into the page: allow only self-contained artwork,
 * then rasterize in an image document (scripts disabled by the browser). */
export function checkSvg(source) {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source)) throw new Error('unsafeSvg');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('invalidImage');
  for (const node of doc.querySelectorAll('*')) {
    if (['script', 'foreignobject', 'iframe', 'object', 'embed', 'image', 'style', 'animate', 'animatetransform', 'animatemotion', 'set', 'feimage'].includes(node.localName.toLowerCase())) throw new Error('unsafeSvg');
    for (const attr of node.attributes) {
      if (attr.name === 'xmlns' || attr.prefix === 'xmlns') continue;
      if (/^on/i.test(attr.name) || /@import|javascript:|https?:|file:|data:|\/\//i.test(attr.value)) throw new Error('unsafeSvg');
      if (attr.localName === 'href' && !/^#[\w.-]+$/.test(attr.value)) throw new Error('unsafeSvg');
      if (/url\s*\(/i.test(attr.value) && !/^url\(\s*["']?#[\w.-]+["']?\s*\)$/i.test(attr.value)) throw new Error('unsafeSvg');
    }
  }
}

export async function readImage(file, icon = false) {
  if (!file || file.size > MAX_FILE_BYTES) throw new Error('fileTooLarge');
  if (!ACCEPT.split(',').includes(file.type)) throw new Error('fileType');
  if (file.type === 'image/svg+xml') checkSvg(await file.text());
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { image.src = ''; reject(new Error('invalidImage')); }, 8000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error('invalidImage')); };
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8192 || image.naturalHeight > 8192 || image.naturalWidth * image.naturalHeight > 16_777_216) throw new Error('imageDimensions');
    const scale = Math.min(1, (icon ? 256 : 1200) / image.naturalWidth, (icon ? 256 : 320) / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('invalidImage');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/png');
    if (data.length > MAX_IMAGE_LENGTH) throw new Error('fileTooLarge');
    return data;
  } finally { image.onload = image.onerror = null; URL.revokeObjectURL(url); }
}
