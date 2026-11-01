// Command bar results: open tabs across spaces, history, commands and search suggestions.
import { net } from 'electron'
import { BINDINGS } from '../shared/keymap'
import { spaceItems } from '../shared/tree'
import type { SearchResult } from '../shared/types'
import { SEARCH_ENGINES, toUrl } from '../shared/url'
import type { Browser } from './browser'

/** Case-insensitive match score: prefix > word start > substring > subsequence. 0 = no match. */
export function score(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return 1
  if (t.startsWith(q)) return 100
  const i = t.indexOf(q)
  if (i > 0 && /[\s/.\-_:]/.test(t[i - 1])) return 80
  if (i >= 0) return 60
  let k = 0
  for (const ch of t) if (ch === q[k]) k++
  return k === q.length && q.length > 2 ? 20 : 0
}

export function search(browser: Browser, raw: string): SearchResult[] {
  const query = raw.trim()
  const state = browser.store.state
  const active = browser.store.activeSpace
  const results: SearchResult[] = []
  const live = browser.live

  if (query) {
    const url = toUrl(query)
    results.push(
      url
        ? { kind: 'url', id: `url:${url}`, title: url, subtitle: 'Open URL', url }
        : {
            kind: 'suggestion',
            id: `search:${query}`,
            title: query,
            subtitle: `Search ${SEARCH_ENGINES[state.settings.searchEngine].name}`,
            url: query
          }
    )
  }

  // Open tabs and sidebar items, active space first.
  const tabHits: (SearchResult & { score: number })[] = []
  const seen = new Set<string>()
  const spaces = [active, ...state.spaces.filter((s) => s !== active)]
  for (const space of spaces) {
    for (const item of spaceItems(state, space)) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      const title = item.savedTitle || live.get(item.id)?.wc.getTitle() || item.title
      const url = item.url
      const s = Math.max(score(title, query), score(url.replace(/^https?:\/\/(www\.)?/, ''), query) * 0.9)
      if (!s) continue
      const isFav = state.profiles.some((p) => p.favorites.includes(item))
      tabHits.push({
        kind: isFav ? 'favorite' : item.savedUrl ? 'pinned' : 'tab',
        id: `tab:${item.id}`,
        title,
        subtitle: space === active ? url : `${space.emoji ?? ''} ${space.name} · ${url}`.trim(),
        url,
        favicon: item.favicon,
        target: item.id,
        spaceId: space.id,
        score: s + (space === active ? 10 : 0) + (live.has(item.id) ? 5 : 0)
      })
    }
  }
  tabHits.sort((a, b) => b.score - a.score)
  const tabs = tabHits.slice(0, query ? 6 : 8)
  // A strong match on an open tab beats "search for…", like Arc's "Switch to Tab" top hit.
  if (tabs[0] && tabs[0].score >= 100) results.unshift(...tabs)
  else results.push(...tabs)

  if (!query) return results

  const commands: (SearchResult & { score: number })[] = []
  for (const b of BINDINGS) {
    if (!b.palette) continue
    const title = b.id === 'installUpdate' ? browser.updater.actionTitle() : b.title
    if (!title) continue
    const s = score(title, query)
    if (s >= 60) commands.push({ kind: 'command', id: `cmd:${b.id}`, title, target: b.id, score: s })
  }
  for (const space of state.spaces) {
    const s = score(`Switch to ${space.name}`, query) || score(space.name, query)
    if (s >= 60) {
      commands.push({ kind: 'command', id: `space:${space.id}`, title: `Switch to ${space.emoji ?? ''} ${space.name}`.replace(/\s+/g, ' '), target: `space:${space.id}`, score: s })
    }
  }
  commands.sort((a, b) => b.score - a.score)
  results.push(...commands.slice(0, 4))

  const history = browser.profiles.get(active.profileId).history.search(query, 8)
  const urls = new Set(results.map((r) => r.url))
  for (const h of history) {
    if (urls.has(h.url)) continue
    urls.add(h.url)
    results.push({ kind: 'history', id: `hist:${h.url}`, title: h.title || h.url, subtitle: h.url, url: h.url })
    if (results.length > 18) break
  }

  for (const a of state.archive) {
    if (results.length > 22) break
    if (urls.has(a.url) || !(score(a.title, query) >= 60 || score(a.url, query) >= 60)) continue
    urls.add(a.url)
    results.push({ kind: 'archive', id: `arch:${a.id}`, title: a.title, subtitle: `Archived · ${a.url}`, url: a.url, favicon: a.favicon, target: a.id })
  }
  return results
}

export async function suggest(browser: Browser, query: string): Promise<string[]> {
  const q = query.trim()
  if (!q || toUrl(q)) return []
  const engine = browser.store.state.settings.searchEngine
  const endpoint =
    engine === 'duckduckgo'
      ? `https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(q)}`
      : engine === 'bing'
        ? `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`
        : `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(q)}`
  try {
    const res = await net.fetch(endpoint, { signal: AbortSignal.timeout(1500) })
    const data = (await res.json()) as [string, string[]]
    return (data[1] ?? []).filter((s) => s.toLowerCase() !== q.toLowerCase()).slice(0, 5)
  } catch {
    return []
  }
}
