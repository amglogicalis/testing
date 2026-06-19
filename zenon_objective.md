## Goal
Como funciona la app del repo? Dimelo de forma breve y sencilla.

### Funcionamiento de la Aplicación FocusFlow

La aplicación es un **temporizador Pomodoro** con una **lista de tareas**, construida íntegramente con **HTML, CSS y JavaScript vainilla** para ejecutarse directamente en el navegador.

*   **`index.html`**: Define la estructura de la página, incluyendo un temporizador central con un anillo de progreso SVG y una sección para gestionar tareas.
*   **`style.css`**: Proporciona el diseño visual, con un tema oscuro, efectos de "glassmorphism", y estilos responsivos. Utiliza variables CSS para colores de acento y transiciones.
*   **`app.js`**: Contiene toda la lógica funcional:
    *   Gestiona el estado del temporizador (modo de trabajo/descanso, tiempo restante, inicio/pausa/reinicio).
    *   Actualiza el anillo de progreso SVG y la pantalla del tiempo en tiempo real.
    *   Permite añadir, completar y eliminar tareas dinámicamente, almacenando su estado en memoria.

No utiliza frameworks ni herramientas de construcción, siendo una aplicación de una sola página completamente del lado del cliente.

Los archivos `.github/workflows/zenon.yml` y `test_math.js` son un workflow de GitHub Actions para asistencia de IA y un script de prueba de matemáticas básico, respectivamente, y no forman parte de la funcionalidad principal de la aplicación FocusFlow.