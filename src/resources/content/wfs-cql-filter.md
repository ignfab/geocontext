# cql_filter GeoServer

Utiliser `cql_filter` avec `gpf_wfs_get_features` pour restreindre les objets renvoyés.

## Checklist

Avant d'écrire un `cql_filter` :

1. Appeler `gpf_wfs_describe_type`.
2. Identifier le champ géométrique.
3. Lire son `defaultCrs`.
4. Si `defaultCrs = EPSG:4326`, écrire les coordonnées en `lat lon`.
5. Si `defaultCrs = EPSG:2154`, écrire les coordonnées en `x y`.
6. Fournir `cql_filter` en texte brut, sans URL encoding manuel.
7. Utiliser `cql_filter` pour choisir quels objets sont renvoyés, et `property_names` pour choisir quelles propriétés de ces objets sont renvoyées.

## Champ géométrique

Règles pratiques :

- Un type WFS expose en pratique au plus un seul champ géométrique.
- Le repère le plus fiable est la présence de `defaultCrs`.
- Utiliser le nom exact du champ renvoyé par `gpf_wfs_describe_type`, par exemple `geom`, `geometrie` ou `the_geom`.
- Le `type` du champ géométrique peut être `geometry`, `point`, `linestring`, `polygon`, `multipolygon`, etc.

Exemple :

```json
{
  "name": "geom",
  "type": "multipolygon",
  "defaultCrs": "EPSG:4326"
}
```

## Ordre des coordonnées

### `EPSG:4326`

Utiliser `lat lon`.

Exemples :

- `POINT(48.8566 2.3522)`
- `POLYGON((48.85 2.34,48.86 2.34,48.86 2.36,48.85 2.36,48.85 2.34))`

### `EPSG:2154`

Utiliser `x y`, c'est-à-dire `easting northing`.

Exemples :

- `POINT(700000 6600000)`
- `POLYGON((700000 6600000,700500 6600000,700500 6600500,700000 6600500,700000 6600000))`

## URL encoding

Ne pas encoder manuellement `cql_filter`.

Le tool `gpf_wfs_get_features` encode déjà les paramètres d'URL avec `URLSearchParams`.

Conséquences :

- écrire `cql_filter` sous forme lisible
- ne pas remplacer les espaces par `%20`
- ne pas encoder `(`, `)`, `,`, `'`
- si `result_type = "url"`, l'URL renvoyée sera déjà encodée

Correct :

```text
INTERSECTS(geom,POINT(48.8566 2.3522))
```

À éviter :

```text
INTERSECTS%28geom%2CPOINT%2848.8566%202.3522%29%29
```

## Templates

### Égalité

```text
code_insee = '75056'
```

### Comparaison numérique

```text
population > 100000
```

### Liste de valeurs

```text
nature IN ('route', 'chemin', 'sentier')
```

### Intervalle

```text
surface BETWEEN 1000 AND 5000
```

### LIKE

```text
nom LIKE 'Saint-%'
```

### INTERSECTS avec point en `EPSG:4326`

```text
INTERSECTS(geom,POINT(48.8566 2.3522))
```

### INTERSECTS avec point en `EPSG:2154`

```text
INTERSECTS(geom,POINT(700000 6600000))
```

### BBOX recommandé en `EPSG:4326`

```text
BBOX(geom, 48.80, 2.20, 48.90, 2.45)
```

### BBOX recommandé en `EPSG:2154`

```text
BBOX(geom, 699000, 6599000, 701000, 6601000)
```

### POLYGON en `EPSG:4326`

```text
INTERSECTS(geom,POLYGON((48.85 2.34,48.86 2.34,48.86 2.36,48.85 2.36,48.85 2.34)))
```

### POLYGON en `EPSG:2154`

```text
INTERSECTS(geom,POLYGON((700000 6600000,700500 6600000,700500 6600500,700000 6600500,700000 6600000)))
```

### Distance

```text
DWITHIN(geom,POINT(48.8566 2.3522),100,meters)
```

### Attributaire + spatial

```text
type = 'hopital' AND BBOX(geom, 48.80, 2.20, 48.90, 2.45)
```

## Filtres attributaires

Exemples fréquents :

- `statut = 'actif'`
- `population >= 100000`
- `surface < 5000`
- `etat <> 'supprime'`
- `code_insee IN ('75056', '69123', '31555')`
- `population BETWEEN 100000 AND 500000`
- `nom LIKE '%Paris%'`
- `nature = 'route' AND importance >= 3`

## Filtres spatiaux

Bon premier choix pour un LLM :

- préférer `BBOX(...)` quand un rectangle suffit
- utiliser `INTERSECTS(...)` pour un point ou un polygone explicite
- utiliser `DWITHIN(...)` pour une recherche par distance

Exemples :

- `BBOX(geom, 48.80, 2.20, 48.90, 2.45)`
- `INTERSECTS(geom,POINT(48.8566 2.3522))`
- `INTERSECTS(geom,POLYGON((48.85 2.34,48.86 2.34,48.86 2.36,48.85 2.36,48.85 2.34)))`
- `DWITHIN(geom,POINT(48.8566 2.3522),100,meters)`

## Erreurs à éviter

- Inventer un nom de propriété.
- Oublier d'appeler `gpf_wfs_describe_type`.
- Confondre `lat lon` et `lon lat` en `EPSG:4326`.
- Utiliser `x y` sur un type en `EPSG:4326`.
- Pré-encoder `cql_filter`.
- Utiliser `cql_filter` pour limiter les champs au lieu de `property_names`.
- Construire un `POLYGON` non fermé.

## Bonnes pratiques pour un LLM

- Commencer par un filtre simple.
- Préférer `BBOX(...)` si la zone de recherche est rectangulaire.
- Vérifier systématiquement `defaultCrs` avant toute géométrie.
- Utiliser des apostrophes pour les chaînes.
- Garder le filtre lisible et minimal.
- Ajouter ensuite les conditions supplémentaires si nécessaire.

## Procédure recommandée

1. Trouver le type avec `gpf_wfs_search_types`.
2. Lire les propriétés avec `gpf_wfs_describe_type`.
3. Identifier le champ géométrique via `defaultCrs`.
4. Choisir l'ordre des coordonnées selon le CRS.
5. Écrire un premier filtre simple.
6. Ajouter ensuite les contraintes attributaires ou spatiales.
