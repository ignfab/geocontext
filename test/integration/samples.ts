/**
 * Shared test data for integration tests.
 */

/** Well-known coordinates for testing */
export const paris = { lon: 2.333333, lat: 48.866667 };
export const chamonix = { lon: 6.869433, lat: 45.923697 };
export const marseille = { lon: 5.4, lat: 43.3 };
export const besancon = { lon: 6.0240539, lat: 47.237829 };

/**
 * Expected list of tool names exposed by the geocontext MCP server.
 * Keep in sync with src/tools/*.ts
 */
export const EXPECTED_TOOL_NAMES = [
  "geocode",
  "altitude",
  "adminexpress",
  "cadastre",
  "urbanisme",
  "assiette_sup",
  "gpf_wfs_search_types",
  "gpf_wfs_describe_type",
  "gpf_wfs_get_features",
  "gpf_wfs_get_feature_by_id",
] as const;
