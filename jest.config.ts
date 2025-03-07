import { createJsWithTsEsmPreset, type JestConfigWithTsJest } from 'ts-jest'

const presetConfig = createJsWithTsEsmPreset({

})

const jestConfig: JestConfigWithTsJest = {
  ...presetConfig,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}'
  ]
}

export default jestConfig;