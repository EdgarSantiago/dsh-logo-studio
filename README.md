# Logo studio for DeepSeek Harness

Personalize the sidebar logo, brand name, badge and separate icon from **Settings → General → Logo & brand → Customize logo**, with a light/dark preview and a restore-original action.

**Category:** UI & Experience · **Package:** `@local/dsh-logo-studio` · **Version:** 0.2.1 · **License:** MIT for original plugin code; see [third-party notices](<THIRD_PARTY.md>).

Independent community plugin; not affiliated with DeepSeek AI. The package keeps its existing `@local/` identity so installed profiles are not silently migrated.

## Install from GitHub

Requires **DeepSeek Harness `0.2.2-rc.1` or `0.2.2-rc.2`**, a managed **Web or Desktop** profile and **Node.js 24.11+**.

**Web profile**

```sh
dsh plugin --profile web add github:EdgarSantiago/dsh-logo-studio
```

**Desktop profile**

```sh
dsh plugin --profile desktop add github:EdgarSantiago/dsh-logo-studio
```

Run the command for your active profile. Follow Plugin Manager's activation/restart instructions, then open **Settings → General → Logo & brand**. In Portuguese: **Configurações → Geral → Logo e marca → Personalizar logo**.

This is **GitHub source-only distribution**, not an npm release. `private: true` prevents accidental npm publication; it does not require a private GitHub repository. The committed `index.js` and `dist/client.js` load without a development build, development dependencies or `install`/`prepare`/`prepack` hooks. Keep compiled artifacts with their matching source revision.

Disable or remove it in Plugin Manager. Disabling immediately releases the custom slots so the original brand can appear; the customization stays saved for later reactivation. Updates are not automatic: install reviewed revisions through the same manager and follow its reload guidance. No second server or application-file patch is required.

## Use

- Choose original branding, custom text or a complete logo image.
- Set the name, optional badge, color and height. Use a separate icon or hide it when the image already includes one.
- Read the light/dark preview before saving. Cancel discards the draft without changing the active brand.
- PNG, JPEG, WebP and restricted self-contained SVG uploads are supported. SVG is checked and rasterized before storage; it is never inserted as active markup.
- **Restore original** asks for confirmation and removes only the plugin's saved key. Original slot occupants are preserved, not reconstructed.
- English and Portuguese UI follow Harness's language setting.

The plugin changes only the sidebar brand, including the collapsed rail. It does **not** change the application icon, window title, conversation startup animation or Harness files. The original DeepSeek mark is supplied by Harness, not copied into this repository.

## Permissions, data and limitations

- Browser-side feature. The Host entry is a no-op; it registers no tools, model requests, terminal commands, filesystem writes or external network services.
- Reads files only after the user selects them in the image picker; files are decoded locally, not uploaded. Uses `localStorage` exclusively under `dsh-logo-studio:v1`.
- State belongs to the browser/origin. It does not automatically synchronize between devices or separate Desktop/Web origins.
- Input files are limited to 2 MB. Rasterized results are bounded to 1200×320 for logos and 256×256 for icons, preserving aspect ratio. Only bounded raster data URLs are persisted; remote image URLs are not accepted.
- Unsafe SVG scripts, event attributes, external resources, styles and animations are rejected. This is validation, not a promise that every arbitrary image format is safe in every browser.
- Storage failures preserve the active logo and show feedback. Future-format saved data remains read-only; changes in another window require reopening an old draft rather than silently overwriting them.
- Uses additive `settings.general.item` and priority-based `sidebar.brand.mark` / `sidebar.brand.name` contributions. Contrast adaptation observes the plugin's own ancestors and theme styles; it does not persist a recolored copy over the user's original image.
- User-provided brands/images retain their own copyright and trademark rights. The repository does not include personal uploaded images. Plugins run with Harness's trust; install only reviewed code.

## Compatibility and actual verification

Only `0.2.2-rc.1 || 0.2.2-rc.2` is admitted by the manifest. The development SDK remains on rc.1. The rc.2 compatibility pass observed `logo-studio` registered in the live `settings.general.item` slot; native branding contracts were also checked. Development was on macOS; other operating systems and future releases are not visually certified.

Node tests cover storage/validation, contrast logic, real SDK slot priority/restoration, unload cleanup and compiled artifact contracts. Test doubles isolate browser inputs. The optional historical browser fixture is a separate test page, not evidence of the current installed application's appearance. Publication preparation does not launch that page, fabricate a screenshot or claim a fresh live visual review. Actual automated check output is recorded below; no optional feature image is declared.

### Actual automated output (2026-11-12)

The publication preparation ran the commands below on the existing checkout, without installing the plugin or launching a browser:

```text
npm test: esbuild completed
Node tests: 19 tests, 19 passed, 0 failed
npm pack --dry-run --ignore-scripts --json: 11 runtime/resource files
Clean runtime copy: Host apply + Client syntax/ModuleLoader factory passed
Rebuilt dist artifacts: byte-identical to the previous runtime
```

The clean-copy check had no package-local `node_modules` and did not run a development build. It verifies resources and basic loadability, not a remote GitHub installation or visual behavior. The SVG icon is structurally valid; rendered icon/details appearance is not certified.

## Develop and validate

```sh
npm ci
npm test
npm run build
npm pack --dry-run --ignore-scripts --json
```

`npm test` rebuilds using esbuild and runs Node's built-in tests. React and native UI primitives are loaded from the Harness module table, not bundled into the distributed Client. No server, plugin installation or npm publication is performed by these commands.

After runtime edits, regenerate and version **all of `dist/`**, including the source map. Keep `index.js`, the manifest/patch, icon, display locales and licenses with it. Never version `node_modules`, archives, `test-results`, logs, compiled browser fixtures or private images. The optional `npm run test:browser` uses an existing Playwright browser and an isolated fixture; its generated output must remain ignored and must not be represented as a live Harness screenshot.

## Community listing and license

The public repository should use the GitHub topic `dsh-plugin` and category **UI & Experience**, following [the submission requirements](https://dsh-plugin.org/submit). Creating the public repository and setting its topics are separate maintainer actions. Source-only repositories can be indexed on the website; in-app Plugin Hub discovery also requires an npm publication, which is intentionally not performed here. No listing or review status is claimed.

[LICENSE](<LICENSE>) covers original plugin code, documentation and the abstract metadata icon. Harness/React and user-selected images keep their own licenses; see [THIRD_PARTY.md](<THIRD_PARTY.md>).
