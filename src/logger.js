import { createLogger, format, transports } from 'winston';

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
        new transports.Console()
    ] : [
        new transports.File({
            filename: 'geocontext.log',
            level: 'debug'
        })
    ],
});

logger.info(`LOG_FORMAT=${LOG_FORMAT}, LOG_LEVEL=${LOG_LEVEL}`);
export default logger;

