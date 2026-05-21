# Configuration avancée de MiniSearch pour la recherche des types

## Contexte

La recherche des tables disponibles ( `gpf_wfs_search_types` ) s'appuie sur le moteur de recherche MiniSearch qui est intégré au dépôt [ignfab/gpf-schema-store](https://github.com/ignfab/gpf-schema-store#readme).

**Cette documentation est à destination des développeurs** souhaitant tester des modifications sur les poids.

## Configuration de la recherche

Si `GPF_WFS_MINISEARCH_OPTIONS` est absent ou vide, les options par défaut `@ignfab/gpf-schema-store` sont utilisées (poids et le comportement par défaut `OR` de MiniSearch pour `combineWith`).

Il est possible de configurer cette variable d'environnement comme suit pour modifier les comportements :

```bash
export GPF_WFS_MINISEARCH_OPTIONS='{"fields":["title","identifierTokens"],"combineWith":"OR","fuzzy":0.05,"boost":{"title":4,"name":5}}'
export HTTP_TIMEOUT=15
```

