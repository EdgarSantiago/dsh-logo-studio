import { defaults } from './model.js';
import { ACCEPT, readImage } from './images.js';
import { en } from './strings.js';
import { adaptiveImage, logoForeground } from './contrast.js';

export function createUI(React, ui, controller) {
  const h = React.createElement;
  const { useState, useEffect, useRef, useId, useSyncExternalStore } = React;
  const { Button, Input, Modal, FishLogo, BrandWordmark } = ui;
  const useSnapshot = () => useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  function useLogoColor(ref, preferred) {
    const [color, setColor] = useState(preferred || 'var(--dsw-alias-label-primary)');
    useEffect(() => {
      const node = ref.current; if (!node) return;
      let frame = 0;
      const update = () => { frame = 0; setColor(logoForeground(node, preferred)); };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
      const observer = new MutationObserver(schedule);
      for (let parent = node.parentElement; parent; parent = parent.parentElement) observer.observe(parent, { attributes: true, attributeFilter: ['style', 'class', 'data-ds-dark-theme', 'data-ds-light-theme'] });
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
      const media = matchMedia('(prefers-color-scheme: dark)'); media.addEventListener('change', schedule);
      update();
      return () => { observer.disconnect(); media.removeEventListener('change', schedule); if (frame) cancelAnimationFrame(frame); };
    }, [ref, preferred]);
    return color;
  }
  function LogoImage({ value }) {
    const ref = useRef(null), color = useLogoColor(ref, '');
    const [layers, setLayers] = useState(null);
    useEffect(() => {
      let active = true; setLayers(null);
      if (value.image) adaptiveImage(value.image).then(result => { if (active) setLayers(result); });
      return () => { active = false; };
    }, [value.image]);
    return value.image ? h('span', { ref, className: 'dsh-logo-adaptive', style: { color }, 'data-logo-adaptive': layers ? 'ready' : 'original' },
      h('img', { src: layers?.colors || value.image, alt: value.name, className: 'dsh-logo-image', style: { height: value.height, maxWidth: '100%' } }),
      layers && h('span', { className: 'dsh-logo-ink', 'aria-hidden': true, style: { maskImage: `url("${layers.mask}")`, WebkitMaskImage: `url("${layers.mask}")` } })) : null;
  }
  function Mark({ value, size = 24 }) {
    const ref = useRef(null), color = useLogoColor(ref, value.color);
    const image = value.icon || (value.mode === 'image' ? value.image : '');
    const child = image ? h('img', { src: image, alt: '', width: size, height: size, className: 'dsh-logo-image' }) : h(FishLogo, { size });
    return h('span', { ref, className: value.showIcon ? 'dsh-logo-mark' : 'dsh-logo-mark-hidden', style: { display: 'inline-flex', color } }, child);
  }
  function Name({ value }) {
    if (value.mode === 'original') return h(BrandWordmark, { includeMark: false });
    if (value.mode === 'image') return h(LogoImage, { value });
    return h(TextName, { value });
  }
  function TextName({ value }) {
    const ref = useRef(null), color = useLogoColor(ref, value.color);
    return h('span', { className: 'dsh-logo-name', ref, style: { color, fontSize: value.height }, 'aria-label': `${value.name} ${value.badge}`.trim() },
      h('span', { className: 'dsh-logo-name-text' }, value.name), value.badge && h('span', { className: 'dsh-logo-badge', 'aria-hidden': true }, h('span', null, value.badge)));
  }
  function BrandMark(props) { return h(Mark, { value: useSnapshot().value, size: props.size }); }
  function BrandName() { return h(Name, { value: useSnapshot().value }); }
  function Settings({ t }) {
    const snapshot = useSnapshot();
    const [open, setOpen] = useState(false), [draft, setDraft] = useState(snapshot.value);
    const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
    const generation = useRef(0), baseRevision = useRef(snapshot.revision), mounted = useRef(true);
    const id = useId();
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
    const changedElsewhere = open && baseRevision.current !== snapshot.revision;
    const patch = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setMessage(''); };
    function close() { generation.current++; setBusy(false); setOpen(false); setConfirm(false); }
    function edit() { setDraft({ ...snapshot.value }); baseRevision.current = snapshot.revision; setMessage(''); setOpen(true); }
    async function upload(event, key) {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      const token = ++generation.current; setBusy(true); setMessage('');
      try {
        const data = await readImage(file, key === 'icon');
        if (mounted.current && token === generation.current) setDraft(current => ({ ...current, [key]: data, ...(key === 'image' ? { mode: 'image', showIcon: false } : { showIcon: true }) }));
      } catch (error) { if (mounted.current && token === generation.current) setMessage(error.message); }
      finally { if (mounted.current && token === generation.current) setBusy(false); }
    }
    function save(event) {
      event.preventDefault();
      if (busy || changedElsewhere) return;
      try { controller.save(draft); close(); setMessage('saved'); } catch (error) { setMessage(error.message); }
    }
    function restore() {
      try { controller.restore(); setDraft({ ...defaults }); close(); setMessage('restored'); } catch (error) { setMessage(error.message); }
    }
    const field = (label, key, maxLength) => h('label', { className: 'ls-field' }, t(label), h(Input, { value: draft[key], maxLength, onChange: event => patch(key, event.target.value) }));
    const uploadField = (label, key) => h('label', { className: 'ls-field' }, t(label), h('input', { type: 'file', accept: ACCEPT, disabled: busy, className: 'ls-file', onChange: event => upload(event, key) }));
    const button = (label, props = {}) => h(Button, { type: 'button', variant: 'outline', ...props }, t(label));
    const status = h('p', { className: 'ls-status', role: 'status', 'aria-live': 'polite' }, busy ? t('loading') : message ? t(Object.hasOwn(en, message) ? message : 'invalidImage') : '');
    return h(React.Fragment, null,
      h('section', { className: 'dsh-logo-studio', 'data-testid': 'logo-studio-settings', 'aria-labelledby': id },
      h('div', { className: 'ls-header' }, h('div', null, h('strong', { id }, t('section')), h('p', null, t('hint'))), button('edit', { onClick: edit, disabled: snapshot.readOnly, 'aria-haspopup': 'dialog' })),
      snapshot.warning && h('p', { role: 'status', className: 'ls-warning' }, t(snapshot.warning)),
      !open && message && status),
      h(Modal, {
        open, onClose: close, title: t('edit'), description: t('hint'), closeLabel: t('close'),
        className: 'dsh-logo-dialog', contentClassName: 'ls-modal-content',
        footer: h('div', { className: 'ls-actions ls-modal-actions' },
          !snapshot.readOnly && snapshot.value.mode !== 'original' && button('restore', { onClick: () => setConfirm(true), disabled: busy }),
          button('cancel', { onClick: close }),
          button('save', { type: 'submit', form: `${id}-editor`, variant: 'primary', disabled: busy || changedElsewhere || snapshot.readOnly })),
      },
      h('form', { id: `${id}-editor`, className: 'ls-editor', onSubmit: save },
        h('label', { className: 'ls-field' }, t('mode'), h('select', { 'data-modal-autofocus': true, value: draft.mode, onChange: event => patch('mode', event.target.value) }, ['original', 'text', 'image'].map(mode => h('option', { key: mode, value: mode }, t(mode))))),
        draft.mode !== 'original' && h(React.Fragment, null,
          h('div', { className: 'ls-grid' }, field('name', 'name', 40), draft.mode === 'text' && field('badge', 'badge', 16)),
          draft.mode === 'image' && h('div', { className: 'ls-field' }, uploadField('uploadLogo', 'image'), draft.image && button('removeImage', { onClick: () => { patch('image', ''); patch('mode', 'text'); } })),
          h('label', { className: 'ls-inline' }, h('input', { type: 'checkbox', checked: draft.showIcon, onChange: event => patch('showIcon', event.target.checked) }), t('showIcon')),
          draft.showIcon && h('div', { className: 'ls-field' }, uploadField('uploadIcon', 'icon'), draft.icon && button('removeIcon', { onClick: () => patch('icon', '') })),
          h('div', { className: 'ls-grid' },
            h('label', { className: 'ls-field' }, `${t('height')} · ${draft.height}px`, h('input', { type: 'range', min: 16, max: 40, step: 1, value: draft.height, onChange: event => patch('height', Number(event.target.value)) })),
            draft.mode === 'text' && h('div', { className: 'ls-field' }, h('label', { className: 'ls-inline' }, t('color'), h('input', { type: 'color', value: draft.color || '#e5e5e5', onChange: event => patch('color', event.target.value) })), button('autoColor', { onClick: () => patch('color', '') }))),
          h('p', null, t('fileHint'))),
        h('div', { className: 'ls-field', role: 'group', 'aria-label': t('preview') }, h('strong', null, t('preview')),
          h('div', { className: 'ls-preview-grid' }, ['Light', 'Dark'].map(theme => h('div', { key: theme }, h('div', { className: 'ls-preview-label' }, t(`preview${theme}`)),
            h('div', { className: `ls-preview ls-preview-${theme.toLowerCase()}` },
              (draft.mode === 'original' || draft.showIcon) && h(Mark, { value: draft.mode === 'original' ? defaults : draft }), h(Name, { value: draft }))))),
          h('p', null, t('localOnly'))),
        changedElsewhere && h('p', { role: 'alert' }, t('externalChange')),
        status)),
      h(Modal, {
        open: open && confirm, onClose: () => setConfirm(false), title: t('restore'), description: t('confirmRestore'), closeLabel: t('close'),
        footer: h(React.Fragment, null,
          button('cancel', { onClick: () => setConfirm(false), 'data-modal-autofocus': true }),
          button('confirm', { variant: 'primary', onClick: restore, disabled: busy || changedElsewhere || snapshot.readOnly })),
      }));
  }
  return { Settings, BrandMark, BrandName };
}
