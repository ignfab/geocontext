const fs = require('fs');
const yaml = require('js-yaml');

const specs = yaml.load(
    fs.readFileSync(require.resolve('./openapi.yaml'),'utf-8')
);

// set server according according to PUBLIC_URL
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000"
specs.servers[0].url = PUBLIC_URL;

module.exports = specs;
