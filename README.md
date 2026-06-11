# astro-v7-workerd-exit-code

Minimal reproduction: a fatal error inside the Cloudflare adapter's workerd
prerender runtime does **not** fail `astro build`.

> **Status (2026-06-11): NOT fixed in `astro@7.0.0-beta.3`** — an earlier note
> here claimed it was, but that run was accidentally executed against a
> locally patched `@astrojs/cloudflare` dist left in `node_modules` from
> testing a fix; the upgrade to `7.0.0-beta.3` did not re-extract the
> unchanged adapter package. The behavior is deterministic: on a pristine
> `7.0.0-beta.3` + `@astrojs/cloudflare@14.0.0-alpha.1` install the build
> exits 0 and silently emits all 21 truncated pages. The bug also reproduces
> on the **stable** line (`astro@6.4.6` + `@astrojs/cloudflare@13.7.0`).
>
> Tracked in [withastro/astro#17047](https://github.com/withastro/astro/issues/17047).
> Two upstream fixes exist:
>
> - [withastro/astro#17049](https://github.com/withastro/astro/pull/17049)
>   (bot-authored, against `main`/v6, from branch
>   [`flue/fix-17047`](https://github.com/withastro/astro/compare/flue/fix-17047?expand=1)):
>   **verified** against this repro via the `pkg.pr.new` preview build — exit
>   code 1, `FontFamilyNotFound` reported, no truncated HTML, happy path
>   intact. However, its status-code check breaks prerendered custom
>   `404.astro`/`500.astro` pages (verified: a valid `404.astro` fails the
>   build), and its error-message-in-header approach throws inside workerd
>   for multiline error messages. See
>   [the review comment](https://github.com/withastro/astro/pull/17049#issuecomment-4681665114).
> - [withastro/astro#17048](https://github.com/withastro/astro/pull/17048)
>   (against `next`/v7): same buffering approach with marker-header-only
>   error signaling, plus build-time error semantics (`BuildErrorHandler`)
>   inside workerd so pages that throw *before* streaming starts also fail
>   the build instead of writing a rendered 500 page to disk. Includes
>   regression tests for both the render error and the custom-404 case.

## Verification matrix (2026-06-11, macOS arm64)

| astro | @astrojs/cloudflare | exit code | dist/client |
| --- | --- | --- | --- |
| 7.0.0-alpha.2 | 14.0.0-alpha.1 | 0 | 21 truncated pages |
| 7.0.0-beta.3 | 14.0.0-alpha.1 | 0 | 21 truncated pages |
| 6.4.6 (stable) | 13.7.0 (stable) ¹ | 0 | 21 truncated pages |
| 6.4.6 (stable) | `pkg.pr.new/@astrojs/cloudflare@1a1114c` (fix) ¹ | **1** | empty — error surfaced |
| 6.4.6 (stable) | fix build, registered font (control) ¹ | 0 | 21 complete pages |

¹ On `astro@6.4.6`, `@cloudflare/vite-plugin` must be pinned to `1.39.0` via
`overrides` — the latest `1.40.1` crashes the workerd runner at startup with
`require_dist is not a function` (unrelated issue).

## Setup

- `astro@7.0.0-alpha.2`
- `@astrojs/cloudflare@14.0.0-alpha.1`
- One font registered (`Roboto` / `--font-roboto`) in `astro.config.mjs`
- `src/pages/index.astro` is prerendered and renders
  `<Font cssVariable="--font-open-sans" />` — a cssVariable that was never
  registered, which throws `FontFamilyNotFound` during prerendering.

## Reproduce

```sh
npm install
npm run build; echo "exit code: $?"
cat dist/client/index.html
```

## Observed (7.0.0-alpha.2, 7.0.0-beta.3, and 6.4.6 + adapter 13.7.0)

- `astro build` exits **0** and logs `[build] Complete!`
- Every emitted page is truncated exactly where the `<Font>` component threw —
  mid-`<head>`, no body. With `src/pages/[slug].astro` generating 20 paths,
  all 21 HTML files in `dist/client` are missing their closing `</html>`:

```html
<!DOCTYPE html><html lang="en"> <head><meta charset="utf-8"><title>workerd exit code repro</title><!-- ... -->
```

Changing the page to the registered `--font-roboto` produces a complete,
correct document, confirming the truncation is caused by the thrown error.

## Error visibility is environment-dependent

Whether the `FontFamilyNotFound` exception is visible at all depends on the
environment, with the **same** astro/adapter versions:

- Linux container (`workerd-linux-64`, CI/build sandbox): workerd prints
  `Uncaught exception: ... FontFamilyNotFound ...` to stderr for every page —
  but `astro build` still exits 0 and the truncated pages are written.
- macOS (`workerd-darwin-arm64`, local): **nothing is printed at all**, even
  with 21 pages; the error is fully swallowed.

So the only reliable signal that the build is broken is the truncated output
itself, not the process exit code or the log stream.

## Expected

A page that throws during prerendering should fail the build (non-zero exit
code), or at minimum the truncated page should not be emitted as if
successful.
