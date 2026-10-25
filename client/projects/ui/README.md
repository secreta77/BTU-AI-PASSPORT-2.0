# BTU UI library (`@btu/ui`)

Small reusable UI kit. No app services, no HTTP, no translations: all texts come in through inputs.
A UI piece used in two places goes here.

## What is inside

| Component | Selector | Inputs / outputs |
|---|---|---|
| `Skeleton` | `ui-skeleton` | `variant`: `line`, `line-short`, `title`, `block`, `square` |
| `StatusBadge` | `ui-status-badge` | `variant`: `latest` / `outdated`, `label` (text) |
| `FileDrop` | `ui-file-drop` | `dropText`, `chooseText`, `accept`, output `fileChosen` |

Design tokens and shared styles are in `src/styles/`:
`_variables.scss` (colors, spacing, fonts), `_mixins.scss` (breakpoints), `_base.scss` (reset),
`_components.scss` (`.button`, `.notice`, `.card`).

## How to use

The app imports the source through the path alias in `tsconfig.json` (no separate build):

```ts
import { Skeleton, StatusBadge } from '@btu/ui';
```

```html
<ui-status-badge variant="latest" [label]="'status.latest' | t: language()" />
```

The app finds the styles through `includePaths` in `angular.json`, so `@use 'variables' as *;` works in any app SCSS file.

## Rules for new components

- standalone, `OnPush`, signals, `input()` / `output()`
- selector prefix `ui-`
- no imports from the app (`core`, `features`), no literal user-facing text
- accessibility: visible focus, aria attributes, AA contrast
- export it in `src/public-api.ts` and add a small spec

## Commands

```bash
npx ng test ui     # library tests
npx ng build ui    # optional: checks that the library builds as a package
```
