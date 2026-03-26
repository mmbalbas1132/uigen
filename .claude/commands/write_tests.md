Escribe pruebas exhaustivas para: $ARGUMENTS

Convenciones de los tests:
- Cada prueba debe tener un nombre descriptivo que indique claramente lo que se está probando.
- Usa Vitest con React Testing Library para escribir tus pruebas.
- Ubica los archivos de prueba en la carpeta `__tests__` dentro del directorio del componente o módulo que estás probando.
- Nombra los archivos de prueba como [nombre_del_archivo].test.tsx para componentes de React o [nombre_del_archivo].test.ts para módulos de JavaScript/TypeScript.
- Usa el prefijo @/ para las rutas de importación relativas a la raíz del proyecto.

Cobertura de pruebas:
- Asegúrate de cubrir casos de prueba positivos y negativos, así como casos límite.
- Utiliza mocks y stubs para simular dependencias externas y controlar el entorno de prueba
- Prueba los estados de error y manejo de excepciones para garantizar que el código maneje adecuadamente las situaciones inesperadas.
- Verifica que los componentes de React rendericen correctamente con diferentes props y estados.
- Céntrate en probar el comportamiento y las APIs públicas en lugar de los detalles de implementación interna para mantener las pruebas robustas y fáciles de mantener.
- Asegúrate de que las pruebas sean independientes entre sí para evitar efectos secundarios y facilitar la identificación de problemas cuando una prueba falla.
- Asegúrate que hay una cobertura de pruebas adecuada de la menos un 90% para todas las funciones y componentes relevantes, utilizando herramientas de cobertura de código para identificar áreas no cubiertas.

