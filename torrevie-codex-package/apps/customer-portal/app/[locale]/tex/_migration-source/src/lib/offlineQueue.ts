import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface OfflineExpense {
  id?: number;
  expense_data: Record<string, any>;
  receipt_image_base64: string | null;
  receipt_filename: string | null;
  created_at: string;
  sync_status: 'pending' | 'syncing' | 'failed';
  retry_count: number;
  is_draft?: boolean;
}

interface TexOfflineDB extends DBSchema {
  'offline-queue': {
    key: number;
    value: OfflineExpense;
    indexes: { 'by-status': string };
  };
}

let dbPromise: Promise<IDBPDatabase<TexOfflineDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TexOfflineDB>('tex-offline-queue', 1, {
      upgrade(db) {
        const store = db.createObjectStore('offline-queue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-status', 'sync_status');
      },
    });
  }
  return dbPromise;
}

export async function addToOfflineQueue(item: Omit<OfflineExpense, 'id'>): Promise<number> {
  const db = await getDB();
  return db.add('offline-queue', item as OfflineExpense);
}

export async function getAllQueued(): Promise<OfflineExpense[]> {
  const db = await getDB();
  return db.getAll('offline-queue');
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll('offline-queue');
  return all.filter(i => i.sync_status === 'pending' || i.sync_status === 'failed').length;
}

export async function getByStatus(status: string): Promise<OfflineExpense[]> {
  const db = await getDB();
  return db.getAllFromIndex('offline-queue', 'by-status', status);
}

export async function updateQueueItem(id: number, updates: Partial<OfflineExpense>): Promise<void> {
  const db = await getDB();
  const item = await db.get('offline-queue', id);
  if (!item) return;
  const updated = { ...item, ...updates };
  await db.put('offline-queue', updated);
}

export async function removeFromQueue(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('offline-queue', id);
}

export async function getQueueItem(id: number): Promise<OfflineExpense | undefined> {
  const db = await getDB();
  return db.get('offline-queue', id);
}
