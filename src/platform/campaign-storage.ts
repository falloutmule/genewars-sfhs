/** Offline file-origin IndexedDB storage. Manual/recovery snapshots remain
 * complete; a single read/write transaction rotates all recovery slots. */
export class CampaignDatabase {
  private database: Promise<IDBDatabase> | null = null;
  private open(): Promise<IDBDatabase> {
    return (this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("genewars-campaign", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("saves"))
          request.result.createObjectStore("saves");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("Campaign save database unavailable"));
      request.onblocked = () =>
        reject(
          new Error("Close another older GeneWars tab to open campaign saves"),
        );
    }));
  }
  async saveManual(slot: number, text: string): Promise<void> {
    if (!Number.isInteger(slot) || slot < 1 || slot > 3)
      throw new Error("Invalid manual save slot");
    await this.write([[`manual:${slot}`, text]]);
  }
  async loadManual(slot: number): Promise<string | null> {
    return (await this.read([`manual:${slot}`]))[0];
  }
  async recovery(): Promise<(string | null)[]> {
    return this.read([0, 1, 2, 3].map((i) => `recovery:${i}`));
  }
  async storeRecovery(text: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("saves", "readwrite"),
        store = tx.objectStore("saves"),
        old: (string | null)[] = Array(3).fill(null);
      let remaining = 3;
      for (let i = 0; i < 3; i++) {
        const r = store.get(`recovery:${i}`);
        r.onsuccess = () => {
          old[i] = typeof r.result === "string" ? r.result : null;
          if (--remaining === 0) {
            for (let j = 3; j > 0; j--) {
              if (old[j - 1] !== null) store.put(old[j - 1], `recovery:${j}`);
              else store.delete(`recovery:${j}`);
            }
            store.put(text, "recovery:0");
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(
          new Error(
            "Recovery save could not be stored; export your campaign save",
          ),
        );
    });
  }
  private async read(keys: string[]): Promise<(string | null)[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("saves", "readonly"),
        store = tx.objectStore("saves"),
        values: (string | null)[] = Array(keys.length).fill(null);
      keys.forEach((key, i) => {
        const r = store.get(key);
        r.onsuccess = () =>
          (values[i] = typeof r.result === "string" ? r.result : null);
      });
      tx.oncomplete = () => resolve(values);
      tx.onerror = tx.onabort = () =>
        reject(new Error("Campaign save could not be read"));
    });
  }
  private async write(rows: [string, string][]): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("saves", "readwrite"),
        store = tx.objectStore("saves");
      for (const [key, text] of rows) store.put(text, key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(
          new Error("Campaign save could not be stored; export your save"),
        );
    });
  }
}
