# Configuration avancée du proxy réseau

## Contexte

Le projet `geocontext` s'appuie sur la gestion native du proxy par Node.js pour les appels HTTP sortants.

**Cette documentation est à destination des développeurs et des utilisateurs de la version locale du MCP** travaillant derrière un proxy d'entreprise.

## Configuration du proxy

Le support du proxy est activé par l'environnement dans les principaux contextes d'exécution :

- En exécution locale, le serveur démarre avec `node --use-env-proxy`.
- Les tests d'intégration propagent `NODE_USE_ENV_PROXY=1` au sous-processus MCP lancé en `stdio`.
- Les tests E2E démarrent les workers Vitest avec `--use-env-proxy`.

Il suffit ensuite de définir les variables d'environnement standard selon votre contexte réseau :

```bash
export HTTP_PROXY=http://proxy.example:3128
export HTTPS_PROXY=http://proxy.example:3128
export NO_PROXY=localhost,127.0.0.1
```
