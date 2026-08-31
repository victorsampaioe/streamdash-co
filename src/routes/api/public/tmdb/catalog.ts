import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { apiError, clientIp, enforceRateLimits, jsonResponse, safeLog, sha256 } from '@/lib/api-security.server';

/**
 * BFF de metadados (TMDB). A chave TMDB fica exclusivamente no servidor.
 * Respostas são cacheadas em banco para não gerar uma chamada externa por card.
 */

const querySchema = z.union([
  z.object({ kind: z.literal('search'), query: z.string().min(2).max(80) }),
  z.object({
    kind: z.literal('feed'),
    feed: z.enum(['movie_recent', 'movie_upcoming', 'movie_popular', 'tv_recent', 'tv_popular']),
    page: z.number().int().min(1).max(5).optional(),
  }),
  z.object({ kind: z.literal('detail'), media: z.enum(['movie', 'tv']), id: z.number().int().positive() }),
]);

const TTL_SECONDS: Record<string, number> = { search: 6 * 3600, feed: 3 * 3600, detail: 24 * 3600 };

export const Route = createFileRoute('/api/public/tmdb/catalog')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const kind = url.searchParams.get('kind') ?? '';
          const parsed = querySchema.safeParse(
            kind === 'search'
              ? { kind, query: url.searchParams.get('query') ?? '' }
              : kind === 'feed'
                ? { kind, feed: url.searchParams.get('feed') ?? '', page: Number(url.searchParams.get('page') ?? '1') }
                : { kind, media: url.searchParams.get('media') ?? '', id: Number(url.searchParams.get('id') ?? '0') },
          );
          if (!parsed.success) return apiError('invalid_payload');

          const limited = await enforceRateLimits([
            { rule: { bucket: 'tmdb_proxy_ip', limit: 120, windowSeconds: 300 }, key: clientIp(request.headers) },
            { rule: { bucket: 'tmdb_proxy_global', limit: 3000, windowSeconds: 300 }, key: 'global' },
          ]);
          if (limited) return limited;

          const cacheKey = sha256(JSON.stringify(parsed.data)).slice(0, 48);
          const { data: cached } = await supabaseAdmin
            .from('tmdb_cache')
            .select('payload, expires_at')
            .eq('cache_key', cacheKey)
            .maybeSingle();

          if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
            return jsonResponse({ ok: true, cached: true, data: cached.payload }, 200, {
              'Cache-Control': 'public, max-age=600',
            });
          }

          const { fetchFeed, searchTmdb, fetchDetail } = await import('@/lib/tmdb.server');
          let data: unknown;
          if (parsed.data.kind === 'search') data = await searchTmdb(parsed.data.query);
          else if (parsed.data.kind === 'feed')
            data = await fetchFeed(parsed.data.feed as never, parsed.data.page ?? 1);
          else data = await fetchDetail(parsed.data.media, parsed.data.id);

          const expiresAt = new Date(Date.now() + (TTL_SECONDS[parsed.data.kind] ?? 3600) * 1000).toISOString();
          await supabaseAdmin
            .from('tmdb_cache')
            .upsert({ cache_key: cacheKey, payload: data as never, expires_at: expiresAt }, { onConflict: 'cache_key' });

          return jsonResponse({ ok: true, cached: false, data }, 200, { 'Cache-Control': 'public, max-age=600' });
        } catch (error) {
          safeLog('TMDB PROXY', 'erro interno', { error: (error as Error).message });
          return apiError('unavailable');
        }
      },
    },
  },
});
