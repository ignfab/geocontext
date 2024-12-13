import { createJsWithTsPreset, type JestConfigWithTsJest } from 'ts-jest';

const presetConfig = createJsWithTsPreset({
  //...options
});

const jestConfig: JestConfigWithTsJest = {
  ...presetConfig,
  collectCoverageFrom: ["src/**/*.js"],
  coverageProvider: 'v8'
};

export default jestConfig;

