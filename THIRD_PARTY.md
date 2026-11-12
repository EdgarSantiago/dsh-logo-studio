# Third-party notices

The repository's MIT license covers Edgar Santiago's original plugin code, documentation and metadata icon only. It does not relicense third-party works, trademarks or images selected by users.

## Runtime boundaries

The committed Client bundle contains only this repository's `src/` modules. It obtains React, native UI primitives, `FishLogo` and `BrandWordmark` from the running DeepSeek Harness module table; it does not copy or embed their implementation or brand artwork. Harness's SDK is MIT-licensed by DeepSeek. React is MIT-licensed by Meta Platforms, Inc. and affiliates; their licenses remain with the separately distributed Harness/React packages.

The optional browser-test fixture imports separately installed React and Harness SDK packages. Compiled fixtures, browser output, personal images and `node_modules` must not be published with this repository. Other development dependencies retain their own package licenses; their presence in the lockfile does not transfer ownership to this plugin.

## Brands and user images

DeepSeek's name, fish mark and wordmark remain the property of their respective owners. The plugin's original metadata icon is an abstract image frame, not a DeepSeek mark. Users are responsible for having permission to use and redistribute images they choose in the editor; no user-uploaded images are included in this repository. This is an independent community plugin, not an official DeepSeek product.
