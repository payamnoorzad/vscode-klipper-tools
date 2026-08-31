import * as vscode from 'vscode';
import { KLIPPER_SCHEMA, KlipperSection, KlipperOption, getBaseSectionName } from './klipperSchema';
import { parseKlipperDocument, ParsedSection } from '../parser/klipperParser';

export interface DiscoveredCustomSection {
  name: string;
  source: 'live_printer' | 'workspace_inferred' | 'python_source' | 'user_config';
  options: Map<string, KlipperOption>;
  description?: string;
}

/**
 * Dynamic Schema Manager manages built-in Klipper specs as well as
 * live-discovered printer modules, Python AST extractions, and workspace-inferred options.
 */
export class DynamicSchemaManager {
  private customSections: Map<string, DiscoveredCustomSection> = new Map();
  private extendedBuiltinOptions: Map<string, Map<string, KlipperOption>> = new Map();
  private onDidChangeSchemaEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeSchema = this.onDidChangeSchemaEmitter.event;

  constructor() {
    this.loadUserConfiguredSections();
  }

  public loadUserConfiguredSections(): void {
    const config = vscode.workspace.getConfiguration('klipper');
    const customList = config.get<string[]>('customSections', []);
    for (const sec of customList) {
      const clean = sec.trim().toLowerCase();
      if (clean && !this.customSections.has(clean)) {
        this.customSections.set(clean, {
          name: clean,
          source: 'user_config',
          options: new Map(),
          description: `User-defined custom Klipper section [${clean}]`,
        });
      }
    }
  }

  /**
   * Registers a Python module extracted from Klipper source code.
   */
  public registerPythonDiscoveredModule(moduleName: string, options: Map<string, KlipperOption>): void {
    const lower = moduleName.toLowerCase();
    const existing = this.customSections.get(lower);

    if (existing) {
      for (const [k, v] of options.entries()) {
        existing.options.set(k, v);
      }
    } else {
      this.customSections.set(lower, {
        name: moduleName,
        source: 'python_source',
        options,
        description: `Discovered from Klipper Python module (${moduleName}.py).`,
      });
    }

    // Also extend built-in options if matching
    if (KLIPPER_SCHEMA[lower]) {
      let ext = this.extendedBuiltinOptions.get(lower);
      if (!ext) {
        ext = new Map();
        this.extendedBuiltinOptions.set(lower, ext);
      }
      for (const [k, v] of options.entries()) {
        ext.set(k, v);
      }
    }

    this.onDidChangeSchemaEmitter.fire();
  }

  /**
   * Registers live objects discovered from Moonraker memory (GET /printer/objects/list).
   */
  public registerLivePrinterObjects(objectsList: string[], objectDetails?: Record<string, any>): void {
    let changed = false;

    for (const rawObj of objectsList) {
      const parts = rawObj.trim().split(/\s+/);
      const baseName = parts[0].toLowerCase();

      // If it's not a standard built-in section, register as discovered custom module
      if (!KLIPPER_SCHEMA[baseName]) {
        let entry = this.customSections.get(baseName);
        if (!entry) {
          entry = {
            name: baseName,
            source: 'live_printer',
            options: new Map(),
            description: `Active custom module discovered from connected Klipper printer.`,
          };
          this.customSections.set(baseName, entry);
          changed = true;
        }

        // If object details are provided, extract discovered keys
        if (objectDetails && objectDetails[rawObj]) {
          const statusFields = objectDetails[rawObj];
          if (typeof statusFields === 'object' && statusFields !== null) {
            for (const key of Object.keys(statusFields)) {
              const lowerKey = key.toLowerCase();
              if (!entry.options.has(lowerKey)) {
                entry.options.set(lowerKey, {
                  name: key,
                  type: 'string',
                  description: `Live property observed on printer object [${rawObj}].`,
                });
                changed = true;
              }
            }
          }
        }
      }
    }

    if (changed) {
      this.onDidChangeSchemaEmitter.fire();
    }
  }

  /**
   * Learns custom sections and options from a single TextDocument in real-time.
   */
  public learnDocumentSections(doc: vscode.TextDocument): boolean {
    if (doc.languageId !== 'klipper-config') {
      return false;
    }

    const parsed = parseKlipperDocument(doc);
    let changed = false;

    for (const section of parsed.sections) {
      const baseName = section.baseName.toLowerCase();
      const isBuiltin = !!KLIPPER_SCHEMA[baseName];

      if (baseName === 'gcode_macro' || baseName === 'include') {
        continue;
      }

      if (!isBuiltin) {
        let entry = this.customSections.get(baseName);
        if (!entry) {
          entry = {
            name: section.baseName,
            source: 'workspace_inferred',
            options: new Map(),
            description: `Custom Klipper module detected in ${doc.uri.path.split('/').pop() || 'workspace'}.`,
          };
          this.customSections.set(baseName, entry);
          changed = true;
        }

        for (const [optKey, opt] of section.options.entries()) {
          if (!entry.options.has(optKey)) {
            entry.options.set(optKey, {
              name: opt.key,
              type: this.inferValueType(opt.value, opt.key),
              description: `Option inferred from usage in ${doc.uri.path.split('/').pop()}.`,
            });
            changed = true;
          }
        }
      } else {
        // Track extended options on built-in sections (e.g. x_probe, z_probe_speed in [probe])
        let ext = this.extendedBuiltinOptions.get(baseName);
        if (!ext) {
          ext = new Map();
          this.extendedBuiltinOptions.set(baseName, ext);
        }

        for (const [optKey, opt] of section.options.entries()) {
          const builtinSpec = KLIPPER_SCHEMA[baseName].options[optKey];
          if (!builtinSpec && !ext.has(optKey)) {
            ext.set(optKey, {
              name: opt.key,
              type: this.inferValueType(opt.value, opt.key),
              description: `Extended property defined in ${doc.uri.path.split('/').pop()}.`,
            });
            changed = true;
          }
        }
      }
    }

    if (changed) {
      this.onDidChangeSchemaEmitter.fire();
    }
    return changed;
  }

  private inferValueType(val: string, key: string): KlipperOption['type'] {
    const clean = val.trim();
    const lowerKey = key.toLowerCase();

    if (lowerKey.endsWith('_pin') || lowerKey === 'pin') return 'pin';
    if (/^(true|false|yes|no|on|off)$/i.test(clean)) return 'boolean';
    if (/^-?\d+$/.test(clean)) return 'int';
    if (/^-?\d*\.\d+$/.test(clean)) return 'float';
    return 'string';
  }

  /**
   * Scans all workspace .cfg files to infer custom sections and their options.
   */
  public async scanWorkspaceForCustomSections(): Promise<void> {
    if (!vscode.workspace.workspaceFolders) {
      return;
    }

    const cfgFiles = await vscode.workspace.findFiles('**/*.cfg', '**/node_modules/**');

    for (const fileUri of cfgFiles) {
      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        this.learnDocumentSections(doc);
      } catch {
        // Skip unreadable files
      }
    }
  }

  /**
   * Checks if a section name is valid (in built-in schema, live printer memory, or workspace files).
   */
  public isSectionKnown(rawHeader: string): boolean {
    const { base } = getBaseSectionName(rawHeader);
    const lowerBase = base.toLowerCase();

    // 1. Check built-in schema
    if (KLIPPER_SCHEMA[lowerBase]) {
      return true;
    }

    // 2. Check dynamic / custom sections (discovered from live Moonraker RAM or workspace scan)
    if (this.customSections.has(lowerBase)) {
      return true;
    }

    // 3. Standard built-in multi-instance Klipper prefixes
    if (
      lowerBase.startsWith('gcode_macro') ||
      lowerBase.startsWith('menu') ||
      lowerBase.startsWith('delayed_gcode') ||
      lowerBase.startsWith('stepper_') ||
      lowerBase.startsWith('tmc') ||
      lowerBase.startsWith('extruder') ||
      lowerBase.startsWith('heater_fan') ||
      lowerBase.startsWith('temperature_sensor') ||
      lowerBase.startsWith('temperature_fan') ||
      lowerBase.startsWith('fan_generic') ||
      lowerBase.startsWith('filament_switch_sensor') ||
      lowerBase.startsWith('filament_motion_sensor') ||
      lowerBase.startsWith('output_pin') ||
      lowerBase.startsWith('pwm_cycle_time') ||
      lowerBase.startsWith('led') ||
      lowerBase.startsWith('neopixel') ||
      lowerBase.startsWith('dotstar')
    ) {
      return true;
    }

    // If not in live printer RAM, not in workspace, and not in built-in -> UNKNOWN!
    return false;
  }

  /**
   * Gets section specifications from built-in or custom registered modules.
   */
  public getSectionSpec(rawHeader: string): { spec?: KlipperSection; custom?: DiscoveredCustomSection; extended?: Map<string, KlipperOption> } {
    const { base } = getBaseSectionName(rawHeader);
    const lowerBase = base.toLowerCase();

    const extended = this.extendedBuiltinOptions.get(lowerBase);

    if (KLIPPER_SCHEMA[lowerBase]) {
      return { spec: KLIPPER_SCHEMA[lowerBase], extended };
    }

    const custom = this.customSections.get(lowerBase);
    if (custom) {
      return { custom };
    }

    return {};
  }

  public getAllKnownSectionNames(): string[] {
    const builtins = Object.keys(KLIPPER_SCHEMA);
    const customs = Array.from(this.customSections.keys());
    return Array.from(new Set([...builtins, ...customs]));
  }
}

export const dynamicSchemaManager = new DynamicSchemaManager();
