import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { defaults, STORAGE_KEY } from '../src/model.js';
import { css } from '../src/styles.js';

test('logo settings section ends with a theme-aware divider', () => {
  assert.match(css, /\.dsh-logo-studio\s*\{[^}]*border-bottom:\s*1px solid var\(--dsw-alias-border-l3\)/);
});
const bundle = await fs.readFile(new URL('../dist/client.js', import.meta.url), 'utf8');

function environment({ initial, fail = false } = {}) {
  const core = new SlotCore();
  core.register({ name: 'root', children: { 'settings.general.item': { kind: 'list', scope: 'root' }, 'sidebar.brand.mark': { kind: 'single', scope: 'root' }, 'sidebar.brand.name': { kind: 'single', scope: 'root' } } }, () => null);
  const officialMark = () => null, officialName = () => null;
  core.register({ name: 'sidebar.brand.mark' }, officialMark); core.register({ name: 'sidebar.brand.name' }, officialName);
  const originalMark = core.entriesOfSlot('sidebar.brand.mark')[0], originalName = core.entriesOfSlot('sidebar.brand.name')[0];
  const values = new Map(initial ? [[STORAGE_KEY, JSON.stringify(initial)]] : []), events = new Map(), styles = new Set(), dictionaries = new Set(), effects = [];
  let plugin;
  const window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key), __ModuleLoader__: { load({ factory }) { plugin = factory(() => ({})); } } };
  const document = { createElement() { const style = { dataset: {}, remove: () => styles.delete(style) }; return style; }, head: { append: style => styles.add(style) } };
  vm.runInNewContext(bundle, { window, document });
  const ctx = { effect(fn) { effects.push(fn()); }, locale: { register(ns) { dictionaries.add(ns); return () => dictionaries.delete(ns); } }, slots: { inject(_name, fn) { return fn(); }, register(options, component) { if (fail) throw Error('register failed'); return core.register(options, component); } } };
  return { core, plugin, ctx, styles, dictionaries, events, values, originalMark, originalName, dispose() { effects.splice(0).reverse().forEach(fn => fn()); } };
}

test('real SDK priority coexists with official slots and restore reveals exact originals', () => {
  const env = environment(); env.plugin.apply(env.ctx);
  assert.equal(env.core.entries('sidebar.brand.mark').length, 1); assert.equal(env.core.entries('settings.general.item').length, 1);
  env.values.set(STORAGE_KEY, JSON.stringify({ ...defaults, mode: 'text', name: 'Edgar' })); env.events.get('storage')({ key: STORAGE_KEY });
  assert.equal(env.core.entries('sidebar.brand.mark').length, 2); assert.equal(env.core.entriesOfSlot('sidebar.brand.mark')[0].options.priority, -100);
  env.values.delete(STORAGE_KEY); env.events.get('storage')({ key: STORAGE_KEY });
  assert.equal(env.core.entriesOfSlot('sidebar.brand.mark')[0], env.originalMark); assert.equal(env.core.entriesOfSlot('sidebar.brand.name')[0], env.originalName);
  env.dispose(); assert.equal(env.styles.size, 0); assert.equal(env.dictionaries.size, 0); assert.equal(env.events.size, 0); assert.equal(env.core.entries('settings.general.item').length, 0);
});
test('disabling a customized plugin releases both brand slots and preserves saved customization', () => {
  const env = environment({ initial: { ...defaults, mode: 'text' } }); env.plugin.apply(env.ctx);
  assert.equal(env.core.entries('sidebar.brand.name').length, 2);
  env.dispose(); assert.equal(env.core.entriesOfSlot('sidebar.brand.mark')[0], env.originalMark); assert.equal(env.core.entriesOfSlot('sidebar.brand.name')[0], env.originalName);
  assert.ok(env.values.has(STORAGE_KEY)); assert.equal(env.styles.size, 0);
});
test('failed activation rolls back styles, locale and settings contributions', () => {
  const env = environment({ fail: true }); assert.throws(() => env.plugin.apply(env.ctx), /register failed/);
  assert.equal(env.styles.size, 0); assert.equal(env.dictionaries.size, 0); assert.equal(env.events.size, 0);
});
test('client is standalone and does not bundle React or reach into host/application files', () => {
  assert.match(bundle, /__ModuleLoader__\.load/); assert.match(bundle, /require\w*\("react"\)/);
  assert.doesNotMatch(bundle, /node:fs|app\.asar|node_modules\/react\/|fetch\(/);
});
