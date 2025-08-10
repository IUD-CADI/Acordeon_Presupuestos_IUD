# Acordeón desde 2 Excel (join por código)
Sube estos archivos a un hosting HTTPS (GitHub Pages, Netlify, Vercel). Abre la página, pega las URLs del Excel Maestro y de Ejecución, y presiona Cargar.

## Columnas esperadas
**Maestro**: `codigo`, `Nivel 1`, `Nivel 2` (+ opcionales)  
**Ejecución**: `codigo`, `Presupuesto Inicial`, `Presupuesto Actual`, `Ejecución`, `Pendiente por Recaudar`, `% de Ejecución` (opcional)

## Notas
- El % puede calcularse automáticamente como `Ejecución / Presupuesto Actual * 100` marcando la casilla.
- La primera hoja del .xlsx es la que se usa automáticamente.
