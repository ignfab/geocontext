# Guide développeur

## Pré-requis

- Node.js (voir `package.json` pour la version recommandée)
- npm compatible avec la version de Node utilisée

Remarque : Le dépôt fournit `.nvmrc` et `.node-version`. Si vous utilisez `nvm`, vous pouvez donc faire :

```bash
nvm install
nvm use
```

## Installation

```bash
# clonage du dépôt
git clone https://github.com/ignfab/geocontext
cd geocontext

# téléchargement des dépendances
npm ci
```

## Construction

> [!TIP]
> La commande ci-après doit être relancée après chaque modification du code pour **reconstruction du `dist/`**.

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

> [!TIP]
> - L'option `--use-env-proxy` est facultative. Voir la [configuration du proxy réseau](./config/corporate-proxy.md).
> - Voir [configuration du serveur MCP](./config.md) pour les paramètres disponibles


## Activer les tools cartographiques en local

Les tools `gpf_isoline_layer`, `gpf_get_features_layer` et `gpf_get_feature_by_id_layer` renvoient une `data_url` opaque, servie par le **proxy geodata**, un processus séparé du serveur MCP. Ces tools sont listés dans tous les transports mais échouent tant qu'aucun proxy geodata joignable n'est configuré. Comme le proxy geodata est **indépendant du transport**, on peut les activer en local (**même en `stdio`**) en lançant les deux composants côte à côte, sans Docker.

Il faut une clé partagée (`PROXY_URL_SECRET`) entre les deux processus, et pointer le MCP vers le proxy geodata local via `PROXY_PUBLIC_BASE_URL`.

```bash
# 1. Générer une clé, partagée par le MCP et le proxy (une seule fois)
export PROXY_URL_SECRET=$(openssl rand -hex 32)

# 2. Démarrer le proxy geodata (processus séparé) qui écoute par défaut sur http://localhost:3002
node --use-env-proxy dist/proxy/index.js
```

```bash
# 3. Dans un autre terminal : le MCP en stdio, pointé vers le proxy geodata local
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

> [!TIP]
>  Sans ces deux variables, les tools `*_layer` échouent avec un message explicite. Utiliser alors `gpf_get_features` / `gpf_get_feature_by_id` (attributs, sans géométrie).

## Déboguer avec MCP Inspector

**MCP Inspector** est l'outil de développement officiel pour tester et déboguer un serveur MCP local.

```bash
npm run inspect:mcp       # interface graphique
npm run inspect:mcp:cli   # mode CLI
```

## Tests

Le projet distingue deux niveaux de tests :

- **Unitaires** : pas de réseau, exécutés par défaut.
- **Intégration niveau 1** (`test/integration/level1-protocol`) : appels MCP directs vers les tools, avec de vrais appels réseau vers la Géoplateforme.

Les tests d'intégration nécessitent un build à jour (`npm run build`) et un accès réseau aux services appelés. Ils s'exécutent séquentiellement pour limiter la charge sur les services externes et éviter de démarrer plusieurs serveurs MCP en parallèle.

Les tests de bout en bout, avec un agent et un vrai modèle LLM, sont dans le dépôt [geocontext-test](https://github.com/ignfab/geocontext-test).

### Vue d'ensemble des commandes

| Commande                   | Rôle                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `npm run typecheck`        | Type-check de l'application (`tsconfig.json`)                        |
| `npm run typecheck:test`   | Type-check des fichiers de test (`tsconfig.test.json`)               |
| `npm test` / `test:unit`   | Tests unitaires                                                      |
| `npm run test:perf`        | Tests chronométrés (`*.perf.test.ts`), un fichier à la fois          |
| `npm run test:integration` | Tests d'intégration niveau 1                                         |
| `npm run test:coverage`    | Tests unitaires avec couverture                                      |
| `npm run bench`            | Benchmark du calcul de `intersection_area`                           |
| `npm run verify:fast`      | `typecheck` + `typecheck:test` + `build` + `test:unit` + `test:perf` |
| `npm run verify`           | `verify:fast` + `test:integration`                                   |

### Tests unitaires

```bash
npm run test:unit
# ou simplement
npm test
```

### Tests chronométrés

Les tests qui mesurent un temps (`*.perf.test.ts`) tournent à part, un fichier à la fois, pour que les autres tests ne faussent pas la mesure. `verify:fast` les lance après les tests unitaires.

```bash
npm run test:perf
```

### Tests d'intégration (niveau 1)

```bash
npm run build
npm run test:integration
```

### Couverture

```bash
npm run test:coverage
```

### Vérifications combinées

```bash
npm run verify:fast   # typecheck + build + tests unitaires et chronométrés
npm run verify        # verify:fast + tests d'intégration niveau 1
```

### Variables d'environnement

Pour les tests d'intégration :

| Variable                                  | Description                                                         |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `GEOCONTEXT_SERVER_PATH`                  | Chemin vers le point d'entrée du serveur (défaut : `dist/index.js`) |
| `GEOCONTEXT_LOG_LEVEL`                    | Niveau de log du serveur lancé par les tests                        |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | Configuration proxy réseau                                          |

## Dépannage

- Si `test:integration` échoue immédiatement : vérifier que `dist/index.js` existe (`npm run build`).

## Commandes utiles

### Mettre à jour des dépendances

> [!WARNING]
> **zod doit rester en version 3**

L'utilisation de [npm-check-updates](https://www.npmjs.com/package/npm-check-updates?activeTab=readme) est recommandée pour gérer les montées de version :

```bash
# étudier les nouvelles versions disponibles
npx -y npm-check-updates

# mettre à jour les versions mineures
npx -y npm-check-updates -t minor -u
```

### Générer la documentation des tools MCP

Pour mettre à jour `docs/mcp-tools.md` à partir des métadonnées des tools :

```bash
npm run docs:mcp
```
