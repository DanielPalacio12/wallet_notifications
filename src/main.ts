import './load-env';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

// En Render las variables de entorno no soportan saltos de línea reales,
// así que pega los certificados con "\n" y aquí los convertimos.
const pem = (v?: string) => v?.replace(/\\n/g, '\n');

// Aiven ofrece dos formas de autenticarse, cada una en su propio puerto:
// - Certificado de cliente (KAFKA_CERT + KAFKA_KEY)
// - SASL con usuario/clave (KAFKA_USERNAME + KAFKA_PASSWORD)
// En ambos casos el broker se valida con el CA del proyecto (KAFKA_CA).
function kafkaAuth() {
  const ca = [pem(process.env.KAFKA_CA)!];

  if (process.env.KAFKA_CERT && process.env.KAFKA_KEY) {
    return {
      ssl: { ca, cert: pem(process.env.KAFKA_CERT), key: pem(process.env.KAFKA_KEY) },
    };
  }

  return {
    ssl: { ca },
    sasl: {
      // plain | scram-sha-256 | scram-sha-512, según lo que tenga habilitado el broker
      mechanism: (process.env.KAFKA_SASL_MECHANISM ?? 'plain') as 'plain',
      username: process.env.KAFKA_USERNAME!,
      password: process.env.KAFKA_PASSWORD!,
    },
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'notifiers',
        brokers: [process.env.KAFKA_BROKER!], // host:port de Aiven
        // El default (1s) se queda corto para el handshake TLS + SASL con Aiven
        connectionTimeout: 10000,
        authenticationTimeout: 10000,
        ...kafkaAuth(),
      },
      // groupId propio para no competir con otros servicios
      consumer: { groupId: process.env.KAFKA_GROUP_ID ?? 'notificaciones-service' },
      // Nest le agrega "-server" al groupId por defecto; así queda el nombre exacto
      postfixId: '',
      // Equivale a auto.offset.reset=earliest: la primera vez lee desde el inicio
      subscribe: { fromBeginning: true },
      run: { autoCommit: true },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000); // health check para Render
}
bootstrap();