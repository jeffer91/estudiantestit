from pathlib import Path
import re
import textwrap

# Esta actualización activa el workflow que aplica y verifica la corrección.
workflow = Path('.github/workflows/corregir-consulta-resoluciones.yml')
source = workflow.read_text(encoding='utf-8')
match = re.search(
    r"shell: python\s*\n\s*run: \|\s*\n(?P<body>.*?)(?=\n\s*- name: Verificar proyecto)",
    source,
    flags=re.S,
)
if not match:
    raise SystemExit('No se encontró el bloque de corrección en el workflow temporal.')
body = textwrap.dedent(match.group('body'))
exec(compile(body, str(workflow), 'exec'))
print('[Ejecutor] Corrección de Envios y Resoluciones aplicada.')
