# Guide développeur

## Pré-requis

- Node.js (voir `package.json` pour la version recommandée)
- npm compatible avec la version de Node utilisée

Remarque : Le dépôt fournit `.nvmrc` et `.node-version`. Si vous utilisez `nvm`, vous pouvez donc faire :

```bash
nvm install
nvm use
```

</details>


## Installation

```bash
# clonage du dépôt
git clone https://github.com/ignfab/geocontext
cd geocontext

# téléchargement des dépendances
npm ci
```

## Construction

!!!tip
    La commande ci-après doit être relancé après chaque modification du code pour **reconstruction du `dist/`**

```bash
npm run build
```

## Démarrer le serveur MCP

La commande suivante démarre le serveur MCP en mode "stdio" :

```bash
node --use-env-proxy dist/index.js
```

Avec certains clients MCP, vous serez amené à éditer un fichier JSON. Par exemple :

```json
{
  "mcpServers": {
    "geocontext": {
      "command": "node",
      "args": ["--use-env-proxy", "/chemin/absolu/vers/geocontext/dist/index.js"]
    }
  }
}
```

!!!tip
    - L'option `--use-env-proxy` est facultative. Voir la [configuration du proxy réseau](./config/corporate-proxy.md).
    - Voir [configuration du serveur MCP](./config.md) pour les paramètres disponibles


## Activer les tools cartographiques en local

Les tools `gpf_get_features_layer` et `gpf_get_feature_by_id_layer` renvoient une `data_url` opaque, servie par le **proxy geodata**, un processus séparé du serveur MCP. Ils sont listés dans tous les transports mais échouent tant qu'aucun proxy joignable n'est configuré. Comme le proxy est **indépendant du transport**, on peut les activer en local — **même en `stdio`** — en lançant les deux composants côte à côte, sans Docker.

Il faut une clé partagée (`PROXY_URL_SECRET`) entre les deux processus, et pointer le MCP vers le proxy local via `PROXY_PUBLIC_BASE_URL`.

```bash
# 1. Générer une clé, partagée par le MCP et le proxy (une seule fois)
export PROXY_URL_SECRET=$(openssl rand -hex 32)

# 2. Démarrer le proxy geodata (processus séparé) — écoute par défaut sur http://localhost:3002
node --use-env-proxy dist/proxy/index.js
```

```bash
# 3. Dans un autre terminal : le MCP en stdio, pointé vers le proxy local
export PROXY_URL_SECRET=<la même clé qu'à l'étape 1>
export PROXY_PUBLIC_BASE_URL=http://localhost:3002
node --use-env-proxy dist/index.js
```

Le MCP forge alors des URLs `http://localhost:3002/api/v1/proxy/<token>.json` que le client cartographique peut charger. Les navigateurs traitent `localhost` comme un contexte sûr : il n'y a donc pas de blocage *mixed content*, même depuis une page en `https`.

Pour un client MCP configuré par fichier JSON, ajoutez les variables dans le bloc `env` du serveur (et lancez `node --use-env-proxy dist/proxy/index.js` à côté, avec la même `PROXY_URL_SECRET`) :

```json
{
  "mcpServers": {
    "geocontext": {
      "command": "node",
      "args": ["--use-env-proxy", "/chemin/absolu/vers/geocontext/dist/index.js"],
      "env": {
        "PROXY_URL_SECRET": "<clé hexadécimale de 64 caractères>",
        "PROXY_PUBLIC_BASE_URL": "http://localhost:3002"
      }
    }
  }
}
```

!!!tip
    Sans ces deux variables, les tools `*_layer` échouent avec un message explicite. Utiliser alors `gpf_get_features` / `gpf_get_feature_by_id` (attributs, sans géométrie).

## Déboguer avec MCP Inspector

**MCP Inspector** est l'outil de développement officiel pour tester et déboguer un serveur MCP local.

```bash
npm run inspect:mcp       # interface graphique
npm run inspect:mcp:cli   # mode CLI
```

## Tests

Le projet distingue trois niveaux de tests :

- **Unitaires** : pas de réseau, exécutés par défaut.
- **Intégration niveau 1** (`test/integration/level1-protocol`) : appels MCP directs vers les tools, avec de vrais appels réseau vers la Géoplateforme.
- **E2E niveau 2** (`test/integration/level2-agent`) : un agent LangChain branché au serveur MCP local avec un vrai modèle LLM.

Les niveaux 1 et 2 nécessitent un build à jour (`npm run build`) et un accès réseau aux services appelés. Les deux suites s'exécutent séquentiellement pour limiter la charge sur les services externes et éviter de démarrer plusieurs serveurs MCP en parallèle.

### Vue d'ensemble des commandes

| Commande                    | Rôle                                                            |
| --------------------------- | --------------------------------------------------------------- |
| `npm run typecheck`         | Type-check de l'application (`tsconfig.json`)                   |
| `npm run typecheck:test`    | Type-check des fichiers de test (`tsconfig.test.json`)          |
| `npm test` / `test:unit`    | Tests unitaires                                                 |
| `npm run test:integration`  | Tests d'intégration niveau 1                                    |
| `npm run test:e2e`          | Tests E2E agent niveau 2                                        |
| `npm run test:coverage`     | Tests unitaires avec couverture                                 |
| `npm run verify:fast`       | `typecheck` + `typecheck:test` + `build` + `test:unit`          |
| `npm run verify`            | `verify:fast` + `test:integration`                              |
| `npm run verify:full`       | `verify` + `test:e2e`                                           |

### Tests unitaires

```bash
npm run test:unit
# ou simplement
npm test
```

### Tests d'intégration (niveau 1)

```bash
npm run build
npm run test:integration
```

### Tests E2E agent (niveau 2)

```bash
npm run build
npm run test:e2e
```

### Couverture

```bash
npm run test:coverage
```

### Vérifications combinées

```bash
npm run verify:fast   # typecheck + build + tests unitaires
npm run verify        # verify:fast + tests d'intégration niveau 1
npm run verify:full   # verify + tests E2E niveau 2
```

### Variables d'environnement

Communes aux suites d'intégration (niveaux 1 et 2) :

| Variable                                  | Description                                                         |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `GEOCONTEXT_SERVER_PATH`                  | Chemin vers le point d'entrée du serveur (défaut : `dist/index.js`) |
| `GEOCONTEXT_LOG_LEVEL`                    | Niveau de log du serveur lancé par les tests                        |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | Configuration proxy réseau                                          |

Spécifiques aux tests E2E agent (`test:e2e`) :

| Variable            | Description                                                         |
| ------------------- | ------------------------------------------------------------------- |
| `MODEL_NAME`        | Modèle LangChain à utiliser (défaut : `anthropic:claude-haiku-4-5`) |
| `ANTHROPIC_API_KEY` | Clé API Anthropic                                                   |
| `OPENAI_API_KEY`    | Clé API OpenAI                                                      |
| `GOOGLE_API_KEY`    | Clé API Google                                                      |
| `MISTRAL_API_KEY`   | Clé API Mistral                                                     |

La clé API requise dépend du provider indiqué dans `MODEL_NAME`.

### Exemples de lancement des tests E2E

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

## Dépannage

- Si `test:integration` échoue immédiatement : vérifier que `dist/index.js` existe (`npm run build`).
- Si `test:e2e` est ignoré : vérifier que la clé API attendue par `MODEL_NAME` est définie.
- Si un provider local (Ollama, etc.) est utilisé derrière un proxy : ajouter `NO_PROXY=localhost,127.0.0.1`.

## Commandes utiles

### Mettre à jour des dépendances

!!!warning
    **zod doit rester en version 3**

L'utilisation de [npm-check-updates](https://www.npmjs.com/package/npm-check-updates?activeTab=readme) est recommandée pour gérer les montées de version :

```bash
# étudier les nouvelles versions disponible
npx -y npm-check-updates

# mettre à jour les versions mineurs
npx -y npm-check-updates -t minor -u
```


### Générer la documentation des tools MCP

Pour mettre à jour `docs/mcp-tools.md` à partir des métadonnées des tools :

```bash
npm run docs:mcp
```

