import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validate, decode, imageData, createController, STORAGE_KEY, MAX_IMAGE_LENGTH } from '../src/model.js';
import { en, pt } from '../src/strings.js';
const logo = 'data:image/png;base64,aGVsbG8=';
function memory() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }

test('starts with original without overwriting saved data', () => {
  const storage = memory(), controller = createController(storage);
  assert.deepEqual(controller.getSnapshot().value, defaults);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});
test('save is normalized, persists and notifies; restore removes only our key', () => {
  const storage = memory(), controller = createController(storage); storage.setItem('other-plugin', 'keep');
  let notifications = 0; const unsubscribe = controller.subscribe(() => notifications++);
  controller.save({ ...defaults, mode: 'text', name: ' Edgar ', badge: ' DEV ' });
  assert.equal(controller.getSnapshot().value.name, 'Edgar');
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).badge, 'DEV');
  assert.equal(notifications, 1);
  controller.restore();
  assert.deepEqual(controller.getSnapshot().value, defaults);
  assert.equal(storage.getItem(STORAGE_KEY), null); assert.equal(storage.getItem('other-plugin'), 'keep');
  unsubscribe(); controller.reload(); assert.equal(notifications, 2);
});
test('storage failures preserve the active logo and report failure', () => {
  const controller = createController({ getItem() { return JSON.stringify({ ...defaults, mode: 'text', name: 'Active' }); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } });
  assert.throws(() => controller.save({ ...defaults, mode: 'text', name: 'New' }), /storageError/);
  assert.throws(() => controller.restore(), /storageError/);
  assert.equal(controller.getSnapshot().value.name, 'Active');
  assert.equal(createController({ getItem() { throw Error('denied'); } }).getSnapshot().warning, 'storageError');
});
test('invalid and future data recover safely without overwriting', () => {
  for (const raw of ['{bad', '{}', 'null', JSON.stringify({ ...defaults, color: 'red' }), 'x'.repeat(1_600_000)]) assert.equal(decode(raw).warning, 'recovered');
  const storage = memory(); const raw = '{"version":2,"preserve":"yes"}'; storage.setItem(STORAGE_KEY, raw);
  const controller = createController(storage); assert.equal(controller.getSnapshot().readOnly, true);
  assert.throws(() => controller.save(defaults), /futureVersion/); assert.throws(() => controller.restore(), /futureVersion/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});
test('data URLs are raster-only and bounded; remote URLs and SVG cannot reach saved state', () => {
  assert.equal(imageData(logo), logo);
  for (const data of ['https://example.com/x.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,abc=', 'data:text/html;base64,abc=', 'data:image/png;base64,abc\"onerror=alert(1)', 'x'.repeat(MAX_IMAGE_LENGTH + 1)]) assert.throws(() => imageData(data), /invalidImage/);
  assert.throws(() => validate({ ...defaults, mode: 'image' }), /imageRequired/);
  assert.equal(validate({ ...defaults, mode: 'image', image: logo }).image, logo);
});
test('field constraints and projection prevent unsafe styles and unknown keys', () => {
  for (const bad of [{ name: ' ' }, { name: 'x'.repeat(41) }, { badge: 'x'.repeat(17) }, { color: 'url(x)' }, { height: 15 }, { height: 41 }, { height: NaN }, { height: 24.5 }, { mode: 'other' }, { showIcon: 'true' }, { image: null }]) assert.throws(() => validate({ ...defaults, ...bad }));
  assert.equal(validate({ ...defaults, color: '#AaBBcc', unknown: 'ignored' }).unknown, undefined);
});
test('reload supports cross-window changes and disposal clears listeners', () => {
  const storage = memory(), controller = createController(storage); let count = 0; controller.subscribe(() => count++);
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...defaults, mode: 'text', name: 'Other window' })); controller.reload();
  assert.equal(controller.getSnapshot().value.name, 'Other window'); assert.equal(count, 1);
  controller.dispose(); controller.reload(); assert.equal(count, 1); assert.throws(() => controller.save(defaults), /unavailable/);
});
test('Portuguese and English dictionaries have matching complete keys', () => {
  assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
  assert.ok(Object.values(pt).every(value => typeof value === 'string' && value.length));
});
