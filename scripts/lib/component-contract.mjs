import assert from "node:assert/strict";
import ts from "typescript";

export function parseComponent(source) {
  const tree = ts.createSourceFile("contract.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(tree.parseDiagnostics.length, 0, "component source must parse");
  return tree;
}

export function nodesMatching(source, predicate) {
  const tree = typeof source === "string" ? parseComponent(source) : source;
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return matches;
}

export function initializer(source, name) {
  const declarations = nodesMatching(source, (node) => ts.isVariableDeclaration(node) && (
    node.name.getText() === name ||
    (ts.isArrayBindingPattern(node.name) && node.name.elements[0]?.getText() === name)
  ));
  assert.equal(declarations.length, 1, `expected one declaration for ${name}`);
  assert.ok(declarations[0].initializer, `${name} must have an initializer`);
  return declarations[0].initializer;
}

export function evaluate(expression, bindings = {}) {
  const text = typeof expression === "string" ? expression : expression.getText();
  const { outputText } = ts.transpileModule(`const result = (${text});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  return new Function(...Object.keys(bindings), `${outputText}\nreturn result;`)(...Object.values(bindings));
}

export function evaluateInitializer(source, name, bindings = {}) {
  return evaluate(initializer(source, name), bindings);
}

export function evaluateModule(source, bindings = {}) {
  const tree = parseComponent(source);
  let localSource = source;
  for (const statement of [...tree.statements].reverse()) {
    if (ts.isImportDeclaration(statement)) {
      localSource = localSource.slice(0, statement.pos) + localSource.slice(statement.end);
    }
  }
  const { outputText } = ts.transpileModule(localSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  new Function(...Object.keys(bindings), "exports", outputText)(...Object.values(bindings), exports);
  return exports;
}

export function jsxElements(source, tag) {
  return nodesMatching(source, (node) => (
    ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)
  ) && node.tagName.getText() === tag);
}

export function jsxProp(element, name) {
  const attribute = element.attributes.properties.find((property) =>
    ts.isJsxAttribute(property) && property.name.getText() === name);
  assert.ok(attribute?.initializer, `expected JSX property ${name}`);
  return ts.isJsxExpression(attribute.initializer)
    ? attribute.initializer.expression
    : attribute.initializer;
}

export function onlyJsxElement(source, tag) {
  const elements = jsxElements(source, tag);
  assert.equal(elements.length, 1, `expected one ${tag} element`);
  return elements[0];
}

export function effectCalls(source) {
  return nodesMatching(source, (node) => ts.isCallExpression(node) && node.expression.getText() === "useEffect");
}

export { ts };
