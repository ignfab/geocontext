# geocontext

Un serveur MCP expérimental fournissant du contexte spatial pour les LLM.

## Motivation

Les LLM renforcent l'idée que la magie est possible avec l'informatique. Il n'en est rien. Pour qu'un assistant soit en mesure de connaître la date et l'heure, il faut par exemple l'interfacer avec un [MCP time](https://mcpservers.org/servers/modelcontextprotocol/time). De même, pour qu'il soit en mesure de lire une page, il faut par exemple l'interfacer un [MCP fetch](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch#readme).

En matière de données géographique, si un utilisateur pose une question impliquant que l'assistant soit en mesure de [connaître la position d'une adresse, il y a de bonne chance que la réponse soit plausible mais fausse](https://github.com/mborne/llm-experimentations/tree/main/chatgpt-geocodage-limites#readme).

S'il est techniquement possible de brancher des API REST/GeoJSON telle APICARTO, la conception de ces dernières n'est pas adaptée (5000 résultat par défaut, grosse géométrie dans les réponses, géométries complexes à fournir,...).

L'idée est ici d'**expérimenter la conception d'un MCP rendant les données et les services de la Géoplateforme accessibles par un LLM**.

## Mises en garde

- Ce développement est un POC en incubation au sein d'ignfab (archivage en cours de [mborne/geocontext](https://github.com/mborne/geocontext))
- S'il s'avère utile de l'industrialiser, le dépôt sera migré sous responsabilité IGN et l'outil sera renommé (ex : `IGNF/mcp-gpf-server`)
- Plusieurs problèmes et améliorations possibles ont été identifiés et sont en cours de mitigation/résolution (c.f. [issues](https://github.com/ignfab/geocontext/issues?q=is%3Aissue%20state%3Aopen%20label%3Ametadata)).
- Cet outil n'est pas magique (voir [Fonctionnalités](#fonctionnalités) pour avoir une idée de ses capacités)

## Principes de conception

- **Ne pas copier les données de la Géoplateforme** (but : identifier les améliorations possibles sur le services plutôt que les doublonner)
- **Limiter au maximum la taille des réponses** (but : optimiser le nombre de jeton / éviter les hallucinations / pouvoir utiliser des modèles locaux)
- ...

## Utilisation

### Utilisation de la version publiée

Par exemple, avec "Cursor Settings / MCP / Add server" :

```json
{
  "mcpServers": {
    "geocontext": {
      "command": "npx",
      "args": ["-y", "@ignfab/geocontext"]
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
    "geocontext": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Développement

### Construction de la version locale

```bash
git clone https://github.com/ignfab/geocontext
cd geocontext
npm install
npm run build
```

### Utilisation de la version locale

#### Avec un client MCP compatible JSON

```json
{
  "mcpServers": {
    "geocontext": {
      "command": "node",
      "args":["/chemin/absolu/vers/geocontext/dist/index.js"]
    }
  }
}
```

#### Avec Codex CLI / VS Code

Avec Codex CLI ou l'extension Codex pour VS Code, la configuration se fait dans `~/.codex/config.toml` :

```toml
[mcp_servers.geocontext]
command = "node"
args = ["/chemin/absolu/vers/geocontext/dist/index.js"]

# Définition d'un corporate proxy si nécessaire
[mcp_servers.geocontext.env]
HTTPS_PROXY = "http://proxy.domain.fr:3128"
HTTP_PROXY = "http://proxy.domain.fr:3128"
NO_PROXY = "localhost,127.0.0.1"
http_proxy = "http://proxy.domain.fr:3128"
https_proxy = "http://proxy.domain.fr:3128"
no_proxy = "localhost,127.0.0.1"
```

Après mise à jour de `~/.codex/config.toml`, relancer la session Codex CLI ou recharger VS Code si l'extension Codex est déjà ouverte.

### Debug de la version locale

```bash
npx -y @modelcontextprotocol/inspector node dist/index.js
```

## Paramétrage

Pour une utilisation avancée :

| Nom              | Description                                                                                                          | Valeur par défaut |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `TRANSPORT_TYPE` | [Transport](https://mcp-framework.com/docs/Transports/transports-overview) permet de choisir entre "stdio" et "http" | "stdio"           |
| `GPF_WFS_MINISEARCH_OPTIONS` | Chaîne JSON optionnelle pour ajuster les options MiniSearch utilisées par `gpf_wfs_search_types` (`fields`, `combineWith`, `fuzzy`, `boost.namespace`, `boost.name`, `boost.title`, `boost.description`, `boost.properties`, `boost.enums`, `boost.identifierTokens`). | options par défaut de `@ignfab/gpf-schema-store` |

Exemple :

```bash
export GPF_WFS_MINISEARCH_OPTIONS='{"fields":["title","identifierTokens"],"combineWith":"OR","fuzzy":0.05,"boost":{"title":4,"name":5}}'
```

Si `GPF_WFS_MINISEARCH_OPTIONS` est absent ou vide, les options par défaut restent celles de `@ignfab/gpf-schema-store`, y compris le comportement par défaut `OR` de MiniSearch pour `combineWith`.

Remarque :

- Les outils `gpf_wfs_list_types`, `gpf_wfs_search_types` et `gpf_wfs_describe_type` s'appuient sur un catalogue de schémas embarqué fourni par `@ignfab/gpf-schema-store`.
- L'outil `gpf_wfs_get_features` interroge toujours le service WFS de la Géoplateforme en direct.
- Le catalogue embarqué améliore la description des featureTypes mais il peut être légèrement décalé par rapport à l'état courant du WFS.

## Fonctionnalités

### Utiliser des services spatiaux

Quelques services de la Géoplateforme :

* [geocode(text)](src/tools/GeocodeTool.ts) s'appuie sur le [service d’autocomplétion de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/autocompletion) pour **convertir un nom de lieu en position (lon,lat)**.

> Ex : Quelle est la position (lon,lat) de la mairie de Vincennes?

* [altitude(lon,lat)](src/tools/AltitudeTool.ts) s'appuie sur le [service de calcul altimétrique de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie) pour **convertir une position en altitude**. 

> Ex : Quelle est l'altitude de la mairie de Loray (25)?

### Recherche d'informations pour un lieu

L'idée est ici de répondre à des précises en traitant côté serveur les appels aux services WFS de la Géoplateforme :

* [adminexpress(lon,lat)](src/tools/AdminexpressTool.ts) permet de **récupérer les informations administratives (commune, département, région,...)** pour un lieu donné par sa position.

> Ex : Quelles sont les informations administrative pour la mairie de Vincennes?

* [cadastre(lon,lat)](src/tools/CadastreTool.ts) permet de **récupérer les informations cadastrales (parcelle, feuille,...)**.

> Ex : Quelles sont les informations du cadastre pour la mairie de Vincennes?

* [urbanisme(lon,lat)](src/tools/UrbanismeTool.ts) permet de **récupérer les informations d'urbanisme (PLU,POS,CC,PSMV)**

> Ex : Quel est le document PLU en vigueur pour le port de Marseille?

* [assiette_sup(lon,lat)](src/tools/AssietteSupTool.ts) permet de **récupérer les Servitude d'Utilité Publiques (SUP)**

### Explorer les données vecteurs

#### Explorer les tables

* [gpf_wfs_list_types()](src/tools/GpfWfsListTypesTool.ts) pour **lister de façon exhaustive les types WFS connus du catalogue de schémas embarqué**. Cet outil est surtout utile pour un inventaire complet ou une exploration globale du catalogue ; pour trouver rapidement un type pertinent, préférer `gpf_wfs_search_types`.
* [gpf_wfs_search_types(keywords,max_results=10)](src/tools/GpfWfsSearchTypesTool.ts) pour **rechercher un type WFS pertinent à partir de mots-clés et obtenir un `typename` valide**. La recherche est textuelle et configurable via `GPF_WFS_MINISEARCH_OPTIONS`.

> - Quels sont les millésimes ADMINEXPRESS disponibles sur la Géoplateforme?
> - Quelle est la table de la BDTOPO correspondant aux bâtiments?
> - Dans quelle table de la BDTOPO peut-on trouver les ponts?

#### Explorer la structure des tables

* [gpf_wfs_describe_type(typename)](src/tools/GpfWfsDescribeTypeTool.ts) pour récupérer le **schéma détaillé d'un type WFS** depuis le catalogue embarqué (`id`, `namespace`, `name`, `title`, `description`, `properties`), en particulier avant d'appeler `gpf_wfs_get_features`

> - Quelles sont les informations disponibles pour les communes avec ADMINEXPRESS-COG.LATEST?
> - Compare le modèle des communes entre ADMINEXPRESS-COG:2024 et ADMINEXPRESS-COG.LATEST

#### Explorer les données des tables

* [gpf_wfs_get_features(typename,...)](src/tools/GpfWfsGetFeaturesTool.ts) pour **récupérer les données d'une table** depuis le service WFS de la Géoplateforme ([GetFeature](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typename=ADMINEXPRESS-COG.LATEST:commune&outputFormat=application/json&count=1))

> - Quelles sont les 5 communes les plus peuplées du Doubs (25)?
> - Combien y-a-t'il de bâtiments à moins de 5 km de la tour Eiffel?

## Contribution

### Problèmes et demandes d'évolutions

N'hésitez pas à [créer une issue](https://github.com/ignfab/geocontext/issues) si vous rencontrez un problème! Merci de fournir :

- L'assistant et le modèle utilisé
- La demande que vous faite à l'assistant (ex : "Combien y a-t'il de pont franchissant la seine?")

### Proposer une nouvelle fonctionnalité

N'hésitez pas :

- Forker le dépôt
- Créer un nouveau tool
- Tester de votre côté
- Faire une pull-request



## Crédits

* [mcp-framework](https://mcp-framework.com) fournit le **cadre de développement du MCP** :

```bash
# Par exemple, pour exposer la liste des couches WMTS
mcp add tool gpf_wmts_layers
```

* [@camptocamp/ogc-client](https://camptocamp.github.io/ogc-client/#/) pour la **lecture des réponses XML des services WFS, WMTS,...**
* [@ignfab/gpf-schema-store](https://www.npmjs.com/package/@ignfab/gpf-schema-store) pour le **catalogue de schémas embarqué** utilisé par les outils d'exploration WFS.
* [MiniSearch](https://github.com/lucaong/minisearch) pour la **recherche par mot clé** utilisée dans `@ignfab/gpf-schema-store`.
* [jsts](https://bjornharrtell.github.io/jsts/) pour les **traitements géométriques** (ex : tri des réponses par distance au point recherché).

## Licence

[MIT](LICENSE)


