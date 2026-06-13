import { describe, expect, it } from "vitest";
import { PointsDInteretClient } from "../../src/gpf/pointsdinteret.js";
import { RateLimiter } from "../../src/helpers/RateLimiter.js";

const rawPointsDInteretServiceResponse = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          45.10948,
          -12.855996
        ]
      },
      "properties": {
        "name": [
          "Pengoua Bolé"
        ],
        "toponym": "Pengoua Bolé",
        "category": [
          "sommet",
          "élément topographique ou forestier",
          "détail orographique"
        ],
        "classification": 8,
        "importance": 0.3,
        "extrafields": {
          "cleabs": "PAIOROGR0000001600001372"
        },
        "citycode": [
          "97616"
        ],
        "depcode": [
          "976"
        ],
        "city": [
          "Sada"
        ],
        "postcode": [
          "97640"
        ],
        "territory": "DOMTOM",
        "distance": 30,
        "score": 0.997,
        "_type": "poi"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          45.110309,
          -12.859327
        ]
      },
      "properties": {
        "name": [
          "Sada"
        ],
        "toponym": "Sada",
        "category": [
          "administratif",
          "commune"
        ],
        "postcode": [
          "97640"
        ],
        "citycode": [
          "97616"
        ],
        "depcode": [
          "976"
        ],
        "classification": 2,
        "importance": 0.9,
        "extrafields": {
          "population": "11156",
          "status": "",
          "cleabs": "COMMUNE_0000001600043245"
        },
        "territory": "DOMTOM",
        "distance": 407,
        "score": 0.9593,
        "_type": "poi"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          45.101193,
          -12.805296
        ]
      },
      "properties": {
        "name": [
          "CC du Centre-Ouest"
        ],
        "toponym": "CC du Centre-Ouest",
        "category": [
          "administratif",
          "epci"
        ],
        "classification": 2,
        "importance": 0.9,
        "extrafields": {
          "codes_insee_des_communes_membres": [
            "97617",
            "97616",
            "97614",
            "97605",
            "97613"
          ],
          "cleabs": "EPCI____0000002150236238"
        },
        "territory": "DOMTOM",
        "distance": 5684,
        "score": 0.4316,
        "_type": "poi"
      }
    }
  ]
};

describe("Test PointsDInteretClient.pointsdinteret",() => {
  it("should identify 'Pengoua Bolé'", async () => {
    const rateLimiter = new RateLimiter({ name: "test", maxCalls: 100, period: 1 });
    const client = new PointsDInteretClient(rateLimiter, async () => ({
      features: [rawPointsDInteretServiceResponse.features[0], rawPointsDInteretServiceResponse.features[1]],
    }));
    const results = await client.pointsdinteret(45.104692, -12.84725, 3);
    expect(results.length).toBeGreaterThan(0);
    const firstItem = results[0];

    expect(firstItem.name).toEqual("Pengoua Bolé");
    expect(firstItem.centroid?.lon).toBeCloseTo(45.10948);
    expect(firstItem.centroid?.lat).toBeCloseTo(-12.855996);
    expect(firstItem.categories).toEqual(["sommet", "élément topographique ou forestier", "détail orographique"]);
    expect(firstItem.city).toEqual('Sada');
    expect(firstItem.zipcode).toEqual('97640');
    expect(firstItem.distance).toBeCloseTo(30)

  });

  it("should honor maximumResponses", async () => {
    const rateLimiter = new RateLimiter({ name: "test", maxCalls: 100, period: 1 });
    const client = new PointsDInteretClient(rateLimiter, async () => ({
      features: [rawPointsDInteretServiceResponse.features[2]],
    }));
    const results = await client.pointsdinteret(45.101193, -12.805296, 1);

    expect(results).toHaveLength(1);
  });

  it("should return an empty array for unknown points", async () => {
    const rateLimiter = new RateLimiter({ name: "test", maxCalls: 100, period: 1 });
    const client = new PointsDInteretClient(rateLimiter, async () => ({ features: [] }));
    const results = await client.pointsdinteret(-135.645895, -39.143907);

    expect(results).toEqual([]);
  });

});
