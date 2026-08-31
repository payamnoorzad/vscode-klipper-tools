import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { KlipperOption } from '../schema/klipperSchema';
import { dynamicSchemaManager } from '../schema/dynamicSchemaManager';

/**
 * Scans Klipper Python source files (klippy/extras/*.py) to extract
 * config section names, config.get* options, types, defaults, and docstrings.
 */
export class PythonSchemaExtractor {
  /**
   * Scans a given directory for Klipper Python files.
   */
  public async scanKlippyDirectory(klippyDirPath: string): Promise<number> {
    if (!fs.existsSync(klippyDirPath)) {
      return 0;
    }

    let discoveredCount = 0;
    const files = this.getAllPythonFiles(klippyDirPath);

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const filename = path.basename(filePath, '.py');
        const options = this.extractConfigOptionsFromPython(content);

        if (options.size > 0 || filename) {
          dynamicSchemaManager.registerPythonDiscoveredModule(filename, options);
          discoveredCount++;
        }
      } catch {
        // Skip unreadable files
      }
    }

    return discoveredCount;
  }

  /**
   * Extracts config.get* calls from Python code using regex AST heuristics.
   */
  public extractConfigOptionsFromPython(pyCode: string): Map<string, KlipperOption> {
    const options = new Map<string, KlipperOption>();

    // Regex patterns matching Klipper Python config.get methods:
    // config.get('opt_name', default)
    // config.getfloat('opt_name', default, minval, maxval)
    // config.getint('opt_name', default, minval, maxval)
    // config.getboolean('opt_name', default)
    // config.getchoice('opt_name', choices, default)
    // config.getsection('opt_name')
    const configCallRegex = /config\.(get|getfloat|getint|getboolean|getchoice|getsection)\s*\(\s*['"]([a-zA-Z0-9_]+)['"](?:\s*,\s*([^,\)\n]+))?/g;

    let match: RegExpExecArray | null;
    while ((match = configCallRegex.exec(pyCode)) !== null) {
      const method = match[1];
      const optName = match[2];
      const rawDefault = match[3]?.trim();

      let type: KlipperOption['type'] = 'string';
      if (method === 'getfloat') type = 'float';
      else if (method === 'getint') type = 'int';
      else if (method === 'getboolean') type = 'boolean';
      else if (method === 'getchoice') type = 'choice';
      else if (optName.endsWith('_pin') || optName === 'pin') type = 'pin';

      const lowerKey = optName.toLowerCase();
      if (!options.has(lowerKey)) {
        options.set(lowerKey, {
          name: optName,
          type,
          description: `Option extracted from Klippy Python module.`,
          default: rawDefault && rawDefault !== 'None' ? rawDefault : undefined,
        });
      }
    }

    return options;
  }

  private getAllPythonFiles(dir: string): string[] {
    let results: string[] = [];
    try {
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(this.getAllPythonFiles(fullPath));
        } else if (file.endsWith('.py')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Ignore directory read errors
    }
    return results;
  }
}

export const pythonSchemaExtractor = new PythonSchemaExtractor();
