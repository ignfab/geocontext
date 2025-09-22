# geocontext

An experimental MCP server providing spatial context for LLM.

## Parameters

| Name             | Description                                                                                                       | Default value |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------- |
| `TRANSPORT_TYPE` | [Transport](https://mcp-framework.com/docs/Transports/transports-overview) for the MCP server ("stdio" or "http") | "stdio"       |

## Usage

### Building

```bash
git clone https://github.com/mborne/geocontext
cd geocontext
npm install
npm run build

# to allow "npx geocontext"
npm link
```

### Local Development

```json
{
  "mcpServers": {
    "mcp-helloworld": {
      "command": "node",
      "args":["/absolute/path/to/geocontext/dist/index.js"]
    }
  }
}
```

or 

```json
{
  "mcpServers": {
    "mcp-helloworld": {
      "command": "npx",
      "args":["geocontext"]
    }
  }
}
```

### Usage with docker

```bash
docker compose build
docker compose up -d
```

Then :

```json
{
  "mcpServers": {
    "server-name": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```


## Credits

* [mcp-framework](https://mcp-framework.com)
* [@camptocamp/ogc-client](https://camptocamp.github.io/ogc-client/#/)
* [jsts](https://bjornharrtell.github.io/jsts/)

## License

[MIT](LICENSE)

