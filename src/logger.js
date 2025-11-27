import { config, createLogger, format, transports } from 'winston';

const LOG_LEVEL = process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'debug';

const formats = {
    json: format.json(),
    simple: format.simple()
};
const LOG_FORMAT = process.env.LOG_FORMAT ? process.env.LOG_FORMAT : 'simple';
if ( ! Object.keys(formats).includes(LOG_FORMAT) ){
    throw new Error(`LOG_FORMAT=${LOG_FORMAT} not found!`);
}

const logger = createLogger({
    level: LOG_LEVEL,
    format: formats[LOG_FORMAT],
    transports: process.env.NODE_ENV != 'test' ? [
        /*
         * logs all logs level to stderr as stdout is reserved for MCP
         * see https://github.com/winstonjs/winston/blob/master/docs/transports.md#console-transport
         */
        new transports.Console({
            stderrLevels: Object.keys(config.npm.levels), 
        })
    ] : [
        new transports.File({
            filename: 'geocontext.log',
            level: 'debug'
        })
    ],
});

export default logger;

