import { createJsWithTsEsmPreset } from 'ts-jest';

const MILLISECONDS = 1000;

const presetConfig = createJsWithTsEsmPreset({
  tsconfig: 'tsconfig.test.json',
});

/** @type {import("jest").Config} */
const jestConfig = {
  ...presetConfig,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
  ],
  testTimeout: 60 * MILLISECONDS,
};

export default jestConfig;
