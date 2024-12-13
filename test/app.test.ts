import request from 'supertest';

import app from '../src/app.js';

import { chamonix } from "./samples";

describe("GET /v1/altitude", () => {
    it("should return a JSON response with code 200 for Chamonix", async () => {
        const c = chamonix.coordinates;
        request(app)
            .get(`/v1/altitude?lon=${c[0]}&lat=${c[1]}`)
            .expect('Content-Type', /json/)
            .expect(200)
            .then((res: any) => {
                expect(res.statusCode).toBe(200);
            })
    });
});


describe("GET /v1/urbanisme", () => {
    it("should return a JSON response with code 200 for Chamonix", async () => {
        const c = chamonix.coordinates;
        request(app)
            .get(`/v1/urbanisme?lon=${c[0]}&lat=${c[1]}`)
            .expect('Content-Type', /json/)
            .expect(200)
            .then((res: any) => {
                expect(res.statusCode).toBe(200);
            })
    });
});


describe("GET /v1/sup", () => {
    it("should return a JSON response with code 200 for Chamonix", async () => {
        const c = chamonix.coordinates;
        request(app)
            .get(`/v1/sup?lon=${c[0]}&lat=${c[1]}`)
            .expect('Content-Type', /json/)
            .expect(200)
            .then((res: any) => {
                expect(res.statusCode).toBe(200);
            })
    });
});

