import * as vscode from 'vscode';
import { KLIPPER_SCHEMA } from '../schema/klipperSchema';
import { parseKlipperDocument, getSectionAtLine } from '../parser/klipperParser';
import { dynamicSchemaManager } from '../schema/dynamicSchemaManager';

/**
 * Provides IntelliSense completions for Klipper section headers and options.
 */
export class KlipperCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, position.character);

    // Case 1: Typing Section Header (e.g. "[" or "[st")
    if (textBeforeCursor.includes('[') && !textBeforeCursor.includes(']')) {
      return this.getSectionCompletions();
    }

    // Case 2: Inside a section, suggesting valid options
    const parsed = parseKlipperDocument(document);
    const activeSection = getSectionAtLine(parsed, position.line);

    if (activeSection && position.line > activeSection.headerLine) {
      return this.getOptionCompletions(activeSection.baseName, activeSection.options);
    }

    return [];
  }

  private getSectionCompletions(): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const added = new Set<string>();

    // 1. Built-in Schema Sections
    for (const [key, section] of Object.entries(KLIPPER_SCHEMA)) {
      added.add(key.toLowerCase());
      const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Class);
      item.detail = `Klipper Section [${key}]`;
      item.documentation = new vscode.MarkdownString(section.description);

      if (section.allowsName) {
        const prompt = section.namePrompt || 'name';
        item.insertText = new vscode.SnippetString(`${key} \${1:${prompt}}]\n`);
      } else {
        item.insertText = new vscode.SnippetString(`${key}]\n`);
      }

      completions.push(item);
    }

    // 2. Discovered Dynamic Custom Sections
    for (const secName of dynamicSchemaManager.getAllKnownSectionNames()) {
      if (!added.has(secName.toLowerCase())) {
        added.add(secName.toLowerCase());
        const { custom } = dynamicSchemaManager.getSectionSpec(secName);
        const item = new vscode.CompletionItem(secName, vscode.CompletionItemKind.Module);
        item.detail = `Custom Klipper Module [${secName}]`;
        item.documentation = new vscode.MarkdownString(
          custom?.description || `Custom printer section discovered on Klipper host.`
        );
        item.insertText = new vscode.SnippetString(`${secName}]\n`);
        completions.push(item);
      }
    }

    return completions;
  }

  private getOptionCompletions(
    rawSectionName: string,
    existingOptions: Map<string, any>
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const { spec, custom, extended } = dynamicSchemaManager.getSectionSpec(rawSectionName);

    if (spec) {
      for (const [optKey, optSpec] of Object.entries(spec.options)) {
        if (existingOptions.has(optKey.toLowerCase())) {
          continue;
        }

        const item = new vscode.CompletionItem(optKey, vscode.CompletionItemKind.Property);
        item.detail = `(${optSpec.type}) ${optSpec.required ? '[REQUIRED]' : ''}`;

        const doc = new vscode.MarkdownString();
        doc.appendMarkdown(`**${optKey}**: \`${optSpec.type}\`\n\n`);
        doc.appendMarkdown(optSpec.description);
        if (optSpec.default !== undefined) {
          doc.appendMarkdown(`\n\n*Default:* \`${optSpec.default}\``);
        }
        if (optSpec.choices) {
          doc.appendMarkdown(`\n\n*Choices:* \`${optSpec.choices.join(', ')}\``);
        }
        item.documentation = doc;

        if (optSpec.choices && optSpec.choices.length > 0) {
          const choiceOptions = optSpec.choices.join(',');
          item.insertText = new vscode.SnippetString(`${optKey}: \${1|${choiceOptions}|}`);
        } else if (optSpec.default !== undefined) {
          item.insertText = new vscode.SnippetString(`${optKey}: \${1:${optSpec.default}}`);
        } else {
          item.insertText = new vscode.SnippetString(`${optKey}: $1`);
        }

        completions.push(item);
      }

      // Also suggest learned/extended options (e.g. x_probe, z_probe_speed)
      if (extended) {
        for (const [optKey, optSpec] of extended.entries()) {
          if (!existingOptions.has(optKey.toLowerCase()) && !spec.options[optKey.toLowerCase()]) {
            const item = new vscode.CompletionItem(optSpec.name, vscode.CompletionItemKind.Property);
            item.detail = `(Extended Property)`;
            item.documentation = new vscode.MarkdownString(optSpec.description);
            item.insertText = new vscode.SnippetString(`${optSpec.name}: $1`);
            completions.push(item);
          }
        }
      }
    } else if (custom) {
      for (const [optKey, optSpec] of custom.options.entries()) {
        if (existingOptions.has(optKey)) {
          continue;
        }

        const item = new vscode.CompletionItem(optSpec.name, vscode.CompletionItemKind.Property);
        item.detail = `(Custom Property)`;
        item.documentation = new vscode.MarkdownString(optSpec.description);
        item.insertText = new vscode.SnippetString(`${optSpec.name}: $1`);
        completions.push(item);
      }
    }

    return completions;
  }
}
