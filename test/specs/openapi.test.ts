import _ from 'lodash';
import openapi from '../../src/specs/openapi.cjs';

describe("Test specs for usage in ChatGPT ",() => {

    describe("Check version",()=>{
        expect(openapi.openapi).toEqual('3.1.0');
    });

    const operationIds : string[] = [];
    for ( const pathName of Object.keys(openapi.paths) ){
        const path = openapi.paths[pathName];
        describe(`Check path ${pathName}`, () => {
            // skip
            if ( ! path.get ){
                return;
            }

            const get = path.get;
            it(`should define get with unique operationId`, () => {
                expect(get.operationId).toBeDefined();
                expect(typeof get.operationId).toEqual("string");
                // ensure is unique
                expect(operationIds).not.toContain(get.operationId);
                operationIds.push(get.operationId);
            });

            it(`should provide a description with length < 300 characters`, () => {
                expect(get.description).toBeDefined();
                expect(typeof get.description).toEqual("string");
                expect(get.description.length).toBeLessThan(300);
            });

        });
    }

});
