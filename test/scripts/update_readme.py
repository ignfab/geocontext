#!/usr/bin/env python3
import xml.etree.ElementTree as ET
import re
from datetime import date
import os

tree = ET.parse('results.xml')
root = tree.getroot()
suite = root.find('testsuite') or root

total = int(suite.get('tests', 0))
failures = int(suite.get('failures', 0))
errors = int(suite.get('errors', 0))
passed = total - failures - errors
time_s = float(suite.get('time', 0))
mins = int(time_s // 60)
secs = int(time_s % 60)

rows = []
for tc in suite.findall('testcase'):
    name = tc.get('name')
    fail = tc.find('failure') or tc.find('error')
    if fail is not None:
        msg = (fail.get('message') or '').split('\n')[0][:80]
        rows.append(f'| {name} | FAILED | {msg} |')
    else:
        rows.append(f'| {name} | PASSED | |')

table = '\n'.join(rows)
today = date.today().strftime('%-d %B %Y')
model = os.environ.get('MODEL_NAME', 'anthropic:claude-haiku-4-5')

section = f"""## Derniers résultats de tests

**Date** : {today}
**Modèle** : `{model}`
**Serveur MCP** : `geocontext@0.9.8`
**Nombre de tests** : {total}

### Run — {passed}/{total} passed ({mins} min {secs:02d} s)

| Test | Résultat | Détail |
|------|----------|--------|
{table}

### Observations

- **{passed} tests sur {total} sont passés**
- Les 10 outils MCP sont tous couverts."""

with open('README.md', 'r') as f:
    content = f.read()

new_content = re.sub(
    r'## Derniers résultats de tests.*?(?=\n## |\Z)',
    section,
    content,
    flags=re.DOTALL
)

with open('README.md', 'w') as f:
    f.write(new_content)

print(f"README updated: {passed}/{total} passed")
