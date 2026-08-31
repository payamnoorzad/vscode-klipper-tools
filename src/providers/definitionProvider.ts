import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseKlipperDocument } from '../parser/klipperParser';

/**
 * Provides Go-To-Definition support for [include <filename>] and [gcode_macro <name>].
 */
export class KlipperDefinitionProvider implements vscode.DefinitionProvider {
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Definition | vscode.LocationLink[] | null> {
    const lineText = document.lineAt(position.line).text;
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_\-\.\/]+/);
    if (!wordRange) {
      return null;
    }

    const clickedWord = document.getText(wordRange);

    // Case 1: [include path.cfg] resolution
    const includeMatch = lineText.match(/^\s*\[include\s+([^\]]+)\]/i);
    if (includeMatch) {
      const includePath = includeMatch[1].trim();
      const currentDir = path.dirname(document.uri.fsPath);
      let targetFilePath = path.resolve(currentDir, includePath);

      if (fs.existsSync(targetFilePath)) {
        const targetUri = vscode.Uri.file(targetFilePath);
        return new vscode.Location(targetUri, new vscode.Position(0, 0));
      }

      // Check workspace folder roots
      if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
          const wsPath = path.resolve(folder.uri.fsPath, includePath);
          if (fs.existsSync(wsPath)) {
            return new vscode.Location(vscode.Uri.file(wsPath), new vscode.Position(0, 0));
          }
        }
      }
    }

    // Case 2: Macro Go-To-Definition (e.g. Ctrl+Click on PRINT_START or PARK_HEAD)
    const macroNameUpper = clickedWord.toUpperCase();
    const macroLocation = await this.findMacroDefinition(macroNameUpper, document);
    if (macroLocation) {
      return macroLocation;
    }

    return null;
  }

  private async findMacroDefinition(
    macroName: string,
    currentDocument: vscode.TextDocument
  ): Promise<vscode.Location | null> {
    // 1. Check current document first
    const currentParsed = parseKlipperDocument(currentDocument);
    const localMatch = currentParsed.macros.find((m) => m.name === macroName);
    if (localMatch) {
      return new vscode.Location(currentDocument.uri, localMatch.range);
    }

    // 2. Scan other .cfg files in the workspace
    const cfgFiles = await vscode.workspace.findFiles('**/*.cfg', '**/node_modules/**');
    for (const fileUri of cfgFiles) {
      if (fileUri.toString() === currentDocument.uri.toString()) {
        continue;
      }

      try {
        const fileDoc = await vscode.workspace.openTextDocument(fileUri);
        const parsed = parseKlipperDocument(fileDoc);
        const match = parsed.macros.find((m) => m.name === macroName);
        if (match) {
          return new vscode.Location(fileUri, match.range);
        }
      } catch (err) {
        // Skip unreadable files
      }
    }

    return null;
  }
}
