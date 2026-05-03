# MCP Tool Reference

Generated from runtime `toolDefinition` metadata for `@ignfab/geocontext` v0.9.7.

## Contrat d’erreur MCP

- En cas d'échec, chaque tool renvoie `isError: true`.
- `content.text` contient le message de détail en français (aligné avec `structuredContent.detail`).
- `structuredContent` contient l'objet canonique exploitable par un client.

Exemple complet généré automatiquement à partir d'un appel de tool invalide (contrainte de validation) :

```json
{
  "jsonrpc": "2.0",
  "id": "adminexpress:invalid-input-example",
  "result": {
    "isError": true,
    "content": [
      {
        "type": "text",
        "text": "Paramètres invalides : Le paramètre 'lon' est requis. Le paramètre 'lat' est requis."
      }
    ],
    "structuredContent": {
      "type": "urn:geocontext:problem:invalid-tool-params",
      "title": "Paramètres d’outil invalides",
      "detail": "Paramètres invalides : Le paramètre 'lon' est requis. Le paramètre 'lat' est requis.",
      "errors": [
        {
          "code": "invalid_type",
          "detail": "Le paramètre 'lon' est requis.",
          "name": "lon"
        },
        {
          "code": "invalid_type",
          "detail": "Le paramètre 'lat' est requis.",
          "name": "lat"
        }
      ]
    }
  }
}
```

## Index

- [`adminexpress`](#adminexpress)
- [`altitude`](#altitude)
- [`assiette_sup`](#assiette_sup)
- [`cadastre`](#cadastre)
- [`geocode`](#geocode)
- [`gpf_wfs_describe_type`](#gpf_wfs_describe_type)
- [`gpf_wfs_get_feature_by_id`](#gpf_wfs_get_feature_by_id)
- [`gpf_wfs_get_features`](#gpf_wfs_get_features)
- [`gpf_wfs_search_types`](#gpf_wfs_search_types)
- [`urbanisme`](#urbanisme)

## `adminexpress`

Source: [src/tools/AdminexpressTool.ts](../src/tools/AdminexpressTool.ts)

Title: Unités administratives

### Description du tool

- Renvoie, pour un point donné par sa `longitude` et sa `latitude`, la liste des unités administratives (arrondissement, arrondissement_municipal, canton, collectivite_territoriale, commune, commune_associee_ou_deleguee, departement, epci, region) qui le couvrent, sous forme d'objets typés contenant leurs propriétés administratives.
- Les résultats incluent un `feature_ref` WFS réutilisable. Les propriétés incluent notamment le code INSEE.
- Le `feature_ref` de chaque unité administrative est directement réutilisable dans `gpf_wfs_get_features` avec `spatial_operator="intersects_feature"` pour interroger d'autres données sur cette emprise.
- Pour récupérer exactement l'objet correspondant au `feature_ref`, utiliser `gpf_wfs_get_feature_by_id`.
- (source : Géoplateforme (WFS, ADMINEXPRESS-COG.LATEST)).

### Input Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `lat` | number | yes | La latitude du point. |
| `lon` | number | yes | La longitude du point. |

<details>
<summary>Raw input schema</summary>

```json
{
  "type": "object",
  "properties": {
    "lon": {
      "type": "number",
      "description": "La longitude du point.",
      "minimum": -180,
      "maximum": 180
    },
    "lat": {
      "type": "number",
      "description": "La latitude du point.",
      "minimum": -90,
      "maximum": 90
    }
  },
  "required": [
    "lon",
    "lat"
  ]
}
```

</details>

### Output Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `results` | array | yes | La liste des unités administratives couvrant le point demandé. |

<details>
<summary>Raw output schema</summary>

```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "description": "La liste des unités administratives couvrant le point demandé.",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "description": "Le type d'unité administrative (arrondissement, arrondissement_municipal, canton, collectivite_territoriale, commune, commune_associee_ou_deleguee, departement, epci, region)."
          },
          "id": {
            "type": "string",
            "description": "L'identifiant de l'unité administrative."
          },
          "bbox": {
            "type": "array",
            "description": "La boîte englobante de l'unité administrative.",
            "items": {
              "type": "number"
            }
          },
          "feature_ref": {
            "type": "object",
            "description": "Référence WFS réutilisable, notamment avec `gpf_wfs_get_features` et `spatial_operator = \"intersects_feature\"`.",
            "properties": {
              "typename": {
                "type": "string",
                "description": "Le `typename` WFS réutilisable pour une requête ultérieure."
              },
              "feature_id": {
                "type": "string",
                "description": "L'identifiant WFS réutilisable du feature."
              }
            },
            "required": [
              "typename",
              "feature_id"
            ]
          }
        },
        "required": [
          "type",
          "id",
          "feature_ref"
        ]
      }
    }
  },
  "required": [
    "results"
  ]
}
```

</details>

## `altitude`

Source: [src/tools/AltitudeTool.ts](../src/tools/AltitudeTool.ts)

Title: Altitude d’une position

### Description du tool

Renvoie l'altitude (en mètres) et la précision de la mesure (accuracy) d'un point géographique à partir de sa longitude et de sa latitude. (source : Géoplateforme (altimétrie)).

### Input Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `lat` | number | yes | La latitude du point. |
| `lon` | number | yes | La longitude du point. |

<details>
<summary>Raw input schema</summary>

```json
{
  "type": "object",
  "properties": {
    "lon": {
      "type": "number",
      "description": "La longitude du point.",
      "minimum": -180,
      "maximum": 180
    },
    "lat": {
      "type": "number",
      "description": "La latitude du point.",
      "minimum": -90,
      "maximum": 90
    }
  },
  "required": [
    "lon",
    "lat"
  ]
}
```

</details>

### Output Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `accuracy` | string | yes | L'information de précision associée à l'altitude. |
| `altitude` | number | yes | L'altitude du point. |
| `lat` | number | yes | La latitude du point. |
| `lon` | number | yes | La longitude du point. |

<details>
<summary>Raw output schema</summary>

```json
{
  "type": "object",
  "properties": {
    "lon": {
      "type": "number",
      "description": "La longitude du point."
    },
    "lat": {
      "type": "number",
      "description": "La latitude du point."
    },
    "altitude": {
      "type": "number",
      "description": "L'altitude du point."
    },
    "accuracy": {
      "type": "string",
      "description": "L'information de précision associée à l'altitude."
    }
  },
  "required": [
    "lon",
    "lat",
    "altitude",
    "accuracy"
  ]
}
```

</details>

## `assiette_sup`

Source: [src/tools/AssietteSupTool.ts](../src/tools/AssietteSupTool.ts)

Title: Servitudes d’utilité publique

### Description du tool

- Renvoie, pour un point donné par sa longitude et sa latitude, la liste des assiettes de servitudes d'utilité publique (SUP) pertinentes à proximité, avec leurs propriétés associées.
- Une SUP est une contrainte légale sur l'usage du sol liée à un équipement ou une infrastructure publique (ex : AC pour patrimoine, EL pour voirie, PT pour télécoms, I pour installations classées...).
- Les résultats peuvent inclure des assiettes ponctuelles, linéaires ou surfaciques et exposent un `feature_ref` WFS réutilisable quand il est disponible.
- Pour récupérer exactement l'objet correspondant au `feature_ref`, utiliser `gpf_wfs_get_feature_by_id`.
- (source : Géoplateforme - (WFS Géoportail de l'Urbanisme)).

### Input Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `lat` | number | yes | La latitude du point. |
| `lon` | number | yes | La longitude du point. |

<details>
<summary>Raw input schema</summary>

```json
{
  "type": "object",
  "properties": {
    "lon": {
      "type": "number",
      "description": "La longitude du point.",
      "minimum": -180,
      "maximum": 180
    },
    "lat": {
      "type": "number",
      "description": "La latitude du point.",
      "minimum": -90,
      "maximum": 90
    }
  },
  "required": [
    "lon",
    "lat"
  ]
}
```

</details>

### Output Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `results` | array | yes | La liste des assiettes de servitudes d'utilité publique pertinentes pour le point demandé. |

<details>
<summary>Raw output schema</summary>

```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "description": "La liste des assiettes de servitudes d'utilité publique pertinentes pour le point demandé.",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "description": "Le type d'assiette de servitude d'utilité publique renvoyé."
          },
          "id": {
            "type": "string",
            "description": "L'identifiant de l'assiette."
          },
          "bbox": {
            "type": "array",
            "description": "La boîte englobante de l'assiette.",
            "items": {
              "type": "number"
            }
          },
          "feature_ref": {
            "type": "object",
            "description": "Référence WFS réutilisable, notamment avec `gpf_wfs_get_features` et `spatial_operator = \"intersects_feature\"`.",
            "properties": {
              "typename": {
                "type": "string",
                "description": "Le `typename` WFS réutilisable pour une requête ultérieure."
              },
              "feature_id": {
                "type": "string",
                "description": "L'identifiant WFS réutilisable du feature."
              }
            },
            "required": [
              "typename",
              "feature_id"
            ]
          },
          "distance": {
            "type": "number",
            "description": "La distance en mètres entre le point demandé et l'assiette retenue."
          }
        },
        "required": [
          "type",
          "id",
          "distance"
        ]
      }
    }
  },
  "required": [
    "results"
  ]
}
```

</details>

## `cadastre`

Source: [src/tools/CadastreTool.ts](../src/tools/CadastreTool.ts)

Title: Informations cadastrales

### Description du tool

- Renvoie, pour un point donné par sa `longitude` et sa `latitude`, la liste des objets cadastraux (arrondissement, commune, feuille, parcelle, subdivision_fiscale, localisant) les plus proches, avec leurs informations associées.
- Les résultats sont retournés au plus une fois par type lorsqu'ils sont disponibles et incluent un `feature_ref` WFS réutilisable.
- Le `feature_ref` est directement réutilisable dans `gpf_wfs_get_features` avec `spatial_operator="intersects_feature"`.
- La distance de recherche est fixée à 10 mètres.  Si aucun objet n'est trouvé dans les 10 mètres, le résultat est vide.
- Pour récupérer exactement l'objet correspondant au `feature_ref`, utiliser `gpf_wfs_get_feature_by_id`.
- (source : Géoplateforme (WFS, CADASTRALPARCELS.PARCELLAIRE_EXPRESS)).

### Input Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `lat` | number | yes | La latitude du point. |
| `lon` | number | yes | La longitude du point. |

<details>
<summary>Raw input schema</summary>

```json
{
  "type": "object",
  "properties": {
    "lon": {
      "type": "number",
      "description": "La longitude du point.",
      "minimum": -180,
      "maximum": 180
    },
    "lat": {
      "type": "number",
      "description": "La latitude du point.",
      "minimum": -90,
      "maximum": 90
    }
  },
  "required": [
    "lon",
    "lat"
  ]
}
```

</details>

### Output Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `results` | array | yes | La liste des objets cadastraux les plus proches du point demandé. |

<details>
<summary>Raw output schema</summary>

```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "description": "La liste des objets cadastraux les plus proches du point demandé.",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "description": "Le type d'objet cadastral (arrondissement, commune, feuille, parcelle, subdivision_fiscale, localisant)."
          },
          "id": {
            "type": "string",
            "description": "L'identifiant de l'objet cadastral."
          },
          "bbox": {
            "type": "array",
            "description": "La boîte englobante de l'objet cadastral.",
            "items": {
              "type": "number"
            }
          },
          "feature_ref": {
            "type": "object",
            "description": "Référence WFS réutilisable, notamment avec `gpf_wfs_get_features` et `spatial_operator = \"intersects_feature\"`.",
            "properties": {
              "typename": {
                "type": "string",
                "description": "Le `typename` WFS réutilisable pour une requête ultérieure."
              },
              "feature_id": {
                "type": "string",
                "description": "L'identifiant WFS réutilisable du feature."
              }
            },
            "required": [
              "typename",
              "feature_id"
            ]
          },
          "distance": {
            "type": "number",
            "description": "La distance en mètres entre le point demandé et l'objet cadastral retenu."
          },
          "source": {
            "type": "string",
            "description": "La source des données cadastrales."
          }
        },
        "required": [
          "type",
          "id",
          "feature_ref",
          "distance",
          "source"
        ]
      }
    }
  },
  "required": [
    "results"
  ]
}
```

</details>

## `geocode`

Source: [src/tools/GeocodeTool.ts](../src/tools/GeocodeTool.ts)

Title: Géocodage de lieux et d’adresses

### Description du tool

- Renvoie des résultats d'autocomplétion géocodés à partir d'un texte libre (lieu, adresse, POI), avec coordonnées, libellé complet et informations de localisation (`kind`, `city`, `zipcode`).
- Les coordonnées `lon/lat` retournées sont directement réutilisables dans tous les autres tools. Le champ `kind` indique le type de résultat (ex : `monument`, `street`, `city`, `locality`).
- (source : Géoplateforme (service d'autocomplétion)).

### Input Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `maximumResponses` | integer | no | Le nombre maximum de résultats à retourner (entre 1 et 10). Défaut : 3. |
| `text` | string | yes | Le texte devant être completé et géocodé |

<details>
<summary>Raw input schema</summary>

```json
{
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "description": "Le texte devant être completé et géocodé",
      "minLength": 1
    },
    "maximumResponses": {
      "type": "integer",
      "description": "Le nombre maximum de résultats à retourner (entre 1 et 10). Défaut : 3.",
      "minimum": 1,
      "maximum": 10
    }
  },
  "required": [
    "text"
  ]
}
```

</details>

### Output Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `results` | array | yes | La liste ordonnée des résultats géocodés. |

<details>
<summary>Raw output schema</summary>

```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "description": "La liste ordonnée des résultats géocodés.",
      "items": {
        "type": "object",
        "properties": {
          "lon": {
            "type": "number",
            "description": "La longitude du résultat."
          },
          "lat": {
            "type": "number",
            "description": "La latitude du résultat."
          },
          "fulltext": {
            "type": "string",
            "description": "Le libellé complet du résultat."
          },
          "kind": {
            "type": "string",
            "description": "La nature du résultat géocodé."
          },
          "city": {
            "type": "string",
            "description": "La commune du résultat."
          },
          "zipcode": {
            "type": "string",
            "description": "Le code postal du résultat."
          }
        },
        "required": [
          "lon",
          "lat",
          "fulltext"
        ]
      }
    }
  },
  "required": [
    "results"
  ]
}
```

</details>

## `gpf_wfs_describe_type`

Source: [src/tools/GpfWfsDescribeTypeTool.ts](../src/tools/GpfWfsDescribeTypeTool.ts)

Title: Description d’un type WFS

### Description du tool

- Renvoie le schéma détaillé d'un type WFS à partir de son identifiant (`typename`) : identifiants, description et liste des propriétés.
- Utiliser ce tool après `gpf_wfs_search_types` pour inspecter les propriétés disponibles avant d'appeler `gpf_wfs_get_features`.
- La sortie inclut notamment le type des propriétés, leur description, leurs valeurs possibles (`enum`) lorsqu'elles existent
- **IMPORTANT: Appel fortement recommandé si les noms exacts des propriétés ne sont pas connus : un nom de propriété incorrect provoque une erreur**.

### Input Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `typename` | string | yes | Le nom du type (ex : BDTOPO_V3:batiment) |

<details>
<summary>Raw input schema</summary>

```json
{
  "type": "object",
  "properties": {
    "typename": {
      "type": "string",
      "description": "Le nom du type (ex : BDTOPO_V3:batiment)",
      "minLength": 1
    }
  },
  "required": [
    "typename"
  ]
}
```

</details>

### Output Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `description` | string | yes | La description du type WFS. |
| `id` | string | yes | L'identifiant complet du type WFS. |
| `name` | string | yes | Le nom court du type WFS. |
| `namespace` | string | yes | L'espace de nommage du type WFS. |
| `properties` | array | yes | La liste des propriétés du type WFS. |
| `title` | string | yes | Le titre lisible du type WFS. |

<details>
<summary>Raw output schema</summary>

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "L'identifiant complet du type WFS."
    },
    "namespace": {
      "type": "string",
      "description": "L'espace de nommage du type WFS."
    },
    "name": {
      "type": "string",
      "description": "Le nom court du type WFS."
    },
    "title": {
      "type": "string",
      "description": "Le titre lisible du type WFS."
    },
    "description": {
      "type": "string",
      "description": "La description du type WFS."
    },
    "properties": {
      "type": "array",
      "description": "La liste des propriétés du type WFS.",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Le nom de la propriété."
          },
          "type": {
            "type": "string",
            "description": "Le type de la propriété."
          },
          "title": {
            "type": "string",
            "description": "Le titre lisible de la propriété."
          },
          "description": {
            "type": "string",
            "description": "La description de la propriété."
          },
          "enum": {
            "type": "array",
            "description": "Les valeurs possibles de la propriété.",
            "items": {
              "type": "string"
            }
          },
          "defaultCrs": {
            "type": "string",
            "description": "Le système de coordonnées par défaut si la propriété est géométrique."
          }
        },
        "required": [
          "name",
          "type"
        ]
      }
    }
  },
  "required": [
    "id",
    "namespace",
    "name",
    "title",
    "description",
    "properties"
  ]
}
```

</details>

## `gpf_wfs_get_feature_by_id`

Source: [src/tools/GpfWfsGetFeatureByIdTool.ts](../src/tools/GpfWfsGetFeatureByIdTool.ts)

Title: Lecture d’un objet WFS par identifiant

### Description du tool

- Récupère exactement un objet WFS à partir de `typename` et `feature_id`, sans filtre attributaire ni spatial.
- Ce tool est le chemin robuste quand vous disposez déjà d'une `feature_ref { typename, feature_id }` issue d'un autre tool (`adminexpress`, `cadastre`, `urbanisme`, `assiette_sup`, `gpf_wfs_get_features`).
- Le contrat garantit une cardinalité stricte : 0 résultat ou plusieurs résultats provoquent une erreur explicite.
- Utiliser `result_type="request"` pour récupérer la requête WFS compilée (avec `get_url`) et l'utiliser ou la visualiser ailleurs.

### Input Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `feature_id` | string | yes | Identifiant WFS exact de l'objet à récupérer, par exemple `commune.8952`. |
| `result_type` | string | no | `results` renvoie une FeatureCollection normalisée avec exactement un objet. `request` renvoie la requête WFS compilée (`get_url`) à destination de `create_map` via `geojson_url`, ou pour déboguer. Values: results, request. Default: results. |
| `select` | array | no | Liste des propriétés non géométriques à renvoyer. Quand `result_type="request"`, la géométrie est automatiquement ajoutée. |
| `typename` | string | yes | Nom exact du type WFS à interroger, par exemple `ADMINEXPRESS-COG.LATEST:commune`. |

<details>
<summary>Raw input schema</summary>

```json
{
  "type": "object",
  "properties": {
    "typename": {
      "type": "string",
      "minLength": 1,
      "description": "Nom exact du type WFS à interroger, par exemple `ADMINEXPRESS-COG.LATEST:commune`."
    },
    "feature_id": {
      "type": "string",
      "minLength": 1,
      "description": "Identifiant WFS exact de l'objet à récupérer, par exemple `commune.8952`."
    },
    "result_type": {
      "type": "string",
      "enum": [
        "results",
        "request"
      ],
      "default": "results",
      "description": "`results` renvoie une FeatureCollection normalisée avec exactement un objet. `request` renvoie la requête WFS compilée (`get_url`) à destination de `create_map` via `geojson_url`, ou pour déboguer."
    },
    "select": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1
      },
      "minItems": 1,
      "description": "Liste des propriétés non géométriques à renvoyer. Quand `result_type=\"request\"`, la géométrie est automatiquement ajoutée."
    }
  },
  "required": [
    "typename",
    "feature_id"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

</details>

### Output

No single `outputSchema` is exposed. Output depends on `result_type` (`results`, `request`).

## `gpf_wfs_get_features`

Source: [src/tools/GpfWfsGetFeaturesTool.ts](../src/tools/GpfWfsGetFeaturesTool.ts)

Title: Lecture d’objets WFS

### Description du tool

- Interroge un type WFS et renvoie des résultats structurés sans demander au modèle d'écrire du CQL ou du WFS.
- Utiliser `select` pour choisir les propriétés, `where` pour filtrer, `order_by` pour trier et `spatial_operator` avec ses paramètres dédiés pour le spatial. Avec `result_type="request"`, la géométrie est automatiquement ajoutée aux propriétés sélectionnées pour garantir une requête cartographiable.
- Exemple attributaire : `where=[{ property: "code_insee", operator: "eq", value: "75056" }]`.
- Exemple bbox : `spatial_operator="bbox"` avec `bbox_west`, `bbox_south`, `bbox_east`, `bbox_north` en `lon/lat`.
- Exemple point dans géométrie : `spatial_operator="intersects_point"` avec `intersects_lon` et `intersects_lat`.
- Exemple distance : `spatial_operator="dwithin_point"` avec `dwithin_lon`, `dwithin_lat`, `dwithin_distance_m`.
- Exemple réutilisation : `spatial_operator="intersects_feature"` avec `intersects_feature_typename` et `intersects_feature_id` issus d'une `feature_ref`.
- ⚠️ Quand `typename` et `intersects_feature_typename` sont identiques, utiliser `gpf_wfs_get_feature_by_id` pour récupérer exactement l'objet ciblé.
- **OBLIGATOIRE : toujours appeler `gpf_wfs_describe_type` avant ce tool, sauf si `gpf_wfs_describe_type` a déjà été appelé pour ce même typename dans la conversation en cours.**
- Les noms de propriétés **ne peuvent pas être devinés** : ils sont spécifiques à chaque typename et diffèrent systématiquement des conventions habituelles (ex : pas de nom_officiel, navigabilite sans accent, etc.). Toute tentative sans appel préalable à `gpf_wfs_describe_type` **provoquera une erreur.**

### Input Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `bbox_east` | number | no | Longitude est en WGS84 `lon/lat`, utilisée avec `spatial_operator = "bbox"`. |
| `bbox_north` | number | no | Latitude nord en WGS84 `lon/lat`, utilisée avec `spatial_operator = "bbox"`. |
| `bbox_south` | number | no | Latitude sud en WGS84 `lon/lat`, utilisée avec `spatial_operator = "bbox"`. |
| `bbox_west` | number | no | Longitude ouest en WGS84 `lon/lat`, utilisée avec `spatial_operator = "bbox"`. |
| `dwithin_distance_m` | number | no | Distance en mètres, utilisée avec `spatial_operator = "dwithin_point"`. |
| `dwithin_lat` | number | no | Latitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = "dwithin_point"`. |
| `dwithin_lon` | number | no | Longitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = "dwithin_point"`. |
| `intersects_feature_id` | string | no | Identifiant du feature de référence, utilisé avec `spatial_operator = "intersects_feature"`. |
| `intersects_feature_typename` | string | no | Type WFS du feature de référence, utilisé avec `spatial_operator = "intersects_feature"`. |
| `intersects_lat` | number | no | Latitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = "intersects_point"`. |
| `intersects_lon` | number | no | Longitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = "intersects_point"`. |
| `limit` | integer | no | Nombre maximum d'objets à renvoyer. Valeur par défaut : 100. Maximum : 5000. Default: 100. |
| `order_by` | array | no | Liste ordonnée des critères de tri. |
| `result_type` | string | no | `results` renvoie une FeatureCollection avec les propriétés attributaires uniquement — **les géométries ne sont pas incluses**, ce mode ne peut donc pas être utilisé directement pour cartographier. `hits` renvoie uniquement le nombre total d'objets correspondant à la requête. `request` renvoie l'URL WFS compilée (`get_url`) à destination de `create_map` via `geojson_url`, ou pour déboguer la requête générée. **La géométrie est automatiquement ajoutée aux propriétés du `select`** pour garantir l'affichage cartographique. Values: results, hits, request. Default: results. |
| `select` | array | no | Liste des propriétés non géométriques à renvoyer pour chaque objet. Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles. Exemple : `["code_insee", "nom_officiel"]`. |
| `spatial_operator` | string | no | Type optionnel de filtre spatial. Values: bbox, intersects_point, dwithin_point, intersects_feature. |
| `typename` | string | yes | Nom exact du type WFS à interroger, par exemple `BDTOPO_V3:batiment`. Utiliser `gpf_wfs_search_types` pour trouver un `typename` valide. |
| `where` | array | no | Clauses de filtre attributaire, combinées avec `AND`. |

<details>
<summary>Raw input schema</summary>

```json
{
  "type": "object",
  "properties": {
    "typename": {
      "type": "string",
      "minLength": 1,
      "description": "Nom exact du type WFS à interroger, par exemple `BDTOPO_V3:batiment`. Utiliser `gpf_wfs_search_types` pour trouver un `typename` valide."
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5000,
      "default": 100,
      "description": "Nombre maximum d'objets à renvoyer. Valeur par défaut : 100. Maximum : 5000."
    },
    "result_type": {
      "type": "string",
      "enum": [
        "results",
        "hits",
        "request"
      ],
      "default": "results",
      "description": "`results` renvoie une FeatureCollection avec les propriétés attributaires uniquement — **les géométries ne sont pas incluses**, ce mode ne peut donc pas être utilisé directement pour cartographier. `hits` renvoie uniquement le nombre total d'objets correspondant à la requête. `request` renvoie l'URL WFS compilée (`get_url`) à destination de `create_map` via `geojson_url`, ou pour déboguer la requête générée. **La géométrie est automatiquement ajoutée aux propriétés du `select`** pour garantir l'affichage cartographique."
    },
    "select": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1
      },
      "minItems": 1,
      "description": "Liste des propriétés non géométriques à renvoyer pour chaque objet. Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles. Exemple : `[\"code_insee\", \"nom_officiel\"]`."
    },
    "order_by": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "property": {
            "type": "string",
            "minLength": 1,
            "description": "Nom exact d'une propriété non géométrique à utiliser pour le tri. Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles."
          },
          "direction": {
            "type": "string",
            "enum": [
              "asc",
              "desc"
            ],
            "default": "asc",
            "description": "Direction de tri : `asc` ou `desc`."
          }
        },
        "required": [
          "property"
        ],
        "additionalProperties": false,
        "description": "Critère de tri structuré. Exemple : `{ property: \"population\", direction: \"desc\" }`."
      },
      "minItems": 1,
      "description": "Liste ordonnée des critères de tri."
    },
    "where": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "property": {
            "type": "string",
            "minLength": 1,
            "description": "Nom exact d'une propriété non géométrique du type WFS. Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles."
          },
          "operator": {
            "type": "string",
            "enum": [
              "eq",
              "ne",
              "lt",
              "lte",
              "gt",
              "gte",
              "in",
              "is_null"
            ],
            "description": "Opérateur de filtre : `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `is_null`."
          },
          "value": {
            "type": "string",
            "description": "Valeur scalaire sérialisée en texte, utilisée avec tous les opérateurs sauf `in` et `is_null`."
          },
          "values": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 1,
            "description": "Liste de valeurs sérialisées en texte, utilisée uniquement avec `operator = \"in\"`."
          }
        },
        "required": [
          "property",
          "operator"
        ],
        "additionalProperties": false,
        "description": "Clause de filtre structurée. Exemple : `{ property: \"code_insee\", operator: \"eq\", value: \"75056\" }`."
      },
      "minItems": 1,
      "description": "Clauses de filtre attributaire, combinées avec `AND`."
    },
    "spatial_operator": {
      "type": "string",
      "enum": [
        "bbox",
        "intersects_point",
        "dwithin_point",
        "intersects_feature"
      ],
      "description": "Type optionnel de filtre spatial."
    },
    "bbox_west": {
      "type": "number",
      "minimum": -180,
      "maximum": 180,
      "description": "Longitude ouest en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"bbox\"`."
    },
    "bbox_south": {
      "type": "number",
      "minimum": -90,
      "maximum": 90,
      "description": "Latitude sud en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"bbox\"`."
    },
    "bbox_east": {
      "type": "number",
      "minimum": -180,
      "maximum": 180,
      "description": "Longitude est en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"bbox\"`."
    },
    "bbox_north": {
      "type": "number",
      "minimum": -90,
      "maximum": 90,
      "description": "Latitude nord en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"bbox\"`."
    },
    "intersects_lon": {
      "type": "number",
      "minimum": -180,
      "maximum": 180,
      "description": "Longitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"intersects_point\"`."
    },
    "intersects_lat": {
      "type": "number",
      "minimum": -90,
      "maximum": 90,
      "description": "Latitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"intersects_point\"`."
    },
    "dwithin_lon": {
      "type": "number",
      "minimum": -180,
      "maximum": 180,
      "description": "Longitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"dwithin_point\"`."
    },
    "dwithin_lat": {
      "type": "number",
      "minimum": -90,
      "maximum": 90,
      "description": "Latitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"dwithin_point\"`."
    },
    "dwithin_distance_m": {
      "type": "number",
      "exclusiveMinimum": 0,
      "description": "Distance en mètres, utilisée avec `spatial_operator = \"dwithin_point\"`."
    },
    "intersects_feature_typename": {
      "type": "string",
      "minLength": 1,
      "description": "Type WFS du feature de référence, utilisé avec `spatial_operator = \"intersects_feature\"`."
    },
    "intersects_feature_id": {
      "type": "string",
      "minLength": 1,
      "description": "Identifiant du feature de référence, utilisé avec `spatial_operator = \"intersects_feature\"`."
    }
  },
  "required": [
    "typename"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

</details>

### Output

No single `outputSchema` is exposed. Output depends on `result_type` (`results`, `hits`, `request`).

## `gpf_wfs_search_types`

Source: [src/tools/GpfWfsSearchTypesTool.ts](../src/tools/GpfWfsSearchTypesTool.ts)

Title: Recherche de types WFS

### Description du tool

- Recherche des types WFS de la Géoplateforme (GPF) à partir de mots-clés afin de trouver un identifiant de type (`typename`) valide.
- La recherche est textuelle (mini-search) et retourne une liste ordonnée de candidats avec leur identifiant, leur titre, leur description et un score de pertinence éventuel.
- Le paramètre `max_results` permet d'élargir le nombre de candidats retournés (10 par défaut).
- **Important** : Utiliser ce tool avant `gpf_wfs_describe_type` ou `gpf_wfs_get_features` lorsque le nom exact du type n'est pas connu.
- **Important** : Privilégier des termes métier en français pour la recherche.

### Input Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `max_results` | integer | no | Le nombre maximum de résultats à retourner (entre 1 et 50). Défaut : 10. |
| `query` | string | yes | La requête de recherche |

<details>
<summary>Raw input schema</summary>

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "La requête de recherche",
      "minLength": 1
    },
    "max_results": {
      "type": "integer",
      "description": "Le nombre maximum de résultats à retourner (entre 1 et 50). Défaut : 10.",
      "minimum": 1,
      "maximum": 50
    }
  },
  "required": [
    "query"
  ]
}
```

</details>

### Output Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `results` | array | yes | La liste ordonnée des types WFS trouvés. |

<details>
<summary>Raw output schema</summary>

```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "description": "La liste ordonnée des types WFS trouvés.",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "L'identifiant complet du type WFS."
          },
          "title": {
            "type": "string",
            "description": "Le titre lisible du type WFS."
          },
          "description": {
            "type": "string",
            "description": "La description du type WFS."
          },
          "score": {
            "type": "number",
            "description": "Le score de pertinence de la recherche."
          }
        },
        "required": [
          "id",
          "title",
          "description"
        ]
      }
    }
  },
  "required": [
    "results"
  ]
}
```

</details>

## `urbanisme`

Source: [src/tools/UrbanismeTool.ts](../src/tools/UrbanismeTool.ts)

Title: Informations d’urbanisme

### Description du tool

- Renvoie, pour un point donné par sa `longitude` et sa `latitude`, la liste des objets d'urbanisme pertinents du Géoportail de l'Urbanisme (document, zones, prescriptions, informations, etc.), avec leurs propriétés associées. (source : Géoplateforme - (WFS Géoportail de l'Urbanisme)).
- Les résultats peuvent notamment inclure le document d'urbanisme applicable ainsi que des éléments réglementaires associés à proximité du point.
- Quand un objet correspond à une couche WFS réutilisable, il expose aussi un `feature_ref` compatible avec `gpf_wfs_get_features` et `spatial_operator="intersects_feature"`.
- Le zonage PLU (zone U, AU, A, N...) est inclus dans les zones retournées et constitue souvent l'information principale recherchée.
- Pour récupérer exactement l'objet correspondant au `feature_ref`, utiliser `gpf_wfs_get_feature_by_id`.
- Modèles d'URL Géoportail de l'Urbanisme :
- - fiche document: https://www.geoportail-urbanisme.gouv.fr/document/by-id/{gpu_doc_id}
- - carte: https://www.geoportail-urbanisme.gouv.fr/map/?documentId={gpu_doc_id}
- - fichier: https://www.geoportail-urbanisme.gouv.fr/api/document/{gpu_doc_id}/files/{nomfic}

### Input Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `lat` | number | yes | La latitude du point. |
| `lon` | number | yes | La longitude du point. |

<details>
<summary>Raw input schema</summary>

```json
{
  "type": "object",
  "properties": {
    "lon": {
      "type": "number",
      "description": "La longitude du point.",
      "minimum": -180,
      "maximum": 180
    },
    "lat": {
      "type": "number",
      "description": "La latitude du point.",
      "minimum": -90,
      "maximum": 90
    }
  },
  "required": [
    "lon",
    "lat"
  ]
}
```

</details>

### Output Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `results` | array | yes | La liste des objets d'urbanisme pertinents pour le point demandé. |

<details>
<summary>Raw output schema</summary>

```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "description": "La liste des objets d'urbanisme pertinents pour le point demandé.",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "description": "Le type d'objet d'urbanisme renvoyé."
          },
          "id": {
            "type": "string",
            "description": "L'identifiant de l'objet d'urbanisme."
          },
          "bbox": {
            "type": "array",
            "description": "La boîte englobante de l'objet d'urbanisme.",
            "items": {
              "type": "number"
            }
          },
          "feature_ref": {
            "type": "object",
            "description": "Référence WFS réutilisable, notamment avec `gpf_wfs_get_features` et `spatial_operator = \"intersects_feature\"`.",
            "properties": {
              "typename": {
                "type": "string",
                "description": "Le `typename` WFS réutilisable pour une requête ultérieure."
              },
              "feature_id": {
                "type": "string",
                "description": "L'identifiant WFS réutilisable du feature."
              }
            },
            "required": [
              "typename",
              "feature_id"
            ]
          },
          "distance": {
            "type": "number",
            "description": "La distance en mètres entre le point demandé et l'objet d'urbanisme retenu."
          }
        },
        "required": [
          "type",
          "id",
          "distance"
        ]
      }
    }
  },
  "required": [
    "results"
  ]
}
```

</details>
