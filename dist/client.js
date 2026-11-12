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
  var zh = {
    close: "\u5173\u95ED\u6807\u5FD7\u7F16\u8F91\u5668",
    section: "\u6807\u5FD7\u4E0E\u54C1\u724C",
    hint: "\u81EA\u5B9A\u4E49\u4FA7\u8FB9\u680F\u6807\u5FD7\uFF0C\u4E0D\u4F1A\u66F4\u6539\u5E94\u7528\u6587\u4EF6\u3002",
    edit: "\u81EA\u5B9A\u4E49\u6807\u5FD7",
    mode: "\u6807\u5FD7\u6837\u5F0F",
    original: "\u539F\u59CB\u6837\u5F0F",
    text: "\u6587\u5B57\u4E0E\u5FBD\u7AE0",
    image: "\u81EA\u5B9A\u4E49\u56FE\u7247",
    name: "\u54C1\u724C\u540D\u79F0",
    badge: "\u5FBD\u7AE0\uFF08\u53EF\u9009\uFF09",
    color: "\u6587\u5B57\u989C\u8272",
    autoColor: "\u4F7F\u7528\u4E3B\u9898\u989C\u8272",
    height: "\u6807\u5FD7\u9AD8\u5EA6",
    showIcon: "\u663E\u793A\u72EC\u7ACB\u56FE\u6807",
    uploadLogo: "\u4E0A\u4F20\u6807\u5FD7",
    uploadIcon: "\u4E0A\u4F20\u56FE\u6807",
    removeIcon: "\u4F7F\u7528\u539F\u59CB\u56FE\u6807",
    removeImage: "\u79FB\u9664\u56FE\u7247",
    fileHint: "PNG\u3001JPG\u3001WebP \u6216\u81EA\u5305\u542B\u7684 SVG \xB7 \u6700\u5927 2 MB\u3002\u56FE\u7247\u4EC5\u4FDD\u5B58\u5728\u6B64\u6D4F\u89C8\u5668\u4E2D\u3002",
    preview: "\u9884\u89C8",
    previewLight: "\u6D45\u8272\u80CC\u666F",
    previewDark: "\u6DF1\u8272\u80CC\u666F",
    save: "\u4FDD\u5B58\u66F4\u6539",
    cancel: "\u53D6\u6D88",
    restore: "\u6062\u590D\u539F\u59CB\u6837\u5F0F",
    confirmRestore: "\u6062\u590D\u539F\u59CB\u6807\u5FD7\u5E76\u79FB\u9664\u5DF2\u4FDD\u5B58\u7684\u81EA\u5B9A\u4E49\u8BBE\u7F6E\uFF1F",
    confirm: "\u662F\uFF0C\u6062\u590D",
    saved: "\u6807\u5FD7\u5DF2\u4FDD\u5B58\uFF0C\u4FA7\u8FB9\u680F\u5DF2\u66F4\u65B0\u3002",
    restored: "\u5DF2\u6062\u590D\u539F\u59CB\u6807\u5FD7\u3002",
    loading: "\u6B63\u5728\u5904\u7406\u56FE\u7247\u2026",
    storageError: "\u65E0\u6CD5\u5728\u672C\u5730\u4FDD\u5B58\u3002\u8BF7\u68C0\u67E5\u6D4F\u89C8\u5668\u5B58\u50A8\u6743\u9650\u6216\u53EF\u7528\u7A7A\u95F4\u3002\u5F53\u524D\u6807\u5FD7\u672A\u88AB\u66F4\u6539\u3002",
    recovered: "\u65E0\u6CD5\u8BFB\u53D6\u5DF2\u4FDD\u5B58\u7684\u6807\u5FD7\u8BBE\u7F6E\uFF0C\u6B63\u5728\u4F7F\u7528\u539F\u59CB\u6807\u5FD7\u3002",
    futureVersion: "\u8FD9\u4E9B\u8BBE\u7F6E\u7531\u8F83\u65B0\u7248\u672C\u7684\u63D2\u4EF6\u4FDD\u5B58\u3002\u8BF7\u66F4\u65B0\u63D2\u4EF6\u540E\u518D\u7F16\u8F91\u3002",
    invalidSettings: "\u6807\u5FD7\u8BBE\u7F6E\u65E0\u6548\u3002",
    invalidName: "\u8BF7\u8F93\u5165\u4E0D\u8D85\u8FC7 40 \u4E2A\u5B57\u7B26\u7684\u54C1\u724C\u540D\u79F0\u3002",
    invalidBadge: "\u5FBD\u7AE0\u6700\u591A\u53EF\u5305\u542B 16 \u4E2A\u5B57\u7B26\u3002",
    invalidColor: "\u8BF7\u4F7F\u7528\u516D\u4F4D HEX \u989C\u8272\u3002",
    imageRequired: "\u8BF7\u5148\u4E0A\u4F20\u6807\u5FD7\u56FE\u7247\u3002",
    invalidImage: "\u65E0\u6CD5\u52A0\u8F7D\u6B64\u56FE\u7247\u3002",
    fileTooLarge: "\u8BF7\u9009\u62E9\u4E0D\u8D85\u8FC7 2 MB \u7684\u56FE\u7247\uFF08\u4F18\u5316\u540E\u7684\u7ED3\u679C\u5FC5\u987B\u5C0F\u4E8E 550 KB\uFF09\u3002",
    fileType: "\u8BF7\u4F7F\u7528 PNG\u3001JPG\u3001WebP \u6216 SVG\u3002",
    unsafeSvg: "\u8BF7\u4F7F\u7528\u4E0D\u542B\u811A\u672C\u3001\u6837\u5F0F\u3001\u52A8\u753B\u6216\u5916\u90E8\u8D44\u6E90\u7684\u81EA\u5305\u542B SVG\uFF0C\u6216\u5C06\u5176\u5BFC\u51FA\u4E3A PNG\u3002",
    imageDimensions: "\u56FE\u7247\u6BCF\u8FB9\u4E0D\u5F97\u8D85\u8FC7 8192 px\uFF0C\u603B\u50CF\u7D20\u4E0D\u5F97\u8D85\u8FC7 1600 \u4E07\u3002",
    unavailable: "\u63D2\u4EF6\u5DF2\u505C\u7528\u3002",
    externalChange: "\u6807\u5FD7\u5DF2\u5728\u53E6\u4E00\u4E2A\u7A97\u53E3\u4E2D\u66F4\u6539\u3002\u8BF7\u91CD\u65B0\u6253\u5F00\u7F16\u8F91\u5668\u4EE5\u52A0\u8F7D\u6700\u65B0\u7248\u672C\u3002",
    localOnly: "\u4EC5\u5BF9\u6B64\u6D4F\u89C8\u5668\uFF0F\u914D\u7F6E\u6863\u6848\u751F\u6548\uFF0C\u5305\u62EC\u6298\u53E0\u7684\u4FA7\u8FB9\u680F\u3002\u4E0D\u4F1A\u66F4\u6539\u5E94\u7528\u56FE\u6807\u6216\u7A97\u53E3\u6807\u9898\u3002"
  };
  var ja = {
    close: "\u30ED\u30B4\u30A8\u30C7\u30A3\u30BF\u30FC\u3092\u9589\u3058\u308B",
    section: "\u30ED\u30B4\u3068\u30D6\u30E9\u30F3\u30C9",
    hint: "\u30A2\u30D7\u30EA\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u5909\u66F4\u305B\u305A\u306B\u3001\u30B5\u30A4\u30C9\u30D0\u30FC\u306E\u30ED\u30B4\u3092\u30AB\u30B9\u30BF\u30DE\u30A4\u30BA\u3067\u304D\u307E\u3059\u3002",
    edit: "\u30ED\u30B4\u3092\u30AB\u30B9\u30BF\u30DE\u30A4\u30BA",
    mode: "\u30ED\u30B4\u306E\u30B9\u30BF\u30A4\u30EB",
    original: "\u5143\u306E\u30ED\u30B4",
    text: "\u6587\u5B57\u3068\u30D0\u30C3\u30B8",
    image: "\u30AB\u30B9\u30BF\u30E0\u753B\u50CF",
    name: "\u30D6\u30E9\u30F3\u30C9\u540D",
    badge: "\u30D0\u30C3\u30B8\uFF08\u4EFB\u610F\uFF09",
    color: "\u6587\u5B57\u8272",
    autoColor: "\u30C6\u30FC\u30DE\u306E\u8272\u3092\u4F7F\u7528",
    height: "\u30ED\u30B4\u306E\u9AD8\u3055",
    showIcon: "\u72EC\u7ACB\u3057\u305F\u30A2\u30A4\u30B3\u30F3\u3092\u8868\u793A",
    uploadLogo: "\u30ED\u30B4\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9",
    uploadIcon: "\u30A2\u30A4\u30B3\u30F3\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9",
    removeIcon: "\u5143\u306E\u30A2\u30A4\u30B3\u30F3\u3092\u4F7F\u7528",
    removeImage: "\u753B\u50CF\u3092\u524A\u9664",
    fileHint: "PNG\u3001JPG\u3001WebP\u3001\u307E\u305F\u306F\u81EA\u5DF1\u5B8C\u7D50\u578B SVG \xB7 \u6700\u5927 2 MB\u3002\u753B\u50CF\u306F\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u30FC\u306B\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002",
    preview: "\u30D7\u30EC\u30D3\u30E5\u30FC",
    previewLight: "\u660E\u308B\u3044\u80CC\u666F",
    previewDark: "\u6697\u3044\u80CC\u666F",
    save: "\u5909\u66F4\u3092\u4FDD\u5B58",
    cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
    restore: "\u5143\u306B\u623B\u3059",
    confirmRestore: "\u5143\u306E\u30ED\u30B4\u306B\u623B\u3057\u3001\u4FDD\u5B58\u3057\u305F\u30AB\u30B9\u30BF\u30DE\u30A4\u30BA\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F",
    confirm: "\u306F\u3044\u3001\u5143\u306B\u623B\u3059",
    saved: "\u30ED\u30B4\u3092\u4FDD\u5B58\u3057\u3001\u30B5\u30A4\u30C9\u30D0\u30FC\u3092\u66F4\u65B0\u3057\u307E\u3057\u305F\u3002",
    restored: "\u5143\u306E\u30ED\u30B4\u306B\u623B\u3057\u307E\u3057\u305F\u3002",
    loading: "\u753B\u50CF\u3092\u51E6\u7406\u4E2D\u2026",
    storageError: "\u30ED\u30FC\u30AB\u30EB\u306B\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30D6\u30E9\u30A6\u30B6\u30FC\u306E\u30B9\u30C8\u30EC\u30FC\u30B8\u6A29\u9650\u3084\u7A7A\u304D\u5BB9\u91CF\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u73FE\u5728\u306E\u30ED\u30B4\u306F\u5909\u66F4\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002",
    recovered: "\u4FDD\u5B58\u3057\u305F\u30ED\u30B4\u8A2D\u5B9A\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u5143\u306E\u30ED\u30B4\u3092\u4F7F\u7528\u3057\u3066\u3044\u307E\u3059\u3002",
    futureVersion: "\u3053\u306E\u8A2D\u5B9A\u306F\u65B0\u3057\u3044\u30D0\u30FC\u30B8\u30E7\u30F3\u306E\u30D7\u30E9\u30B0\u30A4\u30F3\u3067\u4FDD\u5B58\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u7DE8\u96C6\u3059\u308B\u306B\u306F\u30D7\u30E9\u30B0\u30A4\u30F3\u3092\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    invalidSettings: "\u30ED\u30B4\u8A2D\u5B9A\u304C\u7121\u52B9\u3067\u3059\u3002",
    invalidName: "\u30D6\u30E9\u30F3\u30C9\u540D\u3092 40 \u6587\u5B57\u4EE5\u5185\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    invalidBadge: "\u30D0\u30C3\u30B8\u306F 16 \u6587\u5B57\u4EE5\u5185\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    invalidColor: "6 \u6841\u306E HEX \u30AB\u30E9\u30FC\u3092\u4F7F\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    imageRequired: "\u5148\u306B\u30ED\u30B4\u753B\u50CF\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    invalidImage: "\u3053\u306E\u753B\u50CF\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
    fileTooLarge: "2 MB \u4EE5\u4E0B\u306E\u753B\u50CF\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u6700\u9069\u5316\u5F8C\u306E\u30B5\u30A4\u30BA\u306F 550 KB \u672A\u6E80\u3067\u3042\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\uFF09\u3002",
    fileType: "PNG\u3001JPG\u3001WebP\u3001\u307E\u305F\u306F SVG \u3092\u4F7F\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    unsafeSvg: "\u30B9\u30AF\u30EA\u30D7\u30C8\u3001\u30B9\u30BF\u30A4\u30EB\u3001\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u3001\u5916\u90E8\u30EA\u30BD\u30FC\u30B9\u3092\u542B\u307E\u306A\u3044\u81EA\u5DF1\u5B8C\u7D50\u578B SVG \u3092\u4F7F\u7528\u3059\u308B\u304B\u3001PNG \u306B\u66F8\u304D\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    imageDimensions: "\u5404\u8FBA 8192 px \u4EE5\u4E0B\u3001\u5408\u8A08 1600 \u4E07\u753B\u7D20\u4EE5\u4E0B\u306E\u753B\u50CF\u3092\u4F7F\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    unavailable: "\u30D7\u30E9\u30B0\u30A4\u30F3\u306F\u7121\u52B9\u306B\u306A\u3063\u3066\u3044\u307E\u3059\u3002",
    externalChange: "\u5225\u306E\u30A6\u30A3\u30F3\u30C9\u30A6\u3067\u30ED\u30B4\u304C\u5909\u66F4\u3055\u308C\u307E\u3057\u305F\u3002\u6700\u65B0\u7248\u3092\u8AAD\u307F\u8FBC\u3080\u306B\u306F\u30A8\u30C7\u30A3\u30BF\u30FC\u3092\u958B\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    localOnly: "\u6298\u308A\u305F\u305F\u3093\u3060\u30B5\u30A4\u30C9\u30D0\u30FC\u3092\u542B\u3081\u3001\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u30FC\uFF0F\u30D7\u30ED\u30D5\u30A1\u30A4\u30EB\u306B\u9069\u7528\u3055\u308C\u307E\u3059\u3002\u30A2\u30D7\u30EA\u306E\u30A2\u30A4\u30B3\u30F3\u3084\u30A6\u30A3\u30F3\u30C9\u30A6\u306E\u30BF\u30A4\u30C8\u30EB\u306F\u5909\u308F\u308A\u307E\u305B\u3093\u3002"
  };
  var es = {
    close: "Cerrar el editor de logotipos",
    section: "Logotipo y marca",
    hint: "Personaliza el logotipo de la barra lateral sin cambiar los archivos de la aplicaci\xF3n.",
    edit: "Personalizar logotipo",
    mode: "Estilo del logotipo",
    original: "Original",
    text: "Texto e insignia",
    image: "Imagen personalizada",
    name: "Nombre de la marca",
    badge: "Insignia (opcional)",
    color: "Color del texto",
    autoColor: "Usar el color del tema",
    height: "Altura del logotipo",
    showIcon: "Mostrar icono independiente",
    uploadLogo: "Subir logotipo",
    uploadIcon: "Subir icono",
    removeIcon: "Usar el icono original",
    removeImage: "Eliminar imagen",
    fileHint: "PNG, JPG, WebP o SVG autocontenido \xB7 hasta 2 MB. Las im\xE1genes se guardan en este navegador.",
    preview: "Vista previa",
    previewLight: "Fondo claro",
    previewDark: "Fondo oscuro",
    save: "Guardar cambios",
    cancel: "Cancelar",
    restore: "Restaurar el original",
    confirmRestore: "\xBFRestaurar el logotipo original y eliminar tu personalizaci\xF3n guardada?",
    confirm: "S\xED, restaurar",
    saved: "Logotipo guardado. Se ha actualizado la barra lateral.",
    restored: "Logotipo original restaurado.",
    loading: "Procesando imagen\u2026",
    storageError: "No se pudo guardar localmente. Comprueba los permisos de almacenamiento del navegador o el espacio disponible. Tu logotipo actual no ha cambiado.",
    recovered: "No se pudo leer la configuraci\xF3n guardada del logotipo. Se est\xE1 usando el original.",
    futureVersion: "La configuraci\xF3n se guard\xF3 con una versi\xF3n m\xE1s reciente del plugin. Actual\xEDzalo para editarla.",
    invalidSettings: "Configuraci\xF3n de logotipo no v\xE1lida.",
    invalidName: "Introduce un nombre de marca de hasta 40 caracteres.",
    invalidBadge: "La insignia debe tener como m\xE1ximo 16 caracteres.",
    invalidColor: "Usa un color HEX de seis d\xEDgitos.",
    imageRequired: "Primero sube una imagen del logotipo.",
    invalidImage: "No se pudo cargar esta imagen.",
    fileTooLarge: "Elige una imagen de hasta 2 MB (el resultado optimizado debe ser inferior a 550 KB).",
    fileType: "Usa PNG, JPG, WebP o SVG.",
    unsafeSvg: "Usa un SVG autocontenido sin scripts, estilos, animaciones ni recursos externos, o exp\xF3rtalo como PNG.",
    imageDimensions: "Usa una imagen de hasta 8192 px por lado y 16 megap\xEDxeles.",
    unavailable: "El plugin ya no est\xE1 activo.",
    externalChange: "El logotipo ha cambiado en otra ventana. Vuelve a abrir el editor para cargar la \xFAltima versi\xF3n.",
    localOnly: "Se aplica a este navegador/perfil, incluida la barra lateral contra\xEDda. No cambia el icono de la aplicaci\xF3n ni el t\xEDtulo de la ventana."
  };
  var fr = {
    close: "Fermer l\u2019\xE9diteur de logo",
    section: "Logo et marque",
    hint: "Personnalisez le logo de la barre lat\xE9rale sans modifier les fichiers de l\u2019application.",
    edit: "Personnaliser le logo",
    mode: "Style du logo",
    original: "Original",
    text: "Texte et badge",
    image: "Image personnalis\xE9e",
    name: "Nom de la marque",
    badge: "Badge (facultatif)",
    color: "Couleur du texte",
    autoColor: "Utiliser la couleur du th\xE8me",
    height: "Hauteur du logo",
    showIcon: "Afficher une ic\xF4ne s\xE9par\xE9e",
    uploadLogo: "Importer un logo",
    uploadIcon: "Importer une ic\xF4ne",
    removeIcon: "Utiliser l\u2019ic\xF4ne d\u2019origine",
    removeImage: "Supprimer l\u2019image",
    fileHint: "PNG, JPG, WebP ou SVG autonome \xB7 jusqu\u2019\xE0 2 Mo. Les images restent dans ce navigateur.",
    preview: "Aper\xE7u",
    previewLight: "Fond clair",
    previewDark: "Fond sombre",
    save: "Enregistrer les modifications",
    cancel: "Annuler",
    restore: "R\xE9tablir l\u2019original",
    confirmRestore: "R\xE9tablir le logo d\u2019origine et supprimer votre personnalisation enregistr\xE9e ?",
    confirm: "Oui, r\xE9tablir",
    saved: "Logo enregistr\xE9. La barre lat\xE9rale a \xE9t\xE9 mise \xE0 jour.",
    restored: "Logo d\u2019origine r\xE9tabli.",
    loading: "Traitement de l\u2019image\u2026",
    storageError: "Impossible d\u2019enregistrer localement. V\xE9rifiez les autorisations de stockage du navigateur ou l\u2019espace disponible. Votre logo actuel n\u2019a pas \xE9t\xE9 modifi\xE9.",
    recovered: "Impossible de lire les r\xE9glages du logo enregistr\xE9s. Le logo d\u2019origine est utilis\xE9.",
    futureVersion: "Ces r\xE9glages ont \xE9t\xE9 enregistr\xE9s par une version plus r\xE9cente du plugin. Mettez-le \xE0 jour pour les modifier.",
    invalidSettings: "R\xE9glages du logo invalides.",
    invalidName: "Saisissez un nom de marque de 40 caract\xE8res maximum.",
    invalidBadge: "Le badge doit comporter au maximum 16 caract\xE8res.",
    invalidColor: "Utilisez une couleur HEX \xE0 six chiffres.",
    imageRequired: "Importez d\u2019abord une image de logo.",
    invalidImage: "Impossible de charger cette image.",
    fileTooLarge: "Choisissez une image de 2 Mo maximum (le r\xE9sultat optimis\xE9 doit \xEAtre inf\xE9rieur \xE0 550 Ko).",
    fileType: "Utilisez PNG, JPG, WebP ou SVG.",
    unsafeSvg: "Utilisez un SVG autonome sans scripts, styles, animations ni ressources externes, ou exportez-le en PNG.",
    imageDimensions: "Utilisez une image de 8192 px maximum par c\xF4t\xE9 et de 16 m\xE9gapixels maximum.",
    unavailable: "Le plugin n\u2019est plus actif.",
    externalChange: "Le logo a chang\xE9 dans une autre fen\xEAtre. Rouvrez l\u2019\xE9diteur pour charger la derni\xE8re version.",
    localOnly: "S\u2019applique \xE0 ce navigateur/profil, y compris \xE0 la barre lat\xE9rale r\xE9duite. Ne modifie ni l\u2019ic\xF4ne de l\u2019application ni le titre de la fen\xEAtre."
  };
  var de = {
    close: "Logoeditor schlie\xDFen",
    section: "Logo und Marke",
    hint: "Passe das Logo in der Seitenleiste an, ohne Anwendungsdateien zu \xE4ndern.",
    edit: "Logo anpassen",
    mode: "Logostil",
    original: "Original",
    text: "Text und Abzeichen",
    image: "Eigenes Bild",
    name: "Markenname",
    badge: "Abzeichen (optional)",
    color: "Textfarbe",
    autoColor: "Designfarbe verwenden",
    height: "Logoh\xF6he",
    showIcon: "Separates Symbol anzeigen",
    uploadLogo: "Logo hochladen",
    uploadIcon: "Symbol hochladen",
    removeIcon: "Originalsymbol verwenden",
    removeImage: "Bild entfernen",
    fileHint: "PNG, JPG, WebP oder eigenst\xE4ndiges SVG \xB7 bis zu 2 MB. Bilder bleiben in diesem Browser.",
    preview: "Vorschau",
    previewLight: "Heller Hintergrund",
    previewDark: "Dunkler Hintergrund",
    save: "\xC4nderungen speichern",
    cancel: "Abbrechen",
    restore: "Original wiederherstellen",
    confirmRestore: "Das urspr\xFCngliche Logo wiederherstellen und deine gespeicherte Anpassung entfernen?",
    confirm: "Ja, wiederherstellen",
    saved: "Logo gespeichert. Die Seitenleiste wurde aktualisiert.",
    restored: "Urspr\xFCngliches Logo wiederhergestellt.",
    loading: "Bild wird verarbeitet\u2026",
    storageError: "Lokales Speichern fehlgeschlagen. Pr\xFCfe die Speicherberechtigungen des Browsers oder den verf\xFCgbaren Platz. Dein aktuelles Logo wurde nicht ver\xE4ndert.",
    recovered: "Die gespeicherten Logoeinstellungen konnten nicht gelesen werden. Das urspr\xFCngliche Logo wird verwendet.",
    futureVersion: "Diese Einstellungen wurden mit einer neueren Pluginversion gespeichert. Aktualisiere das Plugin, um sie zu bearbeiten.",
    invalidSettings: "Ung\xFCltige Logoeinstellungen.",
    invalidName: "Gib einen Markennamen mit bis zu 40 Zeichen ein.",
    invalidBadge: "Das Abzeichen darf h\xF6chstens 16 Zeichen enthalten.",
    invalidColor: "Verwende eine sechsstellige HEX-Farbe.",
    imageRequired: "Lade zuerst ein Logobild hoch.",
    invalidImage: "Dieses Bild konnte nicht geladen werden.",
    fileTooLarge: "W\xE4hle ein Bild mit bis zu 2 MB (das optimierte Ergebnis muss kleiner als 550 KB sein).",
    fileType: "Verwende PNG, JPG, WebP oder SVG.",
    unsafeSvg: "Verwende ein eigenst\xE4ndiges SVG ohne Skripte, Stile, Animationen oder externe Ressourcen, oder exportiere es als PNG.",
    imageDimensions: "Verwende ein Bild mit h\xF6chstens 8192 px pro Seite und 16 Megapixeln.",
    unavailable: "Das Plugin ist nicht mehr aktiv.",
    externalChange: "Das Logo wurde in einem anderen Fenster ge\xE4ndert. \xD6ffne den Editor erneut, um die aktuelle Version zu laden.",
    localOnly: "Gilt f\xFCr diesen Browser/dieses Profil, auch bei eingeklappter Seitenleiste. \xC4ndert weder das Anwendungssymbol noch den Fenstertitel."
  };
  var ru = {
    close: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440 \u043B\u043E\u0433\u043E\u0442\u0438\u043F\u0430",
    section: "\u041B\u043E\u0433\u043E\u0442\u0438\u043F \u0438 \u0431\u0440\u0435\u043D\u0434",
    hint: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u043B\u043E\u0433\u043E\u0442\u0438\u043F \u0432 \u0431\u043E\u043A\u043E\u0432\u043E\u0439 \u043F\u0430\u043D\u0435\u043B\u0438 \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0444\u0430\u0439\u043B\u043E\u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F.",
    edit: "\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043B\u043E\u0433\u043E\u0442\u0438\u043F",
    mode: "\u0421\u0442\u0438\u043B\u044C \u043B\u043E\u0433\u043E\u0442\u0438\u043F\u0430",
    original: "\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439",
    text: "\u0422\u0435\u043A\u0441\u0442 \u0438 \u0437\u043D\u0430\u0447\u043E\u043A",
    image: "\u0421\u0432\u043E\u0451 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435",
    name: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0431\u0440\u0435\u043D\u0434\u0430",
    badge: "\u0417\u043D\u0430\u0447\u043E\u043A (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)",
    color: "\u0426\u0432\u0435\u0442 \u0442\u0435\u043A\u0441\u0442\u0430",
    autoColor: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0446\u0432\u0435\u0442 \u0442\u0435\u043C\u044B",
    height: "\u0412\u044B\u0441\u043E\u0442\u0430 \u043B\u043E\u0433\u043E\u0442\u0438\u043F\u0430",
    showIcon: "\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u0438\u043A\u043E\u043D\u043A\u0443",
    uploadLogo: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043B\u043E\u0433\u043E\u0442\u0438\u043F",
    uploadIcon: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0438\u043A\u043E\u043D\u043A\u0443",
    removeIcon: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u0438\u043A\u043E\u043D\u043A\u0443",
    removeImage: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435",
    fileHint: "PNG, JPG, WebP \u0438\u043B\u0438 \u0430\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u044B\u0439 SVG \xB7 \u0434\u043E 2 \u041C\u0411. \u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435.",
    preview: "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440",
    previewLight: "\u0421\u0432\u0435\u0442\u043B\u044B\u0439 \u0444\u043E\u043D",
    previewDark: "\u0422\u0451\u043C\u043D\u044B\u0439 \u0444\u043E\u043D",
    save: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
    cancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
    restore: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439",
    confirmRestore: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043B\u043E\u0433\u043E\u0442\u0438\u043F \u0438 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438?",
    confirm: "\u0414\u0430, \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C",
    saved: "\u041B\u043E\u0433\u043E\u0442\u0438\u043F \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D. \u0411\u043E\u043A\u043E\u0432\u0430\u044F \u043F\u0430\u043D\u0435\u043B\u044C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0430.",
    restored: "\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043B\u043E\u0433\u043E\u0442\u0438\u043F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D.",
    loading: "\u041E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F\u2026",
    storageError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0430 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u0438\u043B\u0438 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E\u0435 \u043C\u0435\u0441\u0442\u043E. \u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043B\u043E\u0433\u043E\u0442\u0438\u043F \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D.",
    recovered: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043B\u043E\u0433\u043E\u0442\u0438\u043F\u0430. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043B\u043E\u0433\u043E\u0442\u0438\u043F.",
    futureVersion: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B \u0431\u043E\u043B\u0435\u0435 \u043D\u043E\u0432\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0435\u0439 \u043F\u043B\u0430\u0433\u0438\u043D\u0430. \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u043F\u043B\u0430\u0433\u0438\u043D \u0434\u043B\u044F \u0438\u0445 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F.",
    invalidSettings: "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043B\u043E\u0433\u043E\u0442\u0438\u043F\u0430.",
    invalidName: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0431\u0440\u0435\u043D\u0434\u0430 \u0434\u043B\u0438\u043D\u043E\u0439 \u0434\u043E 40 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432.",
    invalidBadge: "\u0417\u043D\u0430\u0447\u043E\u043A \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u043D\u0435 \u0431\u043E\u043B\u0435\u0435 16 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432.",
    invalidColor: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0448\u0435\u0441\u0442\u0438\u0437\u043D\u0430\u0447\u043D\u044B\u0439 \u0446\u0432\u0435\u0442 HEX.",
    imageRequired: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043B\u043E\u0433\u043E\u0442\u0438\u043F\u0430.",
    invalidImage: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435.",
    fileTooLarge: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u043C \u0434\u043E 2 \u041C\u0411 (\u043F\u043E\u0441\u043B\u0435 \u043E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u0438 \u043E\u043D\u043E \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043C\u0435\u043D\u044C\u0448\u0435 550 \u041A\u0411).",
    fileType: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 PNG, JPG, WebP \u0438\u043B\u0438 SVG.",
    unsafeSvg: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0430\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u044B\u0439 SVG \u0431\u0435\u0437 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432, \u0441\u0442\u0438\u043B\u0435\u0439, \u0430\u043D\u0438\u043C\u0430\u0446\u0438\u0438 \u0438 \u0432\u043D\u0435\u0448\u043D\u0438\u0445 \u0440\u0435\u0441\u0443\u0440\u0441\u043E\u0432 \u0438\u043B\u0438 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u0435\u0433\u043E \u0432 PNG.",
    imageDimensions: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043D\u0435 \u0431\u043E\u043B\u0435\u0435 8192 px \u043F\u043E \u043A\u0430\u0436\u0434\u043E\u0439 \u0441\u0442\u043E\u0440\u043E\u043D\u0435 \u0438 16 \u043C\u0435\u0433\u0430\u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439.",
    unavailable: "\u041F\u043B\u0430\u0433\u0438\u043D \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0435\u043D.",
    externalChange: "\u041B\u043E\u0433\u043E\u0442\u0438\u043F \u0438\u0437\u043C\u0435\u043D\u0451\u043D \u0432 \u0434\u0440\u0443\u0433\u043E\u043C \u043E\u043A\u043D\u0435. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440 \u0437\u0430\u043D\u043E\u0432\u043E, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044E\u044E \u0432\u0435\u0440\u0441\u0438\u044E.",
    localOnly: "\u041F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u043A \u044D\u0442\u043E\u043C\u0443 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0443/\u043F\u0440\u043E\u0444\u0438\u043B\u044E, \u0432 \u0442\u043E\u043C \u0447\u0438\u0441\u043B\u0435 \u043A \u0441\u0432\u0451\u0440\u043D\u0443\u0442\u043E\u0439 \u0431\u043E\u043A\u043E\u0432\u043E\u0439 \u043F\u0430\u043D\u0435\u043B\u0438. \u041D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u0438\u043A\u043E\u043D\u043A\u0443 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0438\u043B\u0438 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u043E\u043A\u043D\u0430."
  };
  var dictionaries = { en, pt, "pt-BR": pt, zh, ja, es, fr, de, ru };

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
          disposers.push(ctx.locale.register("logo-studio", dictionaries));
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
