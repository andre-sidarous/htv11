/**
 * Races a Supabase query (or any thenable) against a timeout, so a stalled network request
 * can never leave a screen stuck on "Loading…" forever. Rejects with a calm message instead.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms = 8_000, message = "That took too long. Check your connection."): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
