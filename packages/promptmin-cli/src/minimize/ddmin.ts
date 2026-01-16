export async function ddminReduce<T>(params: {
  items: T[];
  isFail: (items: T[]) => Promise<boolean>;
  minSize?: number;
}): Promise<T[]> {
  const minSize = params.minSize ?? 1;
  let items = params.items.slice();
  if (items.length <= minSize) return items;

  let n = 2;
  while (items.length > minSize) {
    const subsets = split(items, n);
    let reduced = false;

    for (const subset of subsets) {
      const complement = difference(items, subset);
      if (complement.length < minSize) continue;

      if (await params.isFail(complement)) {
        items = complement;
        n = Math.max(2, n - 1);
        reduced = true;
        break;
      }
    }

    if (!reduced) {
      if (n >= items.length) break;
      n = Math.min(items.length, n * 2);
    }
  }

  return items;
}

function split<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  const size = Math.ceil(items.length / n);
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length === 0 ? [items.slice()] : out;
}

function difference<T>(all: T[], remove: T[]): T[] {
  if (remove.length === 0) return all.slice();
  const removeSet = new Set(remove);
  return all.filter((x) => !removeSet.has(x));
}

