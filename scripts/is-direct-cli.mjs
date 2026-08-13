import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Node resolves import.meta.url to a physical macOS path (for example,
 * /private/tmp) while argv[1] may retain its logical symlink (/tmp). Compare
 * physical paths so a direct CLI invocation cannot silently become an import.
 */
export function isDirectCli(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  return (
    realpathSync(fileURLToPath(moduleUrl)) ===
    realpathSync(resolve(argvPath))
  );
}
