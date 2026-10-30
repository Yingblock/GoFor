import type { PluginStorage, WordbookEntry } from '@gofor/plugin-api';

export const WORDBOOK_COLLECTION = 'entries';

function looksLikeEntry(value: unknown): value is WordbookEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<WordbookEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.term === 'string' &&
    typeof entry.meaning === 'string' &&
    Array.isArray(entry.tags) &&
    typeof entry.createdAt === 'number' &&
    typeof entry.updatedAt === 'number'
  );
}

/** 读出全部词条；坏数据跳过（插件数据是用户可编辑的 JSON，不能信任）。 */
export async function readWordbookEntries(storage: PluginStorage): Promise<WordbookEntry[]> {
  const rows = await storage.list<unknown>(WORDBOOK_COLLECTION);
  return rows
    .map((row) => row.value)
    .filter(looksLikeEntry)
    .sort((a, b) => a.term.localeCompare(b.term, 'zh-Hans-CN'));
}
