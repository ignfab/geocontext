# cql_filter GeoServer

Utiliser `cql_filter` avec `gpf_wfs_get_features` pour restreindre les objets renvoyes.

## Rappels importants

- Utiliser les noms exacts des proprietes du type WFS.
- Pour les connaitre, appeler `gpf_wfs_describe_type` avant d'ecrire le filtre.
- En `EPSG:4326`, les coordonnees des geometries s'ecrivent en `lat lon` (y x), y compris pour les points, lignes et polygones.

## Exemples

### Filtre attributaire

`code_insee = '75056'`

### Filtre spatial ponctuel

`DWITHIN(geom,Point(48.8566 2.3522),100,meters)`

### Filtre spatial polygonal

`INTERSECTS(geom,POLYGON((48.85 2.34,48.86 2.34,48.86 2.36,48.85 2.36,48.85 2.34)))`

## Operateurs frequents

- `=`
- `<>`
- `AND`
- `OR`
- `LIKE`
- `IN (...)`
- `BETWEEN ... AND ...`
- `DWITHIN(...)`
- `INTERSECTS(...)`

## Pieges frequents

- Utiliser un nom de propriete inexistant.
- Oublier que `EPSG:4326` attend `lat lon`.
- Confondre filtrage (`cql_filter`) et restriction de champs (`property_names`).
