/**
 * Builds the absolute, opaque `data_url` a layer-producer tool hands to a map
 * client, shared by `gpf_get_features_layer` and `gpf_get_feature_by_id_layer`.
 *
 * The endpoint is APPENDED to the public base URL so any path prefix on the base
 * (e.g. an ingress subpath like `/published/proxy`) is preserved. Using
 * `new URL(endpoint, base)` instead would resolve the root-absolute endpoint
 * against the base ORIGIN and silently drop that prefix, producing 404s behind a
 * prefixed ingress. The single joining slash is normalized: the base may or may
 * not end with `/`, and `PROXY_ENDPOINT` always starts with `/` (env-validated).
 *
 * The ingress is expected to strip the prefix down to `PROXY_ENDPOINT` before
 * routing to the proxy, which matches `url.pathname === PROXY_ENDPOINT` exactly.
 */
export function buildDataUrl(publicBaseUrl: string, endpoint: string, token: string): string {
  const base = publicBaseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}${endpoint}`);
  url.searchParams.set("q", token);
  return url.toString();
}
