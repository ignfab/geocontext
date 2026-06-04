import { config, createLogger, format, transports } from 'winston';
import { getEnv } from './config/env.js';

const { LOG_LEVEL, LOG_FORMAT, NODE_ENV } = getEnv();

const formats = {
    json: format.json(),
    simple: format.simple()
};

const logger = createLogger({
    level: LOG_LEVEL,
    format: formats[LOG_FORMAT],
    transports: NODE_ENV !== 'test' ? [
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

