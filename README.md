# geocontext

An experimental MCP server providing spatial tools.

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

## Credits

* [mcp-framework](https://mcp-framework.com)
* [@camptocamp/ogc-client](https://camptocamp.github.io/ogc-client/#/)
* [jsts](https://bjornharrtell.github.io/jsts/)

## License

[MIT](LICENSE)

