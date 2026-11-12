import { STORAGE_KEY, createController } from './model.js';
import { createUI } from './ui.js';
import { en, pt } from './strings.js';
import { css } from './styles.js';

window.__ModuleLoader__.load({ id: '@local/dsh-logo-studio', factory: require => {
  const React = require('react');
  const ui = require('@deepseek-ai/dsh-client-ui-primitives');
  function apply(ctx) {
    ctx.effect(() => {
      const disposers = [];
      const cleanup = () => { for (const dispose of disposers.splice(0).reverse()) dispose(); };
      try {
        const storage = {
          getItem: key => window.localStorage.getItem(key),
          setItem: (key, value) => window.localStorage.setItem(key, value),
          removeItem: key => window.localStorage.removeItem(key),
        };
        const controller = createController(storage);
        disposers.push(() => controller.dispose());
        const { Settings, BrandMark, BrandName } = createUI(React, ui, controller);
        const style = document.createElement('style');
        style.dataset.plugin = '@local/dsh-logo-studio';
        style.dataset.pluginCss = '@local/dsh-logo-studio/styles';
        style.textContent = css;
        document.head.append(style);
        disposers.push(() => style.remove());
        disposers.push(ctx.locale.register('logo-studio', { en, pt }));
        disposers.push(ctx.slots.inject('settings.general.item', () => ctx.slots.register({ name: 'settings.general.item', id: 'logo-studio', order: 10.6, locale: 'logo-studio' }, Settings)));
        disposers.push(ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', () => {
          let marks = [];
          const clear = () => { for (const dispose of marks.splice(0).reverse()) dispose(); };
          function sync() {
            if (controller.getSnapshot().value.mode === 'original') { clear(); return; }
            if (marks.length) return;
            try {
              // The public shadowing priority preserves the original occupants.
              // Unregistering these two seats reveals the existing brand again.
              marks.push(ctx.slots.register({ name: 'sidebar.brand.mark', priority: -100 }, BrandMark));
              marks.push(ctx.slots.register({ name: 'sidebar.brand.name', priority: -100 }, BrandName));
            } catch (error) { clear(); throw error; }
          }
          sync();
          const unsubscribe = controller.subscribe(sync);
          return () => { unsubscribe(); clear(); };
        })));
        const changed = event => { if (event.key === STORAGE_KEY || event.key === null) controller.reload(); };
        window.addEventListener('storage', changed);
        disposers.push(() => window.removeEventListener('storage', changed));
        return cleanup;
      } catch (error) { cleanup(); throw error; }
    });
  }
  return { apply, inject: ['slots', 'locale'] };
} });
