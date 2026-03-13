import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../../../data/rss.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#58a6ff'
    );

    CREATE TABLE IF NOT EXISTS feeds (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      url         TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL DEFAULT '',
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id    INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      link       TEXT NOT NULL,
      summary    TEXT NOT NULL DEFAULT '',
      author     TEXT NOT NULL DEFAULT '',
      pub_date   TEXT NOT NULL DEFAULT '',
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(feed_id, link)
    );
  `);
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

export interface Feed {
  id: number;
  url: string;
  title: string;
  category_id: number | null;
  created_at: string;
  category_name?: string;
  category_color?: string;
}

export interface Article {
  id: number;
  feed_id: number;
  title: string;
  link: string;
  summary: string;
  author: string;
  pub_date: string;
  fetched_at: string;
  feed_title?: string;
  category_name?: string;
  category_color?: string;
}

export function getCategories(): Category[] {
  return getDb().prepare('SELECT * FROM categories ORDER BY name').all() as Category[];
}

export function getFeeds(): Feed[] {
  return getDb().prepare(`
    SELECT f.*, c.name AS category_name, c.color AS category_color
    FROM feeds f
    LEFT JOIN categories c ON c.id = f.category_id
    ORDER BY f.created_at DESC
  `).all() as Feed[];
}

export function getArticles(opts: {
  categoryId?: number;
  feedId?: number;
  search?: string;
  limit?: number;
}): Article[] {
  const { categoryId, feedId, search, limit = 100 } = opts;
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit };

  if (categoryId) {
    conditions.push('c.id = @categoryId');
    params.categoryId = categoryId;
  }
  if (feedId) {
    conditions.push('a.feed_id = @feedId');
    params.feedId = feedId;
  }
  if (search) {
    conditions.push('(a.title LIKE @search OR a.summary LIKE @search)');
    params.search = `%${search}%`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  return getDb().prepare(`
    SELECT a.*, f.title AS feed_title, c.name AS category_name, c.color AS category_color
    FROM articles a
    JOIN feeds f ON f.id = a.feed_id
    LEFT JOIN categories c ON c.id = f.category_id
    ${where}
    ORDER BY a.pub_date DESC, a.fetched_at DESC
    LIMIT @limit
  `).all(params) as Article[];
}

export function upsertArticles(
  feedId: number,
  articles: Pick<Article, 'title' | 'link' | 'summary' | 'author' | 'pub_date'>[]
) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO articles (feed_id, title, link, summary, author, pub_date)
    VALUES (@feed_id, @title, @link, @summary, @author, @pub_date)
    ON CONFLICT(feed_id, link) DO UPDATE SET
      title      = excluded.title,
      summary    = excluded.summary,
      pub_date   = excluded.pub_date,
      fetched_at = datetime('now')
  `);
  const insertMany = db.transaction((rows: typeof articles) => {
    for (const row of rows) stmt.run({ feed_id: feedId, ...row });
  });
  insertMany(articles);
}