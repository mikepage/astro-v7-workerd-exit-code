# astro-v7-workerd-exit-code

Minimal reproduction: a fatal error inside the Cloudflare adapter's workerd
prerender runtime does **not** fail `astro build`.

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

## Observed (Astro 7.0.0-alpha.2)

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

