import { symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Windows junctions exercise real reparse-point rejection without Developer Mode
// or elevation. File-target junctions are intentionally unusable: validators must
// reject lstat.isSymbolicLink() before following them. POSIX uses normal symlinks.
export function fixtureLink(target, link) {
  if (process.platform === 'win32') symlinkSync(resolve(dirname(link), target), link, 'junction');
  else symlinkSync(target, link);
}
