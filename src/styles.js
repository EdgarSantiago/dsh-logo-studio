export const css = `
.dsh-logo-studio { padding:16px 0; border-bottom:1px solid var(--dsw-alias-border-l3); color:var(--dsw-alias-label-primary); font:inherit; min-width:0; }
:is(.dsh-logo-studio, .dsh-logo-dialog) * { box-sizing:border-box; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-header { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
:is(.dsh-logo-studio, .dsh-logo-dialog) p { color:var(--dsw-alias-label-secondary); line-height:1.5; font-size:12px; margin:6px 0; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-editor { display:grid; gap:16px; margin:0; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-field { display:grid; gap:7px; font-size:13px; min-width:0; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-field input:not([type=checkbox]):not([type=color]):not([type=range]), :is(.dsh-logo-studio, .dsh-logo-dialog) select { width:100%; }
:is(.dsh-logo-studio, .dsh-logo-dialog) select { background:var(--dsw-alias-bg-layer-2); color:inherit; border:1px solid var(--dsw-alias-border-main); border-radius:8px; padding:8px; font:inherit; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-actions, :is(.dsh-logo-studio, .dsh-logo-dialog) .ls-inline { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-preview-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-preview { border-radius:10px; padding:20px 12px; min-height:84px; display:flex; align-items:center; gap:8px; overflow:hidden; border:1px solid #80808040; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-preview-light { background:#f5f5f7; color:#212124; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-preview-dark { background:#1b1b1f; color:#f4f4f5; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-preview-label { font-size:11px; margin-bottom:5px; color:var(--dsw-alias-label-secondary); }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-file { font:inherit; width:100%; min-width:0; font-size:12px; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-status { min-height:18px; }
:is(.dsh-logo-studio, .dsh-logo-dialog) .ls-warning { color:var(--dsw-alias-label-primary); border-left:3px solid currentColor; padding-left:10px; }
.dsh-logo-dialog { width:min(620px, 100%); max-height:100%; color:var(--dsw-alias-label-primary); }
.dsh-logo-dialog .ls-modal-content { overflow-y:auto; }
.dsh-logo-dialog .ls-modal-actions { flex:1; justify-content:flex-end; }
.dsh-logo-name { display:inline-flex; align-items:center; gap:7px; min-width:0; max-width:100%; vertical-align:middle; line-height:1.1; }
.dsh-logo-name-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:inherit; font-weight:650; letter-spacing:-.04em; min-width:0; }
/* Keep the badge's foreground/fill as a contrast-safe pair. Theme surface
   tokens may be light even in a dark sidebar, or translucent in custom themes. */
.dsh-logo-badge { background:#eeeeef; color:#202024; border-radius:3px; padding:2px 5px; flex:none; font-size:.55em; font-weight:600; line-height:1.2; white-space:nowrap; letter-spacing:.04em; position:relative; }
.dsh-logo-badge > span { color:#202024; mix-blend-mode:normal; }
.dsh-logo-image { object-fit:contain; max-width:100%; vertical-align:middle; display:block; }
.dsh-logo-adaptive { display:inline-block; position:relative; min-width:0; max-width:100%; vertical-align:middle; }
.dsh-logo-ink { position:absolute; inset:0; pointer-events:none; background:currentColor; mask-size:100% 100%; mask-repeat:no-repeat; -webkit-mask-size:100% 100%; -webkit-mask-repeat:no-repeat; }
/* Uses public slot anchors, not generated class names. Only hide the separate
   expanded mark when the adjacent name slot contains the complete logo. The
   collapsed sidebar retains its mark/button and therefore stays operable. */
:has(> [data-slot="sidebar.brand.mark"] > .dsh-logo-mark-hidden):has(+ * > [data-slot="sidebar.brand.name"]) { display:none !important; }
@media(max-width:540px) { :is(.dsh-logo-studio, .dsh-logo-dialog) .ls-grid, :is(.dsh-logo-studio, .dsh-logo-dialog) .ls-preview-grid { grid-template-columns:1fr; } }
`;
