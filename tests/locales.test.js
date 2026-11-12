import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dictionaries, en } from '../src/strings.js';

const languages = ['en', 'pt', 'pt-BR', 'zh', 'ja', 'es', 'fr', 'de', 'ru'];
const keys = Object.keys(en);
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
// Original is also the natural Portuguese/Spanish/French/German label.
const unchanged = new Set(['pt.original', 'pt-BR.original', 'es.original', 'fr.original', 'de.original']);

test('all native languages plus pt-BR have every logo label, validation and feedback key', () => {
  assert.deepEqual(Object.keys(dictionaries).sort(), [...languages].sort());
  assert.equal(keys.length, 46);
  assert.equal(dictionaries['pt-BR'], dictionaries.pt);
  for (const tag of languages) {
    const dict = dictionaries[tag];
    assert.deepEqual(Object.keys(dict).sort(), [...keys].sort(), tag);
    for (const key of keys) {
      assert.ok(dict[key].trim(), `${tag}.${key}`);
      assert.doesNotMatch(dict[key], /\u200b|\ufeff|TODO|TRANSLATE/);
      assert.deepEqual(placeholders(dict[key]), placeholders(en[key]), `${tag}.${key} placeholders`);
      if (tag !== 'en' && dict[key] === en[key]) assert.ok(unchanged.has(`${tag}.${key}`), `${tag}.${key} must be translated`);
    }
    for (const literal of ['PNG', 'JPG', 'WebP', 'SVG', '2']) assert.ok(dict.fileHint.includes(literal), `${tag}: ${literal}`);
    for (const literal of ['2', '550']) assert.ok(dict.fileTooLarge.includes(literal));
    assert.match(dict.invalidName, /40/);
    assert.match(dict.invalidBadge, /16/);
    assert.match(dict.imageDimensions, /8192/);
  }
});

test('display metadata includes all native languages and the Brazilian Portuguese alias', async () => {
  const read = async tag => JSON.parse(await readFile(new URL(`../locale/${tag}.json`, import.meta.url), 'utf8'));
  const baseline = await read('en');
  for (const tag of languages) {
    const value = await read(tag);
    assert.deepEqual(Object.keys(value.meta).sort(), ['description', 'title']);
    assert.ok(value.meta.title.trim() && value.meta.description.trim());
    if (tag !== 'en') assert.notEqual(value.meta.description, baseline.meta.description);
  }
  assert.deepEqual(await read('pt-BR'), await read('pt'));
});

test('settings translates at render time through the native slot seat, including pending feedback', async () => {
  const client = await readFile(new URL('../src/client.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(client, /ctx\.locale\.register\('logo-studio', dictionaries\)/);
  assert.match(client, /name: 'settings.general.item'.*locale: 'logo-studio'/);
  assert.match(ui, /function Settings\(\{ t \}\)/);
  assert.match(ui, /busy \? t\('loading'\) : message \? t\(Object\.hasOwn\(en, message\) \? message : 'invalidImage'\)/);
  assert.match(ui, /t\(snapshot.warning\)/);
  assert.match(ui, /t\('confirmRestore'\)/);
  assert.doesNotMatch(client + ui, /locale\.setLocale|locale\.addLanguage|navigator\.language|locale\.preference/);
  assert.doesNotMatch(ui, /setMessage\(t\(/, 'retain message keys, not stale translated strings, across native locale switches');
});
