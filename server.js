const APP_PORT = process.env.APP_PORT ? process.env.APP_PORT : 3000;

import logger from './src/logger.js';
import app from './src/app.js'

logger.info(`starting geocontext with port=${APP_PORT}...`)
const server = app.listen(APP_PORT, () => {
    logger.info(`debug listening on http://localhost:${APP_PORT}`);
});

process.on('SIGTERM', () => {
    logger.warning('shut down (SIGTERM received)');
    server.close(() => {
        logger.debug('HTTP server closed');
    });
});
