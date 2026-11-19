/** Fallos al cargar un módulo de la aplicación, típicos tras un despliegue nuevo con la pestaña abierta. */
export const esErrorDeCarga = (mensaje: string) =>
  /lazy element type|loading chunk|dynamically imported module|importing a module script/i.test(
    mensaje,
  );
