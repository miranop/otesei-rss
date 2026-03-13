import { XMLParser } from 'fast-xml-parser';
import type { Article } from './db.ts';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry'].includes(name),
});

type ParsedArticle = Pick<Article, 'title' | 'link' | 'summary' | 'author' | 'pub_date'>;

export async function fetchFeed(url: string): Promise<{ title: string; articles: ParsedArticle[] }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RSSReader/1.0' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const xml = await res.text();
  const data = parser.parse(xml);

  // RSS 2.0
  if (data.rss?.channel) {
    const ch = data.rss.channel;
    return {
      title: ch.title ?? url,
      articles: (ch.item ?? []).map((item: Record<string, unknown>) => ({
        title:    String(item.title ?? '(no title)'),
        link:     extractLink(item),
        summary:  stripHtml(String(item.description ?? item['content:encoded'] ?? '')).slice(0, 500),
        author:   String(item.author ?? item['dc:creator'] ?? ''),
        pub_date: String(item.pubDate ?? ''),
      })),
    };
  }

  // Atom
  if (data.feed?.entry) {
    const feed = data.feed;
    return {
      title: feed.title?.['#text'] ?? feed.title ?? url,
      articles: (feed.entry ?? []).map((entry: Record<string, unknown>) => ({
        title:    extractText(entry.title),
        link:     extractAtomLink(entry),
        summary:  stripHtml(extractText(entry.summary ?? entry.content ?? '')).slice(0, 500),
        author:   extractText((entry.author as Record<string, unknown>)?.name ?? ''),
        pub_date: String(entry.published ?? entry.updated ?? ''),
      })),
    };
  }

  throw new Error(`Unsupported feed format for ${url}`);
}

function extractText(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    return String(obj['#text'] ?? obj._ ?? '');
  }
  return String(v);
}

function extractLink(item: Record<string, unknown>): string {
  if (item.link && typeof item.link === 'string') return item.link;
  if (item.guid && typeof item.guid === 'string') return item.guid;
  if (item.guid && typeof item.guid === 'object') {
    return String((item.guid as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

function extractAtomLink(entry: Record<string, unknown>): string {
  const link = entry.link;
  if (!link) return '';
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    const alt = link.find((l) => l['@_rel'] === 'alternate' || !l['@_rel']);
    return String(alt?.['@_href'] ?? link[0]?.['@_href'] ?? '');
  }
  if (typeof link === 'object') {
    return String((link as Record<string, unknown>)['@_href'] ?? '');
  }
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}