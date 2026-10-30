// Kelompokkan poin pemeriksaan per bagian & beri nomor seperti di form cetak (1, 1.1, 1.2, 2, 2.1, ...)
// Urutan mengikuti urutan baris; baris dengan bagian yang sama selalu berurutan (divalidasi saat import)
export function groupByBagian<T extends { bagian: string }>(items: T[]) {
  const groups: { no: number; bagian: string; items: (T & { kode: string })[] }[] = [];

  for (const item of items) {
    let group = groups.at(-1);
    if (!group || group.bagian !== item.bagian) {
      group = { no: groups.length + 1, bagian: item.bagian, items: [] };
      groups.push(group);
    }
    group.items.push({ ...item, kode: `${group.no}.${group.items.length + 1}` });
  }

  return groups;
}
