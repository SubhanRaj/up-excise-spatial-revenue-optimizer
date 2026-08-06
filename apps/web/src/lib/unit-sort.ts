// Natural sort for circle/sector unit names ("Sector - 1", "Sector - 10", "Circle 2 - X").
// Plain string sort (localeCompare) puts "Sector - 10" before "Sector - 2" and interleaves
// sectors/circles by whatever text follows the number. Sectors (urban) always sort before
// circles (rural) — matching the /units registration wizard's own convention (see CLAUDE.md's
// "Circle numbering placeholder convention") — with each group ordered by its numeric
// suffix/prefix, not lexicographically. Anything not matching either pattern sorts last.
function unitSortRank(name: string): [number, number] {
  const sector = name.match(/^Sector - (\d+)$/);
  if (sector) return [0, Number(sector[1])];
  const circle = name.match(/^Circle (\d+) -/);
  if (circle) return [1, Number(circle[1])];
  return [2, 0];
}

export function compareUnitName(a: string, b: string): number {
  const [ta, na] = unitSortRank(a);
  const [tb, nb] = unitSortRank(b);
  return ta - tb || na - nb || a.localeCompare(b);
}
