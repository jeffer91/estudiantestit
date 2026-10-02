# Migraciones de aprendizaje IA (Neon)

La memoria de aprendizaje vive en Neon y no se conecta nunca desde GitHub Pages.

1. Crea una rama de desarrollo en Neon antes de probar cambios de esquema.
2. Ejecuta `001_ia_learning.sql` con la URL directa/unpooled de esa rama.
3. Verifica el flujo y aplica la misma migración a producción.
4. Guarda la URL pooled de producción en Google Secret Manager con el nombre `titulos-neon-database-url`.

La URL de Neon no debe guardarse en JavaScript público, GitHub Pages ni Firestore. Firebase Functions lee el secreto y es la única capa que se conecta a la memoria.
