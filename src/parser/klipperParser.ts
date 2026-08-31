import * as vscode from 'vscode';

export interface ParsedOption {
  key: string;
  value: string;
  line: number;
  keyRange: vscode.Range;
  valueRange: vscode.Range;
  fullRange: vscode.Range;
  isMultiLine?: boolean;
}

export interface ParsedSection {
  rawHeader: string;
  baseName: string;
  subName?: string;
  headerLine: number;
  headerRange: vscode.Range;
  startLine: number;
  endLine: number;
  options: Map<string, ParsedOption>;
}

export interface PinUsage {
  rawPin: string;
  normalizedPin: string;
  inverted: boolean;
  pullup: boolean;
  mcu?: string;
  section: string;
  option: string;
  line: number;
  range: vscode.Range;
  isSharedBus?: boolean;
}

export interface MacroDefinition {
  name: string;
  line: number;
  range: vscode.Range;
  bodyStartLine: number;
  bodyEndLine: number;
  uri: vscode.Uri;
}

export interface IncludeDefinition {
  includePath: string;
  line: number;
  range: vscode.Range;
  uri: vscode.Uri;
}

export interface ParsedKlipperDocument {
  uri: vscode.Uri;
  sections: ParsedSection[];
  macros: MacroDefinition[];
  includes: IncludeDefinition[];
  pinUsages: PinUsage[];
}

/**
 * Parses a Klipper configuration document into an AST model.
 */
export function parseKlipperDocument(document: vscode.TextDocument): ParsedKlipperDocument {
  const sections: ParsedSection[] = [];
  const macros: MacroDefinition[] = [];
  const includes: IncludeDefinition[] = [];
  const pinUsages: PinUsage[] = [];

  let currentSection: ParsedSection | null = null;
  let currentOption: ParsedOption | null = null;

  for (let lineIdx = 0; lineIdx < document.lineCount; lineIdx++) {
    const lineText = document.lineAt(lineIdx).text;
    const trimmed = lineText.trim();

    // Skip empty lines or pure comment lines for section header detection
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    // Check for Section Header: [section_name optional_subname]
    const sectionMatch = lineText.match(/^\s*\[([^\]]+)\]/);
    if (sectionMatch) {
      if (currentSection) {
        currentSection.endLine = lineIdx - 1;
      }

      const rawHeader = sectionMatch[1].trim();
      const parts = rawHeader.split(/\s+/);
      const baseName = parts[0];
      const subName = parts.slice(1).join(' ') || undefined;

      const headerStartCol = lineText.indexOf('[');
      const headerEndCol = lineText.indexOf(']') + 1;
      const headerRange = new vscode.Range(lineIdx, headerStartCol, lineIdx, headerEndCol);

      currentSection = {
        rawHeader,
        baseName,
        subName,
        headerLine: lineIdx,
        headerRange,
        startLine: lineIdx,
        endLine: document.lineCount - 1,
        options: new Map(),
      };
      sections.push(currentSection);
      currentOption = null;

      // Handle macro definitions
      if (baseName.toLowerCase() === 'gcode_macro' && subName) {
        macros.push({
          name: subName.toUpperCase(),
          line: lineIdx,
          range: headerRange,
          bodyStartLine: lineIdx + 1,
          bodyEndLine: document.lineCount - 1,
          uri: document.uri,
        });
      }

      // Handle include directives: [include path.cfg]
      if (baseName.toLowerCase() === 'include' && subName) {
        includes.push({
          includePath: subName,
          line: lineIdx,
          range: headerRange,
          uri: document.uri,
        });
      }

      continue;
    }

    // Check for Key-Value Option: key: value or key = value
    const optionMatch = lineText.match(/^(\s*)([a-zA-Z0-9_]+)\s*[:=]\s*(.*)$/);
    if (optionMatch && currentSection) {
      const leadingSpaces = optionMatch[1].length;
      const key = optionMatch[2];
      const restValue = optionMatch[3].split('#')[0].split(';')[0].trim(); // strip inline comments

      const keyStartCol = leadingSpaces;
      const keyEndCol = keyStartCol + key.length;
      const valStartCol = lineText.indexOf(restValue, keyEndCol);
      const valEndCol = valStartCol >= 0 ? valStartCol + restValue.length : lineText.length;

      const keyRange = new vscode.Range(lineIdx, keyStartCol, lineIdx, keyEndCol);
      const valueRange = new vscode.Range(lineIdx, Math.max(0, valStartCol), lineIdx, valEndCol);
      const fullRange = new vscode.Range(lineIdx, keyStartCol, lineIdx, lineText.length);

      currentOption = {
        key,
        value: restValue,
        line: lineIdx,
        keyRange,
        valueRange,
        fullRange,
        isMultiLine: false,
      };
      currentSection.options.set(key.toLowerCase(), currentOption);

      // Check for GPIO Pin usage in pin fields
      if (isPinField(key) && restValue) {
        const pinInfo = parsePinString(restValue, currentSection.rawHeader, key, lineIdx, valueRange);
        if (pinInfo) {
          pinUsages.push(pinInfo);
        }
      }
      continue;
    }

    // Check for Multi-line continuation (e.g. gcode: indented lines)
    if (currentOption && (lineText.startsWith(' ') || lineText.startsWith('\t')) && trimmed) {
      currentOption.isMultiLine = true;
      currentOption.value += '\n' + trimmed;
      currentOption.fullRange = new vscode.Range(currentOption.fullRange.start, new vscode.Position(lineIdx, lineText.length));
    }
  }

  if (currentSection) {
    currentSection.endLine = document.lineCount - 1;
  }

  return {
    uri: document.uri,
    sections,
    macros,
    includes,
    pinUsages,
  };
}

/**
 * Checks if a property name represents a hardware GPIO pin.
 */
function isPinField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return (
    lower.endsWith('_pin') ||
    lower === 'pin' ||
    lower === 'uart_pin' ||
    lower === 'tx_pin' ||
    lower === 'diag_pin' ||
    lower === 'heater_pin' ||
    lower === 'sensor_pin' ||
    lower === 'step_pin' ||
    lower === 'dir_pin' ||
    lower === 'enable_pin' ||
    lower === 'endstop_pin'
  );
}

/**
 * Checks if a pin is part of a shared multi-device communication bus (SPI, I2C).
 */
function isSharedBusPin(optionName: string): boolean {
  const lower = optionName.toLowerCase();
  return (
    lower.includes('miso') ||
    lower.includes('mosi') ||
    lower.includes('sclk') ||
    lower.includes('sck') ||
    lower.includes('sda') ||
    lower.includes('scl') ||
    lower === 'spi_software_miso_pin' ||
    lower === 'spi_software_mosi_pin' ||
    lower === 'spi_software_sclk_pin'
  );
}

/**
 * Normalizes and extracts pin details (e.g. '!^PB13' -> MCU: 'mcu', pin: 'PB13').
 */
function parsePinString(
  rawVal: string,
  sectionName: string,
  optionName: string,
  line: number,
  range: vscode.Range
): PinUsage | null {
  const clean = rawVal.trim().split(/\s+/)[0]; // take first word if multiple
  if (!clean || clean.startsWith('virtual_endstop') || clean.includes(':virtual_endstop') || clean.startsWith('probe:')) {
    return null;
  }

  let mcu = 'mcu';
  let pinBody = clean;

  if (pinBody.includes(':')) {
    const parts = pinBody.split(':');
    mcu = parts[0].replace(/[!^~]/g, '');
    pinBody = parts[1];
  }

  const inverted = pinBody.includes('!');
  const pullup = pinBody.includes('^');
  const normalizedPin = pinBody.replace(/[!^~]/g, '').trim().toUpperCase();

  if (!normalizedPin || normalizedPin.length < 2) {
    return null;
  }

  return {
    rawPin: clean,
    normalizedPin: `${mcu}:${normalizedPin}`,
    inverted,
    pullup,
    mcu,
    section: sectionName,
    option: optionName,
    line,
    range,
    isSharedBus: isSharedBusPin(optionName),
  };
}

/**
 * Finds the section at the specified line number.
 */
export function getSectionAtLine(parsed: ParsedKlipperDocument, line: number): ParsedSection | undefined {
  return parsed.sections.find((sec) => line >= sec.startLine && line <= sec.endLine);
}
