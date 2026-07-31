import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

function unsplashPhoto(
  query: string,
  orientation?: 'portrait' | 'landscape' | null,
) {
  const category = query.split(/\s+/)[0]?.replace(/[^a-z0-9_-]/gi, '') || 'photo';
  const id = `cold_${category}`;
  return {
    id,
    width: orientation === 'portrait' ? 1000 : 1600,
    height: orientation === 'portrait' ? 1600 : 1000,
    alt_description: `${category} landscape`,
    description: null,
    urls: {
      regular: `https://images.unsplash.com/${id}?ixid=hotlink`,
    },
    user: {
      name: 'Test Photographer',
      links: { html: 'https://unsplash.com/@test-photographer' },
    },
    links: {
      download_location: `https://api.unsplash.com/photos/${id}/download?ixid=tracking`,
    },
  };
}

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // The bundled workerd release trails today's deployment compatibility
        // date by one day. Keep production on 2026-07-31 and test its supported
        // predecessor until the package catches up.
        compatibilityDate: '2026-07-30',
        bindings: { UNSPLASH_ACCESS_KEY: 'server-only-test-key' },
        async outboundService(request) {
          const url = new URL(request.url);
          if (url.origin !== 'https://api.unsplash.com') {
            throw new Error(`Unexpected outbound origin: ${url.origin}`);
          }

          if (url.pathname === '/search/photos') {
            // Keep the request open long enough for a second RPC to observe the
            // first caller's persisted refill lease.
            await new Promise((resolve) => setTimeout(resolve, 40));
            return Response.json({
              results: [
                unsplashPhoto(
                  url.searchParams.get('query') ?? 'photo',
                  url.searchParams.get('orientation') as
                    | 'portrait'
                    | 'landscape'
                    | null,
                ),
              ],
            });
          }

          if (/^\/photos\/[^/]+\/download$/.test(url.pathname)) {
            return new Response(null, {
              status: url.pathname.includes('/deleted_photo/') ? 404 : 200,
            });
          }

          throw new Error(`Unexpected Unsplash path: ${url.pathname}`);
        },
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
