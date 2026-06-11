# astro-v7-workerd-exit-code

Minimal reproduction: a fatal error inside the Cloudflare adapter's workerd
prerender runtime does **not** fail `astro build`.

> **Status (2026-06-11): NOT fixed in `astro@7.0.0-beta.3`** — an earlier note
> here claimed it was, based on a single run that exited 1 with the error
> surfaced; that turned out to be a fluke. Repeat runs on the same
> `7.0.0-beta.3` + `@astrojs/cloudflare@14.0.0-alpha.1` install exit 0 and
> silently emit all 21 truncated pages. The bug also reproduces on the
> **stable** line (`astro@6.4.6` + `@astrojs/cloudflare@13.7.0`).
>
> An upstream fix exists on branch
> [`flue/fix-17047`](https://github.com/withastro/astro/compare/flue/fix-17047?expand=1)
> (commit `1a1114ce8844`, "fix(cloudflare): surface prerender streaming errors
> instead of emitting truncated HTML") and is **verified** against this repro
> via the `pkg.pr.new` preview build: the build fails with exit code 1,
> `FontFamilyNotFound` is reported, and no truncated HTML is written, while
> the registered-font happy path still emits 21 complete pages.
> Tracked in [withastro/astro#17047](https://github.com/withastro/astro/issues/17047).

## Verification matrix (2026-06-11, macOS arm64)

| astro | @astrojs/cloudflare | exit code | dist/client |
| --- | --- | --- | --- |
| 7.0.0-alpha.2 | 14.0.0-alpha.1 | 0 | 21 truncated pages |
| 7.0.0-beta.3 | 14.0.0-alpha.1 | 0 ¹ | 21 truncated pages |
| 6.4.6 (stable) | 13.7.0 (stable) ² | 0 | 21 truncated pages |
| 6.4.6 (stable) | `pkg.pr.new/@astrojs/cloudflare@1a1114c` (fix) ² | **1** | empty — error surfaced |
| 6.4.6 (stable) | fix build, registered font (control) ² | 0 | 21 complete pages |

¹ One run out of several surfaced the error and exited 1; the failure mode is
nondeterministic, which makes it extra dangerous in CI.
² On `astro@6.4.6`, `@cloudflare/vite-plugin` must be pinned to `1.39.0` via
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
