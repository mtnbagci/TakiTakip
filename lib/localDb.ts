import * as SQLite from 'expo-sqlite';

export type GiftDirection = 'Gelen' | 'Giden';

export type LocalGiftRecord = {
  id: string;
  guest: string;
  type: string;
  quantity: number;
  value: number;
  note: string;
  hasQuantity: boolean;
  direction: GiftDirection;
  giftDate: string;
  eventId: string;
};

export type LocalEvent = {
  id: string;
  name: string;
};

const databaseName = 'takitakip.db';
const syncKey = 'gift_records_last_sync';
const defaultCategories = ['Çeyrek', 'Yarım', 'Tam', 'Bilezik', 'Gram', 'Yarım Gram', 'TL', 'Euro', 'USD', 'Diğer'];
const defaultEventName = 'Genel';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const getDatabase = () => {
  databasePromise ??= SQLite.openDatabaseAsync(databaseName);
  return databasePromise;
};

const createLocalId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

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
    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL
    );
  `);
  const columns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(gift_records)',
  );
  const columnNames = columns.map((column) => column.name);
  if (!columnNames.includes('has_quantity')) {
    await database.execAsync(
      'ALTER TABLE gift_records ADD COLUMN has_quantity INTEGER NOT NULL DEFAULT 0',
    );
  }
  if (!columnNames.includes('direction')) {
    await database.execAsync(
      "ALTER TABLE gift_records ADD COLUMN direction TEXT NOT NULL DEFAULT 'Gelen'",
    );
  }
  if (!columnNames.includes('gift_date')) {
    await database.execAsync(
      "ALTER TABLE gift_records ADD COLUMN gift_date TEXT NOT NULL DEFAULT ''",
    );
  }
  if (!columnNames.includes('event_id')) {
    await database.execAsync(
      "ALTER TABLE gift_records ADD COLUMN event_id TEXT NOT NULL DEFAULT ''",
    );
  }
  for (const category of defaultCategories) {
    await database.runAsync('INSERT OR IGNORE INTO categories (name) VALUES (?)', category);
  }

  const existingEvents = await database.getAllAsync<{ id: string }>('SELECT id FROM events LIMIT 1');
  let defaultEventId = existingEvents[0]?.id;
  if (!defaultEventId) {
    defaultEventId = createLocalId();
    await database.runAsync('INSERT INTO events (id, name) VALUES (?, ?)', defaultEventId, defaultEventName);
  }
  await database.runAsync(
    "UPDATE gift_records SET event_id = ? WHERE event_id = ''",
    defaultEventId,
  );
};

export const getLocalCategories = async (): Promise<string[]> => {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ name: string }>(
    'SELECT name FROM categories ORDER BY rowid ASC',
  );
  return rows.map((row) => row.name);
};

export const saveLocalCategory = async (name: string) => {
  const database = await getDatabase();
  await database.runAsync('INSERT OR IGNORE INTO categories (name) VALUES (?)', name);
};

export const getLocalEvents = async (): Promise<LocalEvent[]> => {
  const database = await getDatabase();
  return database.getAllAsync<LocalEvent>('SELECT id, name FROM events ORDER BY rowid ASC');
};

export const saveLocalEvent = async (event: LocalEvent) => {
  const database = await getDatabase();
  await database.runAsync('INSERT OR IGNORE INTO events (id, name) VALUES (?, ?)', event.id, event.name);
};

export const replaceLocalEvents = async (events: LocalEvent[]) => {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM events');
    for (const event of events) {
      await database.runAsync('INSERT INTO events (id, name) VALUES (?, ?)', event.id, event.name);
    }
  });
};

export const getLocalRecords = async (): Promise<LocalGiftRecord[]> => {
  const database = await getDatabase();
  return database.getAllAsync<LocalGiftRecord>(
    'SELECT id, guest, type, quantity, value, note, has_quantity as hasQuantity, direction, gift_date as giftDate, event_id as eventId FROM gift_records ORDER BY rowid DESC',
  );
};

export const saveLocalRecord = async (record: LocalGiftRecord) => {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO gift_records
      (id, guest, type, quantity, value, note, has_quantity, direction, gift_date, event_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id,
    record.guest,
    record.type,
    record.quantity,
    record.value,
    record.note,
    record.hasQuantity ? 1 : 0,
    record.direction,
    record.giftDate,
    record.eventId,
  );
};

export const deleteLocalRecord = async (id: string) => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM gift_records WHERE id = ?', id);
};

export const clearLocalRecords = async () => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM gift_records');
  await database.runAsync('DELETE FROM events');
  await database.runAsync('DELETE FROM sync_meta');
};

export const replaceLocalRecords = async (records: LocalGiftRecord[]) => {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM gift_records');
    for (const record of records) {
      await database.runAsync(
        `INSERT INTO gift_records
          (id, guest, type, quantity, value, note, has_quantity, direction, gift_date, event_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        record.id,
        record.guest,
        record.type,
        record.quantity,
        record.value,
        record.note,
        record.hasQuantity ? 1 : 0,
        record.direction,
        record.giftDate,
        record.eventId,
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
