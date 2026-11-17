import { compareNumber, compareText, filterAndSort } from '@/lib/use-client-list';

interface Row { name: string; price: number }
const rows: Row[] = [{ name: 'banana', price: 3 }, { name: 'Apple', price: 5 }, { name: 'cherry', price: 3 }];
const opts = { searchText: (r: Row) => `${r.name} ${r.price}`, sorters: { name: (a: Row, b: Row) => compareText(a.name, b.name), price: (a: Row, b: Row) => compareNumber(a.price, b.price) } };

describe('filterAndSort', () => {
  it('sorts case-insensitively, asc and desc', () => {
    expect(filterAndSort(rows, '', opts, 'name', 'asc').map((r) => r.name)).toEqual(['Apple', 'banana', 'cherry']);
    expect(filterAndSort(rows, '', opts, 'name', 'desc').map((r) => r.name)).toEqual(['cherry', 'banana', 'Apple']);
  });
  it('is stable for equal keys', () => {
    expect(filterAndSort(rows, '', opts, 'price', 'asc').map((r) => r.name)).toEqual(['banana', 'cherry', 'Apple']);
  });
  it('searches across all searchable text, case-insensitively and trimmed', () => {
    expect(filterAndSort(rows, '  APP ', opts, 'name', 'asc').map((r) => r.name)).toEqual(['Apple']);
    expect(filterAndSort(rows, '3', opts, 'name', 'asc')).toHaveLength(2);
    expect(filterAndSort(rows, 'zzz', opts, 'name', 'asc')).toEqual([]);
  });
  it('does not mutate the input', () => {
    const copy = rows.slice();
    filterAndSort(rows, '', opts, 'name', 'desc');
    expect(rows).toEqual(copy);
  });
});
