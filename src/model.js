export const STORAGE_KEY = 'dsh-logo-studio:v1';
export const MAX_IMAGE_LENGTH = 750_000;
export const MAX_STORAGE_LENGTH = MAX_IMAGE_LENGTH * 2 + 4096;
export const defaults = Object.freeze({ version: 1, mode: 'original', name: 'deepseek', badge: 'HARNESS', color: '', height: 24, image: '', icon: '', showIcon: true });

// Only locally normalized raster images are persisted. Never accept a remote URL,
// raw SVG/HTML, CSS expression or a profile imported from another origin.
export function imageData(value) {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_LENGTH || (value !== '' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))) throw new Error('invalidImage');
  return value;
}
export function validate(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) throw new Error('invalidSettings');
  if (!['original', 'text', 'image'].includes(value.mode)) throw new Error('invalidSettings');
  if (typeof value.name !== 'string' || value.name.length > 40 || !value.name.trim()) throw new Error('invalidName');
  if (typeof value.badge !== 'string' || value.badge.length > 16) throw new Error('invalidBadge');
  if (typeof value.color !== 'string' || (value.color !== '' && !/^#[0-9a-f]{6}$/i.test(value.color))) throw new Error('invalidColor');
  if (!Number.isInteger(value.height) || value.height < 16 || value.height > 40 || typeof value.showIcon !== 'boolean') throw new Error('invalidSettings');
  const image = imageData(value.image), icon = imageData(value.icon);
  if (value.mode === 'image' && !image) throw new Error('imageRequired');
  return { version: 1, mode: value.mode, name: value.name.trim(), badge: value.badge.trim(), color: value.color, height: value.height, image, icon, showIcon: value.showIcon };
}
export function decode(raw) {
  if (raw === null) return { value: { ...defaults }, warning: '', readOnly: false };
  try {
    if (raw.length > MAX_STORAGE_LENGTH) throw new Error('invalidSettings');
    const value = JSON.parse(raw);
    if (Number.isInteger(value?.version) && value.version > 1) return { value: { ...defaults }, warning: 'futureVersion', readOnly: true };
    return { value: validate(value), warning: '', readOnly: false };
  } catch { return { value: { ...defaults }, warning: 'recovered', readOnly: false }; }
}

export function createController(storage) {
  const listeners = new Set();
  let snapshot, disposed = false;
  function read() {
    try { return decode(storage.getItem(STORAGE_KEY)); }
    catch { return { value: { ...defaults }, warning: 'storageError', readOnly: false }; }
  }
  snapshot = { ...read(), revision: 0 };
  function publish(next) {
    if (disposed) return;
    snapshot = { ...next, revision: snapshot.revision + 1 };
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    save(draft) {
      if (disposed) throw new Error('unavailable');
      if (snapshot.readOnly) throw new Error('futureVersion');
      const value = validate(draft);
      try { storage.setItem(STORAGE_KEY, JSON.stringify(value)); }
      catch { throw new Error('storageError'); }
      publish({ value, warning: '', readOnly: false });
    },
    restore() {
      if (disposed) throw new Error('unavailable');
      if (snapshot.readOnly) throw new Error('futureVersion');
      try { storage.removeItem(STORAGE_KEY); }
      catch { throw new Error('storageError'); }
      publish({ value: { ...defaults }, warning: '', readOnly: false });
    },
    reload() { if (!disposed) publish(read()); },
    dispose() { disposed = true; listeners.clear(); },
  };
}
