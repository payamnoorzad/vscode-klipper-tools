import * as vscode from 'vscode';
import { parseKlipperDocument, getSectionAtLine } from '../parser/klipperParser';
import { dynamicSchemaManager } from '../schema/dynamicSchemaManager';

/**
 * Provides rich hover documentation for Klipper sections and options.
 */
export class KlipperHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const parsed = parseKlipperDocument(document);
    const line = position.line;
    const activeSection = getSectionAtLine(parsed, line);

    if (!activeSection) {
      return null;
    }

    const { spec, custom } = dynamicSchemaManager.getSectionSpec(activeSection.baseName);

    // Case 1: Hovering over the Section Header line
    if (line === activeSection.headerLine && activeSection.headerRange.contains(position)) {
      const md = new vscode.MarkdownString();
      md.isTrusted = true;
      md.appendMarkdown(`### Klipper Section: \`[${activeSection.rawHeader}]\`\n\n`);

      if (spec) {
        md.appendMarkdown(`${spec.description}\n\n`);
        const optCount = Object.keys(spec.options).length;
        md.appendMarkdown(`*Supported options:* **${optCount}** options available.`);
      } else if (custom) {
        md.appendMarkdown(`*Custom Klipper Module*\n\n`);
        md.appendMarkdown(`${custom.description || 'Active custom module.'}\n\n`);
        if (custom.options.size > 0) {
          md.appendMarkdown(`*Observed properties:* **${Array.from(custom.options.keys()).join(', ')}**`);
        }
      } else {
        md.appendMarkdown(`*Custom or user-defined section.*`);
      }
      return new vscode.Hover(md, activeSection.headerRange);
    }

    // Case 2: Hovering over an Option Key/Value
    if (spec) {
      const schemaOptionMap = new Map<string, any>();
      for (const [key, optSpec] of Object.entries(spec.options)) {
        schemaOptionMap.set(key.toLowerCase(), optSpec);
      }

      for (const [keyName, opt] of activeSection.options.entries()) {
        if (opt.line === line && (opt.keyRange.contains(position) || opt.fullRange.contains(position))) {
          const optSpec = schemaOptionMap.get(keyName.toLowerCase());
          if (optSpec) {
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`### \`${optSpec.name}\` \n\n`);
            md.appendMarkdown(`**Type:** \`${optSpec.type}\` ${optSpec.required ? '*(Required)*' : '*(Optional)*'}\n\n`);
            md.appendMarkdown(`${optSpec.description}\n\n`);

            if (optSpec.default !== undefined) {
              md.appendMarkdown(`- **Default:** \`${optSpec.default}\`\n`);
            }
            if (optSpec.choices) {
              md.appendMarkdown(`- **Allowed Values:** \`${optSpec.choices.join('`, `')}\`\n`);
            }

            return new vscode.Hover(md, opt.keyRange);
          }
        }
      }
    } else if (custom) {
      for (const [keyName, opt] of activeSection.options.entries()) {
        if (opt.line === line && (opt.keyRange.contains(position) || opt.fullRange.contains(position))) {
          const optSpec = custom.options.get(keyName.toLowerCase());
          if (optSpec) {
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`### \`${optSpec.name}\` *(Custom)*\n\n`);
            md.appendMarkdown(`${optSpec.description}\n\n`);
            return new vscode.Hover(md, opt.keyRange);
          }
        }
      }
    }

    return null;
  }
}
