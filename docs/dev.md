# Guide développeur

## Pré-requis

- Node.js (voir `.nvmrc` ou `package.json` pour la version recommandée)
- `npm install` pour installer les dépendances

## Développement

Pré-requis :

- Node.js `24.5.0` ou supérieur recommandé (`22.21.0` minimum supporté)
- npm compatible avec la version de Node utilisée

Le dépôt fournit `.nvmrc` et `.node-version`. Si vous utilisez `nvm`, vous pouvez donc faire :

```bash
nvm install
nvm use
```

### Construction de la version locale

```bash
git clone https://github.com/ignfab/geocontext
cd geocontext
npm ci
npm run build
```

### Utilisation de la version locale

#### Avec un client MCP compatible JSON

```json
{
  "mcpServers": {
    "geocontext": {
      "command": "node",
      "args":["--use-env-proxy", "/chemin/absolu/vers/geocontext/dist/index.js"]
    }
  }
}
```

L'option `--use-env-proxy` est facultative : elle active la prise en charge des variables d'environnement de proxy par Node.js. Ajoutez-la uniquement si votre environnement réseau en a besoin. Voir aussi la section [Configuration du proxy réseau](#configuration-du-proxy-reseau).

#### Avec Docker en local

```bash
docker compose build
docker compose up -d
```

Ensuite :

```json
{
  "mcpServers": {
    "geocontext": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Debug de la version locale

Cette commande lance **MCP Inspector**, l’outil de développement de MCP pour tester et déboguer un serveur local. 

```bash
npm run inspect:mcp
```

Pour les tests d'intégration et les tests E2E agent, voir [la documentation dédiée](docs/testing/README.md).


## Build

```bash
npm run build
```

Nettoie `dist/` puis compile le projet via `mcp-build`.

Commandes de nettoyage disponibles :

| Commande | Effet |
|---|---|
| `npm run clean` | Supprime `dist/` et `coverage/` |
| `npm run clean:deps` | Supprime `node_modules/` |
| `npm run reset:local` | Équivalent `clean` + `clean:deps` |

## Vérification rapide (typecheck + build + tests unitaires)

```bash
npm run verify:fast
```

Enchaîne `typecheck`, `typecheck:test`, `build` et `test:unit`.

## Tests

Les commandes principales sont :

```bash
npm run typecheck
npm run typecheck:test
npm test
npm run test:integration
npm run test:e2e
npm run test:coverage
npm run verify
npm run verify:full
```

`npm run verify:fast` inclut le type-check de l'application et des fichiers de test avant le build et les tests unitaires.

Remarque :

- Les outils `gpf_wfs_search_types` et `gpf_wfs_describe_type` s'appuient sur un catalogue de schémas embarqué fourni par `@ignfab/gpf-schema-store`.
- Les outils `gpf_wfs_get_features` et `gpf_wfs_get_feature_by_id` interrogent toujours le service WFS de la Géoplateforme en direct.
- Le catalogue embarqué améliore la description des featureTypes mais il peut être légèrement décalé par rapport à l'état courant du WFS.


### Tests unitaires

```bash
npm run test:unit
# ou simplement
npm test
```

### Tests d'intégration (niveau 1)

Testent directement les tools MCP avec de vrais appels réseau vers la Géoplateforme.

```bash
npm run build
npm run test:integration
```

### Tests E2E agent (niveau 2)

Testent un agent LangChain branché au serveur MCP local avec un vrai modèle LLM.

```bash
npm run build
npm run test:e2e
```

Les deux suites s'exécutent séquentiellement pour limiter la charge sur les services externes et éviter de démarrer plusieurs serveurs MCP en parallèle.

### Couverture

```bash
npm run test:coverage
```

### Vérification complète

```bash
npm run verify        # verify:fast + test:integration
npm run verify:full   # verify + test:e2e
```

## Variables d'environnement

### Communes aux tests d'intégration

| Variable | Description |
|---|---|
| `GEOCONTEXT_SERVER_PATH` | Chemin vers le point d'entrée du serveur (défaut : `dist/index.js`) |
| `GEOCONTEXT_LOG_LEVEL` | Niveau de log du serveur lancé par les tests |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | Configuration proxy réseau |

### Spécifiques aux tests E2E agent (`test:e2e`)

| Variable | Description |
|---|---|
| `MODEL_NAME` | Modèle LangChain à utiliser (défaut : `anthropic:claude-haiku-4-5`) |
| `ANTHROPIC_API_KEY` | Clé API Anthropic |
| `OPENAI_API_KEY` | Clé API OpenAI |
| `GOOGLE_API_KEY` | Clé API Google |
| `MISTRAL_API_KEY` | Clé API Mistral |

La clé API requise dépend du provider indiqué dans `MODEL_NAME`.

## Exemples de lancement des tests E2E

Avec Anthropic :

```bash
export MODEL_NAME=anthropic:claude-haiku-4-5
export ANTHROPIC_API_KEY=...
npm run build
npm run test:e2e
```

Avec Ollama en local :

```bash
export MODEL_NAME=ollama:llama3.1
export OLLAMA_BASE_URL=http://127.0.0.1:11434
npm run build
npm run test:e2e
```

## Inspecter le serveur MCP

```bash
npm run inspect:mcp       # interface graphique MCP Inspector
npm run inspect:mcp:cli   # mode CLI
```

## Générer la documentation des tools MCP

```bash
npm run docs:mcp
```

Construit le projet puis génère `docs/mcp-tools.md` à partir des métadonnées des tools.

## Dépannage

- Si `test:integration` échoue immédiatement : vérifier que `dist/index.js` existe (`npm run build`).
- Si `test:e2e` est ignoré : vérifier que la clé API attendue par `MODEL_NAME` est définie.
- Si un provider local est utilisé derrière un proxy : ajouter `NO_PROXY=localhost,127.0.0.1`.
