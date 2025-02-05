const fs = require('fs');
const yaml = require('js-yaml');

const specs = yaml.load(
    fs.readFileSync(require.resolve('./openapi.yaml'),'utf-8')
);

// set info.title according to APP_NAME
const APP_NAME = process.env.APP_NAME || "geocontext"
if ( APP_NAME ){
    specs.info.title = APP_NAME;
}

// set info.termsOfService according to TOS_URL
const TOS_URL = process.env.TOS_URL || null;
if ( TOS_URL ){
    specs.info.termsOfService = TOS_URL;
}

// set server according according to PUBLIC_URL
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000"
specs.servers[0].url = PUBLIC_URL;

module.exports = specs;
