/**
 * Builds the absolute, opaque `data_url` a layer-producer tool hands to a map
 * client, shared by `gpf_get_features_layer` and `gpf_get_feature_by_id_layer`.
 *
 * Shape: `${base}${PROXY_ENDPOINT}/<token>.json`. The token is a single path
 * segment — base64url is path-safe, so it needs no percent-encoding — and the
 * `.json` suffix lets map clients (MCP Carto / OpenLayers) recognise the resource
 * as GeoJSON by extension. The proxy strips `.json` and decodes the token.
 *
 * The endpoint is APPENDED to the public base URL so any path prefix on the base
 * (e.g. an ingress subpath like `/published/proxy`) is preserved. Using
 * `new URL(endpoint, base)` instead would resolve the root-absolute endpoint
 * against the base ORIGIN and silently drop that prefix, producing 404s behind a
 * prefixed ingress. Trailing slashes on both the base and the endpoint are
 * normalized so exactly one slash joins each segment.
 *
 * The ingress is expected to strip the prefix down to `${PROXY_ENDPOINT}/<token>.json`
 * before routing to the proxy, which matches that path shape.
 */
export function buildDataUrl(publicBaseUrl: string, endpoint: string, token: string): string {
  const base = publicBaseUrl.replace(/\/+$/, "");
  const path = endpoint.replace(/\/+$/, "");
  return new URL(`${base}${path}/${token}.json`).toString();
}
