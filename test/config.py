import os

# The model name can be set via the MODEL_NAME environment variable.
# If not set, it defaults to "anthropic:claude-haiku-4-5".
MODEL_NAME = os.getenv("MODEL_NAME", "anthropic:claude-haiku-4-5")

# required for some small models. For larger models, it doesn't change much.
SYSTEM_PROMPT = "You are a helpful assistant for geospatial data. You can use the  tools to answer questions about geospatial data."

from langchain_mcp_adapters.client import MultiServerMCPClient

def get_mcp_client():
    # Préparer les variables d'environnement pour le proxy
    env = os.environ.copy()
    proxy_vars = ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"]
    proxy_env = {var: env[var] for var in proxy_vars if var in env}
    # Ensure uppercase variants are set (needed by Node.js libraries)
    if "HTTP_PROXY" not in proxy_env and "http_proxy" in proxy_env:
        proxy_env["HTTP_PROXY"] = proxy_env["http_proxy"]
    if "HTTPS_PROXY" not in proxy_env and "https_proxy" in proxy_env:
        proxy_env["HTTPS_PROXY"] = proxy_env["https_proxy"]
    if "NO_PROXY" not in proxy_env and "no_proxy" in proxy_env:
        proxy_env["NO_PROXY"] = proxy_env["no_proxy"]
    log_level = env.get("GEOCONTEXT_LOG_LEVEL", "error")

    # Preload script to configure undici ProxyAgent for Node.js fetch
    bootstrap_path = os.path.join(os.path.dirname(__file__), "proxy-bootstrap.js")
    node_options = f"--require {bootstrap_path}"

    mcp_env = {**proxy_env, "LOG_LEVEL": log_level, "NODE_OPTIONS": node_options}

    client = MultiServerMCPClient(
        {
            "geocontext": {
                "command": "npx",
                "args": ["-y", "@ignfab/geocontext"],
                "transport": "stdio",
                "env": mcp_env
            }
        }
    )
    return client

