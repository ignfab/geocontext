# Tests d'intégration

Le dépôt contient deux niveaux de tests d'intégration :

- `test/integration/level1-protocol` teste directement les tools MCP avec de vrais appels réseau vers la Géoplateforme
- `test/integration/level2-agent` teste un agent LangChain branché au serveur MCP local, avec un vrai modèle LLM

## Pré requis

- installer les dépendances avec `npm install`
- construire le serveur local avec `npm run build`
- disposer d'un accès réseau vers les services appelés

## Lancer les tests

Tests d'intégration de niveau 1 :

```bash
npm run test:integration
```

Tests E2E agent de niveau 2 :

```bash
npm run test:e2e
```

Les deux suites s'exécutent séquentiellement pour limiter la charge sur les services externes et éviter de démarrer plusieurs serveurs MCP en parallèle.

## Variables d'environnement utiles

Communes aux suites d'intégration :

- `GEOCONTEXT_SERVER_PATH` pour cibler un autre point d'entrée que `dist/index.js`
- `GEOCONTEXT_LOG_LEVEL` pour ajuster les logs du serveur lancé par les tests
- `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` si l'environnement passe par un proxy

Spécifiques aux tests agent (`test:e2e`) :

- `MODEL_NAME` pour choisir le modèle LangChain, par défaut `anthropic:claude-haiku-4-5`
- la clé API attendue dépend du provider choisi dans `MODEL_NAME`
- exemples : `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY`

## Exemples

Niveau 1 :

```bash
npm run build
npm run test:integration
```

Niveau 2 avec Anthropic :

```bash
export MODEL_NAME=anthropic:claude-haiku-4-5
export ANTHROPIC_API_KEY=...
npm run build
npm run test:e2e
```

Niveau 2 avec Ollama local :

```bash
export MODEL_NAME=ollama:llama3.1
export OLLAMA_BASE_URL=http://127.0.0.1:11434
npm run build
npm run test:e2e
```

## Dépannage rapide

- si `test:integration` échoue immédiatement, vérifier que `dist/index.js` existe bien après `npm run build`
- si `test:e2e` est ignoré, vérifier que la clé API attendue par `MODEL_NAME` est présente
- si un provider local est utilisé derrière un proxy, renseigner aussi `NO_PROXY=localhost,127.0.0.1`
