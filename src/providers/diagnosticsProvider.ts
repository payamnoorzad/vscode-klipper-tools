import * as vscode from 'vscode';
import { KLIPPER_SCHEMA, getBaseSectionName } from '../schema/klipperSchema';
import { parseKlipperDocument, ParsedKlipperDocument, PinUsage } from '../parser/klipperParser';

/**
 * Calculates Levenshtein distance between two strings for typo detection.
 */
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= an; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bn; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[an][bn];
}

/**
 * Finds the closest matching valid option name.
 */
function findClosestMatch(target: string, candidates: string[]): string | null {
  let closest: string | null = null;
  let minDistance = 4; // maximum threshold for suggestions

  for (const candidate of candidates) {
    const dist = levenshtein(target.toLowerCase(), candidate.toLowerCase());
    if (dist < minDistance) {
      minDistance = dist;
      closest = candidate;
    }
  }

  return closest;
}

import { dynamicSchemaManager } from '../schema/dynamicSchemaManager';

/**
 * Validates Klipper configuration documents and publishes diagnostics.
 */
export class KlipperDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor(context: vscode.ExtensionContext) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('klipper');
    context.subscriptions.push(this.diagnosticCollection);

    // Re-validate open editors when new live objects or custom schemas are discovered
    context.subscriptions.push(
      dynamicSchemaManager.onDidChangeSchema(() => {
        vscode.workspace.textDocuments.forEach((doc) => {
          if (doc.languageId === 'klipper-config') {
            this.validateDocument(doc);
          }
        });
      })
    );
  }

  public validateDocument(document: vscode.TextDocument): void {
    if (document.languageId !== 'klipper-config') {
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const parsed = parseKlipperDocument(document);

    // 1. Analyze Sections and Options
    for (const section of parsed.sections) {
      const isKnown = dynamicSchemaManager.isSectionKnown(section.baseName);
      const { spec, custom } = dynamicSchemaManager.getSectionSpec(section.baseName);

      if (!isKnown) {
        const allKnownNames = dynamicSchemaManager.getAllKnownSectionNames();
        const closestSection = findClosestMatch(section.baseName, allKnownNames);
        const message = closestSection
          ? `Unknown Klipper section [${section.baseName}]. Did you mean [${closestSection}]?`
          : `Unknown Klipper section [${section.baseName}].`;

        const diag = new vscode.Diagnostic(
          section.headerRange,
          message,
          vscode.DiagnosticSeverity.Warning
        );
        diag.source = 'Klipper Analyzer';
        diagnostics.push(diag);
        continue;
      }

      // If it's a built-in section, validate against standard schema
      if (spec) {
        const schemaOptionMap = new Map<string, any>();
        for (const [key, optSpec] of Object.entries(spec.options)) {
          schemaOptionMap.set(key.toLowerCase(), optSpec);
        }
        const validOptionNames = Object.keys(spec.options);

        for (const [optKey, opt] of section.options.entries()) {
          if (spec.name === 'gcode_macro' && optKey.startsWith('variable_')) {
            continue;
          }

          const optSpec = schemaOptionMap.get(optKey.toLowerCase());

          if (!optSpec) {
            // Check if it's a close typo of an official option (Levenshtein distance <= 2)
            const suggestion = findClosestMatch(optKey, validOptionNames);
            if (suggestion && levenshtein(optKey.toLowerCase(), suggestion.toLowerCase()) <= 2) {
              const message = `Unknown option "${opt.key}" in [${section.rawHeader}]. Did you mean "${suggestion}"?`;
              const diag = new vscode.Diagnostic(
                opt.keyRange,
                message,
                vscode.DiagnosticSeverity.Warning
              );
              diag.source = 'Klipper Analyzer';
              diagnostics.push(diag);
            }
            // If distance > 2, it is recognized as a custom/extended property for this Klipper setup.
            continue;
          }

          this.validateOptionValue(opt, optSpec, section.rawHeader, diagnostics);
        }
      }
      // If it's a dynamic / custom section (e.g. c2p_logger_manager)
      else if (custom) {
        // Accept options defined or used on printer / workspace without false warnings
        for (const [optKey, opt] of section.options.entries()) {
          const optSpec = custom.options.get(optKey.toLowerCase());
          if (optSpec) {
            this.validateOptionValue(opt, optSpec, section.rawHeader, diagnostics);
          }
        }
      }
    }

    // 2. Pin Conflict Detection (excluding shared SPI/I2C buses & duplicate_pin_override)
    this.detectPinConflicts(parsed.pinUsages, parsed.sections, diagnostics);

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private validateOptionValue(
    opt: { key: string; value: string; valueRange: vscode.Range; isMultiLine?: boolean },
    optSpec: { type: string; choices?: string[] },
    sectionHeader: string,
    diagnostics: vscode.Diagnostic[]
  ): void {
    const val = opt.value.trim();
    if (!val || opt.isMultiLine) {
      return;
    }

    if (optSpec.type === 'int') {
      if (!/^-?\d+$/.test(val)) {
        const diag = new vscode.Diagnostic(
          opt.valueRange,
          `Invalid integer value "${val}" for "${opt.key}". Expected a whole number.`,
          vscode.DiagnosticSeverity.Error
        );
        diag.source = 'Klipper Analyzer';
        diagnostics.push(diag);
      }
    } else if (optSpec.type === 'float') {
      if (isNaN(Number(val))) {
        const diag = new vscode.Diagnostic(
          opt.valueRange,
          `Invalid float value "${val}" for "${opt.key}". Expected a numeric value.`,
          vscode.DiagnosticSeverity.Error
        );
        diag.source = 'Klipper Analyzer';
        diagnostics.push(diag);
      }
    } else if (optSpec.type === 'boolean') {
      const boolPattern = /^(true|false|yes|no|on|off|1|0)$/i;
      if (!boolPattern.test(val)) {
        const diag = new vscode.Diagnostic(
          opt.valueRange,
          `Invalid boolean value "${val}" for "${opt.key}". Expected True/False or Yes/No.`,
          vscode.DiagnosticSeverity.Warning
        );
        diag.source = 'Klipper Analyzer';
        diagnostics.push(diag);
      }
    } else if (optSpec.type === 'choice' && optSpec.choices) {
      if (!optSpec.choices.map((c) => c.toLowerCase()).includes(val.toLowerCase())) {
        const diag = new vscode.Diagnostic(
          opt.valueRange,
          `Invalid choice "${val}" for "${opt.key}". Valid options are: ${optSpec.choices.join(', ')}`,
          vscode.DiagnosticSeverity.Error
        );
        diag.source = 'Klipper Analyzer';
        diagnostics.push(diag);
      }
    }
  }

  private detectPinConflicts(
    pinUsages: PinUsage[],
    sections: { rawHeader: string; options: Map<string, any> }[],
    diagnostics: vscode.Diagnostic[]
  ): void {
    // Extract pins allowed to be shared via [duplicate_pin_override]
    const allowedSharedPins = new Set<string>();
    for (const section of sections) {
      if (section.rawHeader.toLowerCase().startsWith('duplicate_pin_override')) {
        const pinsOpt = section.options.get('pins');
        if (pinsOpt && pinsOpt.value) {
          const rawPins = pinsOpt.value.split(',');
          for (const rawP of rawPins) {
            const clean = rawP.replace(/[!^~]/g, '').trim().toUpperCase();
            if (clean) {
              allowedSharedPins.add(clean);
              allowedSharedPins.add(`MCU:${clean}`);
            }
          }
        }
      }
    }

    const pinMap = new Map<string, PinUsage[]>();

    for (const usage of pinUsages) {
      // 1. Shared SPI / I2C bus pins are intentionally connected in parallel to multiple devices
      if (usage.isSharedBus) {
        continue;
      }

      // 2. Pins allowed via [duplicate_pin_override]
      const cleanRaw = usage.rawPin.replace(/[!^~]/g, '').trim().toUpperCase();
      if (allowedSharedPins.has(cleanRaw) || allowedSharedPins.has(usage.normalizedPin)) {
        continue;
      }

      const pinKey = usage.normalizedPin;
      if (!pinMap.has(pinKey)) {
        pinMap.set(pinKey, []);
      }
      pinMap.get(pinKey)!.push(usage);
    }

    for (const [pinKey, usages] of pinMap.entries()) {
      if (usages.length > 1) {
        // Pin is used in multiple places!
        for (let i = 0; i < usages.length; i++) {
          const current = usages[i];
          const others = usages.filter((_, idx) => idx !== i);
          const conflictsList = others
            .map((o) => `[${o.section}] -> ${o.option} (line ${o.line + 1})`)
            .join(', ');

          const diag = new vscode.Diagnostic(
            current.range,
            `Pin conflict: Pin "${current.rawPin}" is already assigned in: ${conflictsList}`,
            vscode.DiagnosticSeverity.Error
          );
          diag.source = 'Klipper Pin Conflict Detector';
          diagnostics.push(diag);
        }
      }
    }
  }

  public clearDocument(document: vscode.TextDocument): void {
    this.diagnosticCollection.delete(document.uri);
  }
}
