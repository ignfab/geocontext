import { createJsWithTsEsmPreset, type JestConfigWithTsJest } from 'ts-jest'

const MILLISECONDS = 1000;

const presetConfig = createJsWithTsEsmPreset({

})

const jestConfig: JestConfigWithTsJest = {
  ...presetConfig,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}'
  ],
  testTimeout: 60 * MILLISECONDS
}

export default jestConfig;