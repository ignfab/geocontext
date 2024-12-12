import { createJsWithTsPreset, type JestConfigWithTsJest } from 'ts-jest';

const presetConfig = createJsWithTsPreset({
  //...options
});

const jestConfig: JestConfigWithTsJest = {
  ...presetConfig,
  collectCoverageFrom: ["src/**/*.(js|ts)"]
};

export default jestConfig;

