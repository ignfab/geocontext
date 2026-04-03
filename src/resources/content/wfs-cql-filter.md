# cql_filter GeoServer

Utiliser `cql_filter` avec `gpf_wfs_get_features` pour restreindre les objets renvoyés.

## Rappels importants

- Utiliser les noms exacts des propriétés du type WFS.
- Pour les connaître, appeler `gpf_wfs_describe_type` avant d'écrire le filtre.
- En `EPSG:4326`, les coordonnées des géométries s'écrivent en `lat lon` (y x), y compris pour les points, lignes et polygones.

## Exemples

### Filtre attributaire

`code_insee = '75056'`

### Filtre spatial ponctuel

`DWITHIN(geom,Point(48.8566 2.3522),100,meters)`

### Filtre spatial polygonal

`INTERSECTS(geom,POLYGON((48.85 2.34,48.86 2.34,48.86 2.36,48.85 2.36,48.85 2.34)))`

## Opérateurs fréquents

- `=`
- `<>`
- `AND`
- `OR`
- `LIKE`
- `IN (...)`
- `BETWEEN ... AND ...`
- `DWITHIN(...)`
- `INTERSECTS(...)`

## Pièges fréquents

- Utiliser un nom de propriété inexistant.
- Oublier que `EPSG:4326` attend `lat lon`.
- Confondre filtrage (`cql_filter`) et restriction de champs (`property_names`).
