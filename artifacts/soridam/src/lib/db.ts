export type Sound = {
  id: string;
  name: string;
  audioBlob: Blob;
  duration: number; // in seconds
  mimeType: string;
  trimStart: number; // in seconds
  trimEnd: number; // in seconds
  createdAt: number;
  updatedAt: number;
};

export type SoundClip = {
  id: string;
  soundId: string;
  startTime: number; // position on timeline
  track: number; // vertical track index
  trimStart: number;
  trimEnd: number;
  volume: number; // 0.0 to 1.0
  fadeIn: number; // seconds
  fadeOut: number; // seconds
};

export type SoundStory = {
  id: string;
  title: string;
  clips: SoundClip[];
  createdAt: number;
  updatedAt: number;
  trackCount?: number;
};

const DB_NAME = 'SoridamDB';
const DB_VERSION = 1;

export class DB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {}

  private async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (e) => reject(request.error);
      
      request.onsuccess = (e) => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (e) => {
        const db = request.result;
        if (!db.objectStoreNames.contains('sounds')) {
          db.createObjectStore('sounds', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('stories')) {
          db.createObjectStore('stories', { keyPath: 'id' });
        }
      };
    });

    return this.initPromise;
  }

  private async getStore(name: 'sounds' | 'stories', mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    await this.init();
    const tx = this.db!.transaction(name, mode);
    return tx.objectStore(name);
  }

  // --- Sounds ---
  async getSounds(): Promise<Sound[]> {
    const store = await this.getStore('sounds');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as Sound[]).sort((a,b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }

  async getSound(id: string): Promise<Sound | undefined> {
    const store = await this.getStore('sounds');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveSound(sound: Sound): Promise<void> {
    const store = await this.getStore('sounds', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(sound);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async deleteSound(id: string): Promise<void> {
    const store = await this.getStore('sounds', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- Stories ---
  async getStories(): Promise<SoundStory[]> {
    const store = await this.getStore('stories');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as SoundStory[]).sort((a,b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }

  async getStory(id: string): Promise<SoundStory | undefined> {
    const store = await this.getStore('stories');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveStory(story: SoundStory): Promise<void> {
    const store = await this.getStore('stories', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(story);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async deleteStory(id: string): Promise<void> {
    const store = await this.getStore('stories', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export const db = new DB();
