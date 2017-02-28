import { basename } from 'path'
import * as ts from 'typescript'
import { IRuleMetadata, Rules, RuleFailure, RuleWalker, Utils } from 'tslint'

export class Rule extends Rules.AbstractRule {
  static FAILURE_STRING = 'Circular import detected'

  static metadata: IRuleMetadata = {
    ruleName: 'no-circular-imports',
    description: 'Disallows circular imports.',
    rationale: Utils.dedent`
        Circular dependencies cause hard-to-catch runtime exceptions.`,
    optionsDescription: 'Not configurable.',
    options: null,
    optionExamples: ['true'],
    type: 'functionality',
    typescriptOnly: false
  }

  apply(sourceFile: ts.SourceFile): RuleFailure[] {
    return this.applyWithWalker(new NoCircularImportsWalker(sourceFile, this.getOptions()))
  }
}

const imports = new Map<string, Set<string>>()

class NoCircularImportsWalker extends RuleWalker {

  visitImportDeclaration(node: ts.ImportDeclaration) {

    const parent = node.parent as ts.SourceFile
    const thisModuleName = parent.fileName
    const importPath = (node.moduleSpecifier as any).text
    const importModule = (parent as any).resolvedModules.get(importPath)
    const importCanonicalName = importModule.resolvedFileName as string

    // add to import graph
    this.addToGraph(thisModuleName, importCanonicalName)

    // check for cycles
    if (this.hasCycle(thisModuleName)) {
      this.addFailure(
        this.createFailure(node.getStart(), node.getWidth(), `${Rule.FAILURE_STRING}: ${
          this.getCycle(thisModuleName).concat(thisModuleName).map(_ => basename(_)).join(' -> ')
        }`)
      )
    }

    super.visitImportDeclaration(node)
  }

  /**
   * TODO: don't rely on import name
   */
  private addToGraph(thisModuleName: string, importCanonicalName: string) {
    if (!imports.get(thisModuleName)) {
      imports.set(thisModuleName, new Set)
    }
    imports.get(thisModuleName)!.add(importCanonicalName)
  }

  private hasCycle(moduleName: string): boolean {
    return this.getCycle(moduleName).length > 0
  }

  private getCycle(moduleName: string, accumulator: string[] = []): string[] {
    if (!imports.get(moduleName)) return []
    if (accumulator.includes(moduleName)) return accumulator
    return Array.from(imports.get(moduleName) !.values()).reduce((_prev, _) => {
      const c = this.getCycle(_, accumulator.concat(moduleName))
      return c.length ? c : []
    }, [] as string[])
  }

}