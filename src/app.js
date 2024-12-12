import express from 'express';

import cors from 'cors';
import morgan from 'morgan';

import logger from './logger.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static('public'));

const morganMiddleware = morgan(
    ':method :url :status :res[content-length] - :response-time ms',
    {
        stream: {
            // Configure Morgan to use our custom logger with the http severity
            write: (message) => logger.info(message.trim()),
        },
    }
);
app.use(morganMiddleware);

app.get('/health', function (req, res) {
    return res.json({
        "message": "OK"
    })
});

import { query, matchedData, validationResult } from 'express-validator';

import { getParcellaireExpress } from './gpf/parcellaire-express.js';
import { getAssiettesServitudes, getUrbanisme } from './gpf/urbanisme.js';
import { getAdminUnits } from './gpf/adminexpress.js';
import { getAltitudeByLocation } from './gpf/altitude.js';

app.get('/api/gpf/altitude', [
    query("lon").notEmpty().isNumeric(),
    query("lat").notEmpty().isNumeric()
], async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send({
            message: "invalid parameters",
            errors: errors.array()
        });
    }

    const params = matchedData(req);
    const result = await getAltitudeByLocation(params.lon, params.lat);
    return res.json(result);
});

app.get('/api/gpf/adminexpress', [
    query("lon").notEmpty().isNumeric(),
    query("lat").notEmpty().isNumeric()
], async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send({
            message: "invalid parameters",
            errors: errors.array()
        });
    }

    const params = matchedData(req);
    const result = await getAdminUnits(params.lon, params.lat);
    return res.json(result);
});


app.get('/api/gpf/parcellaire-express', [
    query("lon").notEmpty().isNumeric(),
    query("lat").notEmpty().isNumeric()
], async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send({
            message: "invalid parameters",
            errors: errors.array()
        });
    }

    const params = matchedData(req);
    const result = await getParcellaireExpress(params.lon, params.lat);
    return res.json(result);
});


app.get('/api/gpf/urbanisme', [
    query("lon").notEmpty().isNumeric(),
    query("lat").notEmpty().isNumeric()
], async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send({
            message: "invalid parameters",
            errors: errors.array()
        });
    }

    const params = matchedData(req);
    const result = await getUrbanisme(params.lon, params.lat);
    return res.json(result);
});



app.get('/api/gpf/sup', [
    query("lon").notEmpty().isNumeric(),
    query("lat").notEmpty().isNumeric()
], async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send({
            message: "invalid parameters",
            errors: errors.array()
        });
    }

    const params = matchedData(req);
    const result = await getAssiettesServitudes(params.lon, params.lat);
    return res.json(result);
});


export default app;

