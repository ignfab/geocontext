# Exemple d'utilisation avec MCPJam

## Lancement

Sous Linux

```bash
export NODE_USE_ENV_PROXY=1 # if corporate proxy is necessary
npx @mcpjam/inspector@latest node $(pwd)/dist/index.js
```
Sous Windows

```bash
set NODE_USE_ENV_PROXY=1 # if corporate proxy is necessary. CMD version
$env:NODE_USE_ENV_PROXY = "1" # if corporate proxy is necessary. PowerShell version
npx @mcpjam/inspector@latest node $PWD\dist\index.js
```

## Exemple d'utilisation

![](../imgs/usage/mcpjam1.png)