// Carga el .env antes que cualquier otro import: los decoradores como
// @EventPattern(process.env.KAFKA_TOPIC) se evalúan al importar el archivo.
// En Render no hay .env (las variables vienen del entorno), por eso el try.
try {
  process.loadEnvFile();
} catch {
  // sin .env
}
