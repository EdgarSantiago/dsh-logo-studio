(() => {
  // src/model.js
  var STORAGE_KEY = "dsh-logo-studio:v1";
  var MAX_IMAGE_LENGTH = 75e4;
  var MAX_STORAGE_LENGTH = MAX_IMAGE_LENGTH * 2 + 4096;
  var defaults = Object.freeze({ version: 1, mode: "original", name: "deepseek", badge: "HARNESS", color: "", height: 24, image: "", icon: "", showIcon: true });
  function imageData(value) {
    if (typeof value !== "string" || value.length > MAX_IMAGE_LENGTH || value !== "" && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("invalidImage");
    return value;
  }
  function validate(value) {
    if (!value || typeof value !== "object" || value.version !== 1) throw new Error("invalidSettings");
    if (!["original", "text", "image"].includes(value.mode)) throw new Error("invalidSettings");
    if (typeof value.name !== "string" || value.name.length > 40 || !value.name.trim()) throw new Error("invalidName");
    if (typeof value.badge !== "string" || value.badge.length > 16) throw new Error("invalidBadge");
    if (typeof value.color !== "string" || value.color !== "" && !/^#[0-9a-f]{6}$/i.test(value.color)) throw new Error("invalidColor");
    if (!Number.isInteger(value.height) || value.height < 16 || value.height > 40 || typeof value.showIcon !== "boolean") throw new Error("invalidSettings");
    const image = imageData(value.image), icon = imageData(value.icon);
    if (value.mode === "image" && !image) throw new Error("imageRequired");
    return { version: 1, mode: value.mode, name: value.name.trim(), badge: value.badge.trim(), color: value.color, height: value.height, image, icon, showIcon: value.showIcon };
  }
  function decode(raw) {
    if (raw === null) return { value: { ...defaults }, warning: "", readOnly: false };
    try {
      if (raw.length > MAX_STORAGE_LENGTH) throw new Error("invalidSettings");
      const value = JSON.parse(raw);
      if (Number.isInteger(value?.version) && value.version > 1) return { value: { ...defaults }, warning: "futureVersion", readOnly: true };
      return { value: validate(value), warning: "", readOnly: false };
    } catch {
      return { value: { ...defaults }, warning: "recovered", readOnly: false };
    }
  }
  function createController(storage) {
    const listeners = /* @__PURE__ */ new Set();
    let snapshot, disposed = false;
    function read() {
      try {
        return decode(storage.getItem(STORAGE_KEY));
      } catch {
        return { value: { ...defaults }, warning: "storageError", readOnly: false };
      }
    }
    snapshot = { ...read(), revision: 0 };
    function publish(next) {
      if (disposed) return;
      snapshot = { ...next, revision: snapshot.revision + 1 };
      for (const listener of listeners) listener();
    }
    return {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      save(draft) {
        if (disposed) throw new Error("unavailable");
        if (snapshot.readOnly) throw new Error("futureVersion");
        const value = validate(draft);
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify(value));
        } catch {
          throw new Error("storageError");
        }
        publish({ value, warning: "", readOnly: false });
      },
      restore() {
        if (disposed) throw new Error("unavailable");
        if (snapshot.readOnly) throw new Error("futureVersion");
        try {
          storage.removeItem(STORAGE_KEY);
        } catch {
          throw new Error("storageError");
        }
        publish({ value: { ...defaults }, warning: "", readOnly: false });
      },
      reload() {
        if (!disposed) publish(read());
      },
      dispose() {
        disposed = true;
        listeners.clear();
      }
    };
  }

  // src/images.js
  var ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
  var MAX_FILE_BYTES = 2 * 1024 * 1024;
  function checkSvg(source) {
    if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source)) throw new Error("unsafeSvg");
    const doc = new DOMParser().parseFromString(source, "image/svg+xml");
    if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg") throw new Error("invalidImage");
    for (const node of doc.querySelectorAll("*")) {
      if (["script", "foreignobject", "iframe", "object", "embed", "image", "style", "animate", "animatetransform", "animatemotion", "set", "feimage"].includes(node.localName.toLowerCase())) throw new Error("unsafeSvg");
      for (const attr of node.attributes) {
        if (attr.name === "xmlns" || attr.prefix === "xmlns") continue;
        if (/^on/i.test(attr.name) || /@import|javascript:|https?:|file:|data:|\/\//i.test(attr.value)) throw new Error("unsafeSvg");
        if (attr.localName === "href" && !/^#[\w.-]+$/.test(attr.value)) throw new Error("unsafeSvg");
        if (/url\s*\(/i.test(attr.value) && !/^url\(\s*["']?#[\w.-]+["']?\s*\)$/i.test(attr.value)) throw new Error("unsafeSvg");
      }
    }
  }
  async function readImage(file, icon = false) {
    if (!file || file.size > MAX_FILE_BYTES) throw new Error("fileTooLarge");
    if (!ACCEPT.split(",").includes(file.type)) throw new Error("fileType");
    if (file.type === "image/svg+xml") checkSvg(await file.text());
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          image.src = "";
          reject(new Error("invalidImage"));
        }, 8e3);
        image.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        image.onerror = () => {
          clearTimeout(timer);
          reject(new Error("invalidImage"));
        };
        image.src = url;
      });
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8192 || image.naturalHeight > 8192 || image.naturalWidth * image.naturalHeight > 16777216) throw new Error("imageDimensions");
      const scale = Math.min(1, (icon ? 256 : 1200) / image.naturalWidth, (icon ? 256 : 320) / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("invalidImage");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/png");
      if (data.length > MAX_IMAGE_LENGTH) throw new Error("fileTooLarge");
      return data;
    } finally {
      image.onload = image.onerror = null;
      URL.revokeObjectURL(url);
    }
  }

  // src/strings.js
  var en = {
    close: "Close logo editor",
    section: "Logo & brand",
    hint: "Customize the logo in the sidebar. No app files are changed.",
    edit: "Customize logo",
    mode: "Logo style",
    original: "Original",
    text: "Text & badge",
    image: "Custom image",
    name: "Brand name",
    badge: "Badge (optional)",
    color: "Text color",
    autoColor: "Use theme color",
    height: "Logo height",
    showIcon: "Show separate icon",
    uploadLogo: "Upload logo",
    uploadIcon: "Upload icon",
    removeIcon: "Use original icon",
    removeImage: "Remove image",
    fileHint: "PNG, JPG, WebP or self-contained SVG \xB7 up to 2 MB. Images stay in this browser.",
    preview: "Preview",
    previewLight: "Light background",
    previewDark: "Dark background",
    save: "Save changes",
    cancel: "Cancel",
    restore: "Restore original",
    confirmRestore: "Restore the original logo and remove your saved customization?",
    confirm: "Yes, restore",
    saved: "Logo saved. The sidebar has been updated.",
    restored: "Original logo restored.",
    loading: "Processing image\u2026",
    storageError: "Could not save locally. Check browser storage permissions or available space. Your current logo was not changed.",
    recovered: "Saved logo settings could not be read. The original logo is being used.",
    futureVersion: "Settings were saved by a newer plugin version. Update the plugin to edit them.",
    invalidSettings: "Invalid logo settings.",
    invalidName: "Enter a brand name with up to 40 characters.",
    invalidBadge: "The badge must have up to 16 characters.",
    invalidColor: "Use a six-digit HEX color.",
    imageRequired: "Upload a logo image first.",
    invalidImage: "This image could not be loaded.",
    fileTooLarge: "Choose an image up to 2 MB (the optimized result must be smaller than 550 KB).",
    fileType: "Use PNG, JPG, WebP or SVG.",
    unsafeSvg: "Use a self-contained SVG without scripts, styles, animation or external resources, or export it as PNG.",
    imageDimensions: "Use an image up to 8192 px per side and 16 megapixels.",
    unavailable: "The plugin is no longer active.",
    externalChange: "The logo changed in another window. Reopen the editor to load the latest version.",
    localOnly: "Applies to this browser/profile, including the collapsed sidebar. Does not change the app icon or window title."
  };
  var pt = {
    close: "Fechar editor de logo",
    section: "Logo e marca",
    hint: "Personalize a logo da barra lateral sem alterar os arquivos do aplicativo.",
    edit: "Personalizar logo",
    mode: "Estilo da logo",
    original: "Original",
    text: "Texto e selo",
    image: "Imagem personalizada",
    name: "Nome da marca",
    badge: "Selo (opcional)",
    color: "Cor do texto",
    autoColor: "Usar a cor do tema",
    height: "Altura da logo",
    showIcon: "Mostrar \xEDcone separado",
    uploadLogo: "Enviar logo",
    uploadIcon: "Enviar \xEDcone",
    removeIcon: "Usar \xEDcone original",
    removeImage: "Remover imagem",
    fileHint: "PNG, JPG, WebP ou SVG autocontido \xB7 at\xE9 2 MB. As imagens ficam neste navegador.",
    preview: "Pr\xE9via",
    previewLight: "Fundo claro",
    previewDark: "Fundo escuro",
    save: "Salvar altera\xE7\xF5es",
    cancel: "Cancelar",
    restore: "Restaurar original",
    confirmRestore: "Restaurar a logo original e remover sua personaliza\xE7\xE3o salva?",
    confirm: "Sim, restaurar",
    saved: "Logo salva. A barra lateral foi atualizada.",
    restored: "Logo original restaurada.",
    loading: "Processando imagem\u2026",
    storageError: "N\xE3o foi poss\xEDvel salvar localmente. Verifique a permiss\xE3o de armazenamento ou o espa\xE7o dispon\xEDvel. Sua logo atual n\xE3o foi alterada.",
    recovered: "N\xE3o foi poss\xEDvel ler a personaliza\xE7\xE3o salva. A logo original est\xE1 sendo usada.",
    futureVersion: "Configura\xE7\xF5es salvas por uma vers\xE3o mais recente. Atualize o plugin para edit\xE1-las.",
    invalidSettings: "Configura\xE7\xF5es de logo inv\xE1lidas.",
    invalidName: "Informe um nome com at\xE9 40 caracteres.",
    invalidBadge: "O selo deve ter at\xE9 16 caracteres.",
    invalidColor: "Use uma cor HEX de seis d\xEDgitos.",
    imageRequired: "Envie uma imagem de logo primeiro.",
    invalidImage: "N\xE3o foi poss\xEDvel carregar esta imagem.",
    fileTooLarge: "Escolha uma imagem de at\xE9 2 MB (o resultado otimizado deve ter menos de 550 KB).",
    fileType: "Use PNG, JPG, WebP ou SVG.",
    unsafeSvg: "Use um SVG autocontido, sem scripts, estilos, anima\xE7\xF5es ou recursos externos, ou exporte como PNG.",
    imageDimensions: "Use uma imagem com at\xE9 8192 px por lado e 16 megapixels.",
    unavailable: "O plugin n\xE3o est\xE1 mais ativo.",
    externalChange: "A logo mudou em outra janela. Reabra o editor para carregar a vers\xE3o atual.",
    localOnly: "Vale para este navegador/perfil, inclusive com a barra recolhida. N\xE3o altera o \xEDcone do app nem o t\xEDtulo da janela."
  };

  // src/contrast.js
  function luminance(rgb) {
    const [r, g, b] = rgb.map((v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrastRatio(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function readableRgb(preferred, background) {
    if (contrastRatio(preferred, background) >= 4.5) return preferred;
    return contrastRatio([0, 0, 0], background) > contrastRatio([255, 255, 255], background) ? [0, 0, 0] : [255, 255, 255];
  }
  function splitLightInk(pixels, width = pixels.length / 4) {
    const colors = new Uint8ClampedArray(pixels), mask = new Uint8ClampedArray(pixels.length);
    let transparent = false, found = false;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 250) {
      transparent = true;
      break;
    }
    if (!transparent) return void 0;
    const count = pixels.length / 4, candidate = new Uint8Array(count), visited = new Uint8Array(count);
    for (let p = 0; p < count; p++) {
      const i = p * 4, lo = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]), hi = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      candidate[p] = Number(lo >= 210 && hi - lo <= 22 && pixels[i + 3] > 0);
    }
    for (let p = 0; p < count; p++) {
      if (!candidate[p] || visited[p]) continue;
      const component = [p];
      visited[p] = 1;
      let touchesTransparency = false;
      for (let cursor = 0; cursor < component.length; cursor++) {
        const q = component[cursor], x = q % width;
        if (pixels[q * 4 + 3] < 250) touchesTransparency = true;
        for (const n of [x > 0 ? q - 1 : -1, x < width - 1 ? q + 1 : -1, q - width, q + width]) {
          if (n < 0 || n >= count) continue;
          if (pixels[n * 4 + 3] < 250) touchesTransparency = true;
          if (candidate[n] && !visited[n]) {
            visited[n] = 1;
            component.push(n);
          }
        }
      }
      if (!touchesTransparency) continue;
      for (const q of component) {
        const i = q * 4;
        mask[i] = mask[i + 1] = mask[i + 2] = 255;
        mask[i + 3] = pixels[i + 3];
        colors[i + 3] = 0;
        found = true;
      }
    }
    return found ? { colors, mask } : void 0;
  }
  function logoForeground(node, preferred) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return preferred || "var(--dsw-alias-label-primary)";
    const ancestors = [];
    for (let parent = node.parentElement; parent; parent = parent.parentElement) ancestors.push(parent);
    const style = getComputedStyle(node);
    context.fillStyle = style.colorScheme === "dark" || style.colorScheme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches ? "#1b1b1c" : "#f9fafb";
    context.fillRect(0, 0, 1, 1);
    for (const parent of ancestors.reverse()) {
      context.fillStyle = getComputedStyle(parent).backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    const background = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    context.clearRect(0, 0, 1, 1);
    const foreground = preferred || getComputedStyle(node.parentElement).color;
    context.fillStyle = foreground;
    context.fillRect(0, 0, 1, 1);
    const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    return contrastRatio(rgb, background) >= 4.5 ? foreground : `rgb(${readableRgb(rgb, background).join(", ")})`;
  }
  var cache = /* @__PURE__ */ new Map();
  function adaptiveImage(source) {
    if (cache.has(source)) return cache.get(source);
    const result = new Promise((resolve) => {
      const image = new Image();
      image.onerror = () => resolve(void 0);
      image.onload = () => {
        try {
          if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 16777216) return resolve(void 0);
          const scale = Math.min(1, 1200 / image.naturalWidth, 320 / image.naturalHeight);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return resolve(void 0);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const split = splitLightInk(pixels.data, canvas.width);
          if (!split) return resolve(void 0);
          pixels.data.set(split.colors);
          context.putImageData(pixels, 0, 0);
          const colors = canvas.toDataURL("image/png");
          pixels.data.set(split.mask);
          context.putImageData(pixels, 0, 0);
          resolve({ colors, mask: canvas.toDataURL("image/png") });
        } catch {
          resolve(void 0);
        }
      };
      image.src = source;
    });
    if (cache.size >= 4) cache.delete(cache.keys().next().value);
    cache.set(source, result);
    return result;
  }

  // src/ui.js
  function createUI(React, ui, controller) {
    const h = React.createElement;
    const { useState, useEffect, useRef, useId, useSyncExternalStore } = React;
    const { Button, Input, Modal, FishLogo, BrandWordmark } = ui;
    const useSnapshot = () => useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    function useLogoColor(ref, preferred) {
      const [color, setColor] = useState(preferred || "var(--dsw-alias-label-primary)");
      useEffect(() => {
        const node = ref.current;
        if (!node) return;
        let frame = 0;
        const update = () => {
          frame = 0;
          setColor(logoForeground(node, preferred));
        };
        const schedule = () => {
          if (!frame) frame = requestAnimationFrame(update);
        };
        const observer = new MutationObserver(schedule);
        for (let parent = node.parentElement; parent; parent = parent.parentElement) observer.observe(parent, { attributes: true, attributeFilter: ["style", "class", "data-ds-dark-theme", "data-ds-light-theme"] });
        observer.observe(document.head, { childList: true, subtree: true, characterData: true });
        const media = matchMedia("(prefers-color-scheme: dark)");
        media.addEventListener("change", schedule);
        update();
        return () => {
          observer.disconnect();
          media.removeEventListener("change", schedule);
          if (frame) cancelAnimationFrame(frame);
        };
      }, [ref, preferred]);
      return color;
    }
    function LogoImage({ value }) {
      const ref = useRef(null), color = useLogoColor(ref, "");
      const [layers, setLayers] = useState(null);
      useEffect(() => {
        let active = true;
        setLayers(null);
        if (value.image) adaptiveImage(value.image).then((result) => {
          if (active) setLayers(result);
        });
        return () => {
          active = false;
        };
      }, [value.image]);
      return value.image ? h(
        "span",
        { ref, className: "dsh-logo-adaptive", style: { color }, "data-logo-adaptive": layers ? "ready" : "original" },
        h("img", { src: layers?.colors || value.image, alt: value.name, className: "dsh-logo-image", style: { height: value.height, maxWidth: "100%" } }),
        layers && h("span", { className: "dsh-logo-ink", "aria-hidden": true, style: { maskImage: `url("${layers.mask}")`, WebkitMaskImage: `url("${layers.mask}")` } })
      ) : null;
    }
    function Mark({ value, size = 24 }) {
      const ref = useRef(null), color = useLogoColor(ref, value.color);
      const image = value.icon || (value.mode === "image" ? value.image : "");
      const child = image ? h("img", { src: image, alt: "", width: size, height: size, className: "dsh-logo-image" }) : h(FishLogo, { size });
      return h("span", { ref, className: value.showIcon ? "dsh-logo-mark" : "dsh-logo-mark-hidden", style: { display: "inline-flex", color } }, child);
    }
    function Name({ value }) {
      if (value.mode === "original") return h(BrandWordmark, { includeMark: false });
      if (value.mode === "image") return h(LogoImage, { value });
      return h(TextName, { value });
    }
    function TextName({ value }) {
      const ref = useRef(null), color = useLogoColor(ref, value.color);
      return h(
        "span",
        { className: "dsh-logo-name", ref, style: { color, fontSize: value.height }, "aria-label": `${value.name} ${value.badge}`.trim() },
        h("span", { className: "dsh-logo-name-text" }, value.name),
        value.badge && h("span", { className: "dsh-logo-badge", "aria-hidden": true }, h("span", null, value.badge))
      );
    }
    function BrandMark(props) {
      return h(Mark, { value: useSnapshot().value, size: props.size });
    }
    function BrandName() {
      return h(Name, { value: useSnapshot().value });
    }
    function Settings({ t }) {
      const snapshot = useSnapshot();
      const [open, setOpen] = useState(false), [draft, setDraft] = useState(snapshot.value);
      const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
      const generation = useRef(0), baseRevision = useRef(snapshot.revision), mounted = useRef(true);
      const id = useId();
      useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
          generation.current++;
        };
      }, []);
      const changedElsewhere = open && baseRevision.current !== snapshot.revision;
      const patch = (key, value) => {
        setDraft((current) => ({ ...current, [key]: value }));
        setMessage("");
      };
      function close() {
        generation.current++;
        setBusy(false);
        setOpen(false);
        setConfirm(false);
      }
      function edit() {
        setDraft({ ...snapshot.value });
        baseRevision.current = snapshot.revision;
        setMessage("");
        setOpen(true);
      }
      async function upload(event, key) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const token = ++generation.current;
        setBusy(true);
        setMessage("");
        try {
          const data = await readImage(file, key === "icon");
          if (mounted.current && token === generation.current) setDraft((current) => ({ ...current, [key]: data, ...key === "image" ? { mode: "image", showIcon: false } : { showIcon: true } }));
        } catch (error) {
          if (mounted.current && token === generation.current) setMessage(error.message);
        } finally {
          if (mounted.current && token === generation.current) setBusy(false);
        }
      }
      function save(event) {
        event.preventDefault();
        if (busy || changedElsewhere) return;
        try {
          controller.save(draft);
          close();
          setMessage("saved");
        } catch (error) {
          setMessage(error.message);
        }
      }
      function restore() {
        try {
          controller.restore();
          setDraft({ ...defaults });
          close();
          setMessage("restored");
        } catch (error) {
          setMessage(error.message);
        }
      }
      const field = (label, key, maxLength) => h("label", { className: "ls-field" }, t(label), h(Input, { value: draft[key], maxLength, onChange: (event) => patch(key, event.target.value) }));
      const uploadField = (label, key) => h("label", { className: "ls-field" }, t(label), h("input", { type: "file", accept: ACCEPT, disabled: busy, className: "ls-file", onChange: (event) => upload(event, key) }));
      const button = (label, props = {}) => h(Button, { type: "button", variant: "outline", ...props }, t(label));
      const status = h("p", { className: "ls-status", role: "status", "aria-live": "polite" }, busy ? t("loading") : message ? t(Object.hasOwn(en, message) ? message : "invalidImage") : "");
      return h(
        React.Fragment,
        null,
        h(
          "section",
          { className: "dsh-logo-studio", "data-testid": "logo-studio-settings", "aria-labelledby": id },
          h("div", { className: "ls-header" }, h("div", null, h("strong", { id }, t("section")), h("p", null, t("hint"))), button("edit", { onClick: edit, disabled: snapshot.readOnly, "aria-haspopup": "dialog" })),
          snapshot.warning && h("p", { role: "status", className: "ls-warning" }, t(snapshot.warning)),
          !open && message && status
        ),
        h(
          Modal,
          {
            open,
            onClose: close,
            title: t("edit"),
            description: t("hint"),
            closeLabel: t("close"),
            className: "dsh-logo-dialog",
            contentClassName: "ls-modal-content",
            footer: h(
              "div",
              { className: "ls-actions ls-modal-actions" },
              !snapshot.readOnly && snapshot.value.mode !== "original" && button("restore", { onClick: () => setConfirm(true), disabled: busy }),
              button("cancel", { onClick: close }),
              button("save", { type: "submit", form: `${id}-editor`, variant: "primary", disabled: busy || changedElsewhere || snapshot.readOnly })
            )
          },
          h(
            "form",
            { id: `${id}-editor`, className: "ls-editor", onSubmit: save },
            h("label", { className: "ls-field" }, t("mode"), h("select", { "data-modal-autofocus": true, value: draft.mode, onChange: (event) => patch("mode", event.target.value) }, ["original", "text", "image"].map((mode) => h("option", { key: mode, value: mode }, t(mode))))),
            draft.mode !== "original" && h(
              React.Fragment,
              null,
              h("div", { className: "ls-grid" }, field("name", "name", 40), draft.mode === "text" && field("badge", "badge", 16)),
              draft.mode === "image" && h("div", { className: "ls-field" }, uploadField("uploadLogo", "image"), draft.image && button("removeImage", { onClick: () => {
                patch("image", "");
                patch("mode", "text");
              } })),
              h("label", { className: "ls-inline" }, h("input", { type: "checkbox", checked: draft.showIcon, onChange: (event) => patch("showIcon", event.target.checked) }), t("showIcon")),
              draft.showIcon && h("div", { className: "ls-field" }, uploadField("uploadIcon", "icon"), draft.icon && button("removeIcon", { onClick: () => patch("icon", "") })),
              h(
                "div",
                { className: "ls-grid" },
                h("label", { className: "ls-field" }, `${t("height")} \xB7 ${draft.height}px`, h("input", { type: "range", min: 16, max: 40, step: 1, value: draft.height, onChange: (event) => patch("height", Number(event.target.value)) })),
                draft.mode === "text" && h("div", { className: "ls-field" }, h("label", { className: "ls-inline" }, t("color"), h("input", { type: "color", value: draft.color || "#e5e5e5", onChange: (event) => patch("color", event.target.value) })), button("autoColor", { onClick: () => patch("color", "") }))
              ),
              h("p", null, t("fileHint"))
            ),
            h(
              "div",
              { className: "ls-field", role: "group", "aria-label": t("preview") },
              h("strong", null, t("preview")),
              h("div", { className: "ls-preview-grid" }, ["Light", "Dark"].map((theme) => h(
                "div",
                { key: theme },
                h("div", { className: "ls-preview-label" }, t(`preview${theme}`)),
                h(
                  "div",
                  { className: `ls-preview ls-preview-${theme.toLowerCase()}` },
                  (draft.mode === "original" || draft.showIcon) && h(Mark, { value: draft.mode === "original" ? defaults : draft }),
                  h(Name, { value: draft })
                )
              ))),
              h("p", null, t("localOnly"))
            ),
            changedElsewhere && h("p", { role: "alert" }, t("externalChange")),
            status
          )
        ),
        h(Modal, {
          open: open && confirm,
          onClose: () => setConfirm(false),
          title: t("restore"),
          description: t("confirmRestore"),
          closeLabel: t("close"),
          footer: h(
            React.Fragment,
            null,
            button("cancel", { onClick: () => setConfirm(false), "data-modal-autofocus": true }),
            button("confirm", { variant: "primary", onClick: restore, disabled: busy || changedElsewhere || snapshot.readOnly })
          )
        })
      );
    }
    return { Settings, BrandMark, BrandName };
  }

  // src/styles.js
  var css = `
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

  // src/client.js
  window.__ModuleLoader__.load({ id: "@local/dsh-logo-studio", factory: (require2) => {
    const React = require2("react");
    const ui = require2("@deepseek-ai/dsh-client-ui-primitives");
    function apply(ctx) {
      ctx.effect(() => {
        const disposers = [];
        const cleanup = () => {
          for (const dispose of disposers.splice(0).reverse()) dispose();
        };
        try {
          const storage = {
            getItem: (key) => window.localStorage.getItem(key),
            setItem: (key, value) => window.localStorage.setItem(key, value),
            removeItem: (key) => window.localStorage.removeItem(key)
          };
          const controller = createController(storage);
          disposers.push(() => controller.dispose());
          const { Settings, BrandMark, BrandName } = createUI(React, ui, controller);
          const style = document.createElement("style");
          style.dataset.plugin = "@local/dsh-logo-studio";
          style.dataset.pluginCss = "@local/dsh-logo-studio/styles";
          style.textContent = css;
          document.head.append(style);
          disposers.push(() => style.remove());
          disposers.push(ctx.locale.register("logo-studio", { en, pt }));
          disposers.push(ctx.slots.inject("settings.general.item", () => ctx.slots.register({ name: "settings.general.item", id: "logo-studio", order: 10.6, locale: "logo-studio" }, Settings)));
          disposers.push(ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.inject("sidebar.brand.name", () => {
            let marks = [];
            const clear = () => {
              for (const dispose of marks.splice(0).reverse()) dispose();
            };
            function sync() {
              if (controller.getSnapshot().value.mode === "original") {
                clear();
                return;
              }
              if (marks.length) return;
              try {
                marks.push(ctx.slots.register({ name: "sidebar.brand.mark", priority: -100 }, BrandMark));
                marks.push(ctx.slots.register({ name: "sidebar.brand.name", priority: -100 }, BrandName));
              } catch (error) {
                clear();
                throw error;
              }
            }
            sync();
            const unsubscribe = controller.subscribe(sync);
            return () => {
              unsubscribe();
              clear();
            };
          })));
          const changed = (event) => {
            if (event.key === STORAGE_KEY || event.key === null) controller.reload();
          };
          window.addEventListener("storage", changed);
          disposers.push(() => window.removeEventListener("storage", changed));
          return cleanup;
        } catch (error) {
          cleanup();
          throw error;
        }
      });
    }
    return { apply, inject: ["slots", "locale"] };
  } });
})();
//# sourceMappingURL=client.js.map
