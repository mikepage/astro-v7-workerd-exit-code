import cloudflare from '@astrojs/cloudflare';
import { defineConfig, fontProviders } from 'astro/config';

// Repro: register one font, then render a <Font> for a cssVariable that was
// never registered (--font-open-sans). On Astro 6 / @astrojs/cloudflare 13
// this throws FontFamilyNotFound as an uncaught exception inside workerd
// during prerendering, while `astro build` still exits 0.
export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Roboto',
      cssVariable: '--font-roboto',
    },
  ],
});
