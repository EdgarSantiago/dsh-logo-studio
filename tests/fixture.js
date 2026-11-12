import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Input, Modal, FishLogo, BrandWordmark } from '@deepseek-ai/dsh-client-ui-primitives';
const primitives = { Button, Input, Modal, FishLogo, BrandWordmark };
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { en, pt } from '../src/strings.js';

const h = React.createElement, core = new SlotCore(), effects = [], dictionaries = new Map();
core.register({ name: 'root', children: { 'settings.general.item': { kind: 'list', scope: 'root' }, 'sidebar.brand.mark': { kind: 'single', scope: 'root' }, 'sidebar.brand.name': { kind: 'single', scope: 'root' } } }, () => null);
core.register({ name: 'sidebar.brand.mark' }, ({ size }) => h(primitives.FishLogo, { size }));
core.register({ name: 'sidebar.brand.name' }, () => h(primitives.BrandWordmark, { includeMark: false }));
let plugin, locale = 'pt';
window.__ModuleLoader__ = { load({ factory }) { plugin = factory(name => { if (name === 'react') return React; if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives; throw Error(name); }); } };
window.startPlugin = () => {
  plugin.apply({
    effect(fn) { effects.push(fn()); },
    locale: { register(namespace, dicts) { dictionaries.set(namespace, dicts); return () => dictionaries.delete(namespace); } },
    slots: { inject(_key, fn) { return fn(); }, register: (options, component) => core.register(options, component) },
  });
  function Slot({ name, props = {} }) {
    React.useSyncExternalStore(fn => core.subscribe(name, fn), () => core.getVersion(name));
    return h('div', { 'data-slot': name, style: { display: 'contents' } }, core.entriesOfSlot(name).map((entry, index) => h(entry.component, { key: index, ...props, ...(entry.locale ? { t: key => (locale === 'pt' ? pt : en)[key] || key } : {}) })));
  }
  function App() {
    const [collapsed, setCollapsed] = React.useState(false), [language, setLanguage] = React.useState(locale);
    locale = language;
    return h('main', null,
      h('aside', { 'data-testid': 'sidebar', style: { width: collapsed ? 64 : 280, padding: 16, background: '#1b1b1f', color: '#eee', borderRadius: 12 } },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, height: 48 } },
          h('div', { style: { display: 'flex', flexShrink: 0 } }, h(Slot, { name: 'sidebar.brand.mark', props: { size: 24 } })),
          !collapsed && h('div', { style: { flex: 1, minWidth: 0 } }, h(Slot, { name: 'sidebar.brand.name' }))),
        h('button', { onClick: () => setCollapsed(!collapsed) }, collapsed ? 'Expandir' : 'Recolher')),
      h('select', { 'aria-label': 'Idioma', value: language, onChange: event => setLanguage(event.target.value) }, h('option', { value: 'pt' }, 'Português'), h('option', { value: 'en' }, 'English')),
      h('section', { style: { maxWidth: 600 } }, h(Slot, { name: 'settings.general.item' })));
  }
  createRoot(document.getElementById('root')).render(h(App));
};
window.disposePlugin = () => effects.splice(0).reverse().forEach(fn => fn());
