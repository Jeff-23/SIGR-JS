const DB_NAME = "sigr-continuidad";
const STORE = "operaciones";
export type PendingOperation = {
  id: string;
  method: "POST" | "PATCH";
  path: string;
  body: unknown;
  createdAt: string;
};

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function enqueue(operation: PendingOperation) {
  const db = await database();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(operation);
  await complete(tx);
  db.close();
}
export async function pending(): Promise<PendingOperation[]> {
  const db = await database();
  const tx = db.transaction(STORE);
  const request = tx.objectStore(STORE).getAll();
  const result = await value<PendingOperation[]>(request);
  db.close();
  return result;
}
export async function removePending(id: string) {
  const db = await database();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await complete(tx);
  db.close();
}
function complete(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function value<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
