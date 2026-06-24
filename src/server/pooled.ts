/**
 * Kör en async-operation över många objekt med BEGRÄNSAD samtidighet.
 *
 * pg-poolen är liten (PGPOOL_MAX, default 3) för serverless. En obegränsad
 * Promise.all över hundratals skrivningar köar fler anrop än poolen hinner med
 * och de tidsgränsar ("timeout exceeded when trying to connect"). Den här
 * hjälparen håller högst `concurrency` operationer i luften samtidigt.
 */
export async function runPooled<T>(
  items: readonly T[],
  fn: (item: T) => Promise<unknown>,
  concurrency = 6,
): Promise<void> {
  let next = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}
