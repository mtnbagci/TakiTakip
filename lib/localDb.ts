import * as SQLite from 'expo-sqlite';

export type LocalGiftRecord = {
  id: string;
  guest: string;
  type: string;
  quantity: number;
  value: number;
  note: string;
};

const databaseName = 'takitakip.db';
const syncKey = 'gift_records_last_sync';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const getDatabase = () => {
  databasePromise ??= SQLite.openDatabaseAsync(databaseName);
  return databasePromise;
};

export const initializeLocalDatabase = async () => {
  const database = await getDatabase();
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS gift_records (
      id TEXT PRIMARY KEY NOT NULL,
      guest TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
};

export const getLocalRecords = async (): Promise<LocalGiftRecord[]> => {
  const database = await getDatabase();
  return database.getAllAsync<LocalGiftRecord>(
    'SELECT id, guest, type, quantity, value, note FROM gift_records ORDER BY rowid DESC',
  );
};

export const saveLocalRecord = async (record: LocalGiftRecord) => {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO gift_records
      (id, guest, type, quantity, value, note)
      VALUES (?, ?, ?, ?, ?, ?)`,
    record.id,
    record.guest,
    record.type,
    record.quantity,
    record.value,
    record.note,
  );
};

export const deleteLocalRecord = async (id: string) => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM gift_records WHERE id = ?', id);
};

export const replaceLocalRecords = async (records: LocalGiftRecord[]) => {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM gift_records');
    for (const record of records) {
      await database.runAsync(
        `INSERT INTO gift_records
          (id, guest, type, quantity, value, note)
          VALUES (?, ?, ?, ?, ?, ?)`,
        record.id,
        record.guest,
        record.type,
        record.quantity,
        record.value,
        record.note,
      );
    }
  });
};

export const getLastSyncAt = async () => {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    syncKey,
  );
  return row?.value ?? null;
};

export const setLastSyncAt = async (date: string) => {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    syncKey,
    date,
  );
};
