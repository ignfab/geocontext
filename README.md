# geocontext

Un serveur MCP expérimental fournissant du contexte spatial pour les LLM.

## Utilisation

### Utilisation de la version publiée

Par exemple, avec "Cursor Settings / MCP / Add server" :

```json
{
  "mcpServers": {
    "geocontext": {
      "command": "npx",
      "args": ["-y", "@mborne/geocontext"]
    }
  }
}
```

### Utilisation avec Docker

```bash
docker compose build
docker compose up -d
```

Ensuite :

```json
{
  "mcpServers": {
    "server-name": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Développement

### Construction de la version locale

```bash
git clone https://github.com/mborne/geocontext
cd geocontext
npm install
npm run build
```

### Utilisation de la version locale

```json
{
  "mcpServers": {
    "mcp-helloworld": {
      "command": "node",
      "args":["/chemin/absolu/vers/geocontext/dist/index.js"]
    }
  }
}
```


## Paramétrage

Pour une utilisation avancée :

| Nom              | Description                                                                                                          | Valeur par défaut |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `TRANSPORT_TYPE` | [Transport](https://mcp-framework.com/docs/Transports/transports-overview) permet de choisir entre "stdio" et "http" | "stdio"           |

## Fonctionnalités

### Utiliser des services spatiaux

Quelques services de la Géoplateforme :

* [geocode(text)](src/tools/GeocodeTool.ts) s'appuie sur le [service d’autocomplétion de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/autocompletion) pour **convertir un nom de lieu en position (lon,lat)**.

> Quelle est la position (lon,lat) de la mairie de Vincennes?

* [altitude(lon,lat)](src/tools/AltitudeTool.ts) s'appuie sur le [service de calcul altimétrique de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie) pour **convertir une position en altitude**. 

> Ex : "Quelle est l'altitude de la mairie de Loray?"

### Recherche d'informations pour un lieu

L'idée est ici de répondre à des précises en traitant côté serveur les appels aux services WFS de la Géoplateforme :

* [adminexpress(lon,lat)](src/tools/AdminexpressTool.ts) permet de **récupérer les informations administratives (commune, département, région,...)** pour un lieu donné par sa position.
* [cadastre(lon,lat)](src/tools/CadastreTool.ts) permet de **récupérer les informations cadastrales (parcelle, feuille,...)**.
* [urbanisme(lon,lat)](src/tools/UrbanismeTool.ts) permet de **récupérer les informations d'urbanisme (PLU,POS,CC,PSMV)**
* [assiette_sup(lon,lat)](src/tools/AssietteSupTool.ts) permet de **récupérer les Servitude d'Utilité Publiques (SUP)**

### Recherche d'information générique

L'idée est ici de laisser le LLM exploiter les possibilités offertes par le LLM (**BLINDAGE EN COURS**) :

* [gpf_get_feature_types()](src/tools/GpfWfsGetTypesTool.ts) pour **lister les tables disponibles sur le WFS de la Géoplateforme** ([GetCapabilities](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities))

> Ex : "Quelles sont les données disponibles pour les communes?", "Quels sont les millésimes ADMINEXPRESS disponibles sur la Géoplateforme?"

* [gpf_wfs_describe_type(typename)](src/tools/GpfWfsDescribeTypeTool.ts) pour récupérer le **schéma d'une table** ([DescribeFeatureType](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=DescribeFeatureType&typename=ADMINEXPRESS-COG.LATEST:commune&outputFormat=application/json))

> Ex : "Quelles sont les informations disponibles pour les communes avec ADMINEXPRESS-COG.LATEST?"

* [gpf_wfs_get_features(typename,...)](src/tools/GpfWfsGetFeaturesTool.ts) pour **récupérer les données d'une table** ([GetFeature](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typename=ADMINEXPRESS-COG.LATEST:commune&outputFormat=application/json&count=1))

> Ex : "Quelles sont les 5 communes les plus peuplées du Doubs (25) (source : ADMINEXPRESS-COG.LATEST:commune)?"


## Crédits

* [mcp-framework](https://mcp-framework.com)
* [@camptocamp/ogc-client](https://camptocamp.github.io/ogc-client/#/)
* [jsts](https://bjornharrtell.github.io/jsts/)

## Licence

[MIT](LICENSE)

