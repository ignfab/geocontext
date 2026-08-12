# Configuration avancée de MiniSearch pour la recherche des types

## Contexte

La recherche des tables disponibles ( `gpf_search_types` ) s'appuie sur le moteur de recherche MiniSearch qui est intégré au dépôt [ignfab/gpf-schema-store](https://github.com/ignfab/gpf-schema-store#readme).

**Cette documentation est à destination des développeurs** souhaitant tester des modifications sur les poids.

## Configuration de la recherche

Si `GPF_WFS_MINISEARCH_OPTIONS` est absent ou vide, les options par défaut `@ignfab/gpf-schema-store` sont utilisées (poids et le comportement par défaut `OR` de MiniSearch pour `combineWith`).

Il est possible de configurer cette variable d'environnement comme suit pour modifier les comportements :

```bash
export GPF_WFS_MINISEARCH_OPTIONS='{"fields":["title","identifierTokens"],"combineWith":"OR","fuzzy":0.05,"boost":{"title":4,"name":5}}'
export HTTP_TIMEOUT=15
```

Champs autorisés pour `fields` et les clés de `boost` (alignés sur `@ignfab/gpf-schema-store@0.2.x`) :

- `namespace`
- `name`
- `identifierTokens`
- `title`
- `description`
- `propertyNames`
- `propertyTitles`
- `propertyDescriptions`
- `oneOfConsts`
- `oneOfDescriptions`
- `representedFeatures`
- `selectionCriteria`

Exemple plus complet :

```bash
export GPF_WFS_MINISEARCH_OPTIONS='{"fields":["title","identifierTokens","propertyNames","oneOfConsts"],"combineWith":"OR","fuzzy":0.05,"boost":{"title":4,"name":5,"identifierTokens":3,"oneOfConsts":1.5}}'
```

