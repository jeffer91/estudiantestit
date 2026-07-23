from pathlib import Path
import re
import textwrap

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

# La plantilla original podía insertar consultaPeriodoReforzada en la respuesta
# de estudiante no encontrado, antes de que exista la variable. Se corrige aquí
# y se asegura que el indicador quede únicamente en la respuesta final.
access_path = Path('functions/api/acceso-estudiante.js')
access = access_path.read_text(encoding='utf-8')
student_marker = '    const student = academic.estudiante || academic.registro;'
if student_marker not in access:
    raise SystemExit('No se encontró el punto de unión de la consulta académica.')

before_student, after_student = access.split(student_marker, 1)
before_student = before_student.replace('        consultaPeriodoReforzada,\n', '')

final_anchor = "      permiteReenvio,\n      consultaCompleta: true,\n"
final_replacement = "      permiteReenvio,\n      consultaCompleta: true,\n      consultaPeriodoReforzada,\n"
if final_replacement not in after_student:
    if final_anchor not in after_student:
        raise SystemExit('No se encontró la respuesta final para agregar el indicador de refuerzo.')
    after_student = after_student.replace(final_anchor, final_replacement, 1)

access_path.write_text(before_student + student_marker + after_student, encoding='utf-8')
print('[Ejecutor] Corrección de Envios y Resoluciones aplicada.')
