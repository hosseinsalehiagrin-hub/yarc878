import type { SearchEngine } from './types'

export const SEARCH_ENGINES: Record<SearchEngine, { name: string; url: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  kagi: { name: 'Kagi', url: 'https://kagi.com/search?q=%s' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' }
}

export function searchUrl(query: string, engine: SearchEngine): string {
  return SEARCH_ENGINES[engine].url.replace('%s', encodeURIComponent(query))
}

const SCHEME = /^(https?|file|about|chrome|chrome-extension|view-source|data|blob|mailto):/i
const LOCAL = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])(:\d+)?(\/.*)?$/i
const DOMAIN = /^([a-z0-9-]+\.)+[a-z][a-z0-9-]{1,62}(:\d+)?([/?#].*)?$/i

/** Returns a URL when the input looks like one, otherwise undefined. */
export function toUrl(input: string): string | undefined {
  const text = input.trim()
  if (!text || /\s/.test(text)) return undefined
  if (SCHEME.test(text)) return text
  if (LOCAL.test(text)) return `http://${text}`
  if (DOMAIN.test(text)) return `https://${text}`
  return undefined
}

/** Turns command bar input into something loadable: a URL or a search. */
export function resolveInput(input: string, engine: SearchEngine): string {
  return toUrl(input) ?? searchUrl(input.trim(), engine)
}

/** The search query, when a URL is a results page of one of the known engines. */
export function queryFromSearchUrl(url: string): string | undefined {
  try {
    const u = new URL(url)
    if (/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|kagi\.com|search\.brave\.com)$/.test(u.hostname)) {
      return u.searchParams.get('q') ?? undefined
    }
  } catch {}
  return undefined
}
