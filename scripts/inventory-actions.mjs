import { readdir, readFile, writeFile } from "node:fs/promises";
import ts from "typescript";

const rows = [];
async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "ui") await scan(path);
    } else if (entry.name.endsWith(".tsx")) {
      const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = node => {
        if (ts.isJsxAttribute(node) && ["onClick", "onSubmit"].includes(node.name.getText(source))) {
          const handler = node.initializer?.getText(source).replace(/^\{|\}$/g, "").replace(/\s+/g, " ").trim() || "";
          const kind = /\.mutate(?:Async)?\(/.test(handler) ? "Chama persistência — conferir evidência do módulo" : /toast\.|notify\(/.test(handler) && !/navigator\.|window\./.test(handler) ? "Mensagem — conferir se há operação efetiva" : /\bset[A-Z]\w*\(/.test(handler) ? "Ação local — conferir fluxo completo" : "Revisar fluxo chamado";
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          rows.push(`| ${path}:${line} | ${node.name.getText(source)} | ${kind} | \`${handler.slice(0, 240).replace(/\|/g, "&#124;").replace(/`/g, "'")}\` |`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
}
await scan("client/src/pages");
await scan("client/src/components");
await writeFile("docs/ACOES-DA-INTERFACE.md", `# Inventário das ações da interface\n\nLevantamento estático das ações atuais da interface. Gere novamente com \`node scripts/inventory-actions.mjs\`. Rotas em \`INVENTARIO-FUNCIONAL.md\`; evidências efetivas em \`EXECUCAO-DO-PLANO.md\`.\n\nCada linha registra um clique ou envio de formulário fora dos componentes genéricos de UI. A classificação é conservadora e não substitui homologação. Total: **${rows.length} handlers**.\n\n| Local | Evento | Situação estática | Handler (até 240 caracteres) |\n|---|---|---|---|\n${rows.join("\n")}\n`);
console.log(`Inventário atualizado: ${rows.length} handlers.`);
