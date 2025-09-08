import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("ssmlVoiceStudio.open", () => {
    const panel = vscode.window.createWebviewPanel(
      "ssmlVoiceStudio",
      "SSML Voice Studio",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media", "dist")]
      }
    );

    panel.webview.html = getHtml(panel.webview, context.extensionUri);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}

function getHtml(webview: vscode.Webview, extUri: vscode.Uri): string {
  // DEV mode: if you want to use the Vite dev server instead of built assets,
  // set SSML_VS_DEV_SERVER=http://localhost:5173 and run `npm run dev`
  const devUrl = process.env.SSML_VS_DEV_SERVER;
  if (devUrl) {
    const nonce = getNonce();
    const csp = `
      default-src 'none';
      img-src ${webview.cspSource} https: data:;
      style-src ${webview.cspSource} 'unsafe-inline' ${devUrl};
      script-src 'nonce-${nonce}' ${devUrl} 'unsafe-eval';
      connect-src ${devUrl} ws://localhost:*;
      font-src ${webview.cspSource} https: data:;
    `;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp.replace(/\n/g,' ')}">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SSML Voice Studio (dev)</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" type="module" src="${devUrl}/src/main.tsx"></script>
</body>
</html>`;
  }

  // PROD mode: load built assets from media/dist
  const distRoot = vscode.Uri.joinPath(extUri, "media", "dist");
  const indexHtmlUri = vscode.Uri.joinPath(distRoot, "index.html");

  let html = fs.readFileSync(indexHtmlUri.fsPath, "utf8");

  // Find the main script and css the Vite build emitted
  const scriptMatch = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/);
  const cssMatch = html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/);

  const toUri = (p: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(distRoot, p.replace(/^\//, ""))).toString();

  const nonce = getNonce();
  const csp = `
    default-src 'none';
    img-src ${webview.cspSource} https: data:;
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    font-src ${webview.cspSource} https: data:;
  `;

  // Recompose minimal HTML with proper CSP and resource URIs
  const scriptSrc = scriptMatch ? toUri(scriptMatch[1]) : "";
  const cssHref = cssMatch ? toUri(cssMatch[1]) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp.replace(/\n/g,' ')}">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SSML Voice Studio</title>
${cssHref ? `<link rel="stylesheet" href="${cssHref}">` : ""}
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
</body>
</html>`;
}

function getNonce() {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 16 }, () => possible[Math.floor(Math.random() * possible.length)]).join("");
}
