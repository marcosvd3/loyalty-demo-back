# Loyalty API

Backend de la plataforma de fidelización white-label multi-tenant: alta de clientes por QR,
motor de sellos, canje de premios y pase en la wallet nativa del teléfono.

NestJS 11 · MongoDB · Redis · RabbitMQ · Swagger.

El contrato con el front está en [`docs/api-frontend.md`](./docs/api-frontend.md).

## Modelo multi-tenant

Dos planos separados:

- **Base de control** (`MONGODB_DB_NAME`): el catálogo de tiendas y los usuarios del panel.
  Resuelve `qrToken -> tenant -> dbName`.
- **Una base por tienda**: clientes, visitas, premios y canjes. Se abre con `useDb` sobre la
  misma conexión.

El `tenantId` viaja firmado dentro del JWT y nunca por la red: el front no manda header ni
query param de tenant. Un `dbName` elegido por el cliente leería la base de control.

## Requisitos

- Node 22.x
- MongoDB y Redis (puertos 27017 y 6379)
- Docker, para RabbitMQ

## Desarrollo

```bash
docker compose up -d          # RabbitMQ
npm install
cp .env.example .env
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`
- Health: `http://localhost:3000/api/v1/health`
- RabbitMQ management: `http://localhost:15672` (guest/guest)

RabbitMQ es opcional: con `RABBITMQ_ENABLED=false` la API arranca igual y los eventos de
dominio no se publican. Nada del flujo principal depende de ellos — la publicación es
fire-and-forget y el registro de una visita no espera al broker.

## Build y chequeo de tipos

`npm run build` compila con **SWC**, no con tsc. El motivo es memoria: tsc pica en ~550 MB
compilando este proyecto y no entra en un contenedor de 512 MB, mientras que SWC hace lo
mismo en 221 MB y en menos de medio segundo.

La contrapartida es que SWC transpila sin verificar tipos. El chequeo va aparte:

```bash
npm run typecheck
```

Correlo antes de pushear, porque **un build verde ya no garantiza que los tipos cierren**.
No está enganchado al build de deploy a propósito: eso invocaría a tsc y traería de vuelta
el problema de memoria que este esquema evita.

## Seed

```bash
npm run seed:tenant -- "Cafetería Central" owner@demo.com clave123
npm run set:logo -- "Cafetería Central" /logos/cafeteria-central.png
```

El primero crea la tienda, su base, el programa de sellos, un premio y la cuenta del panel;
anotá el `qrToken` que imprime. El segundo carga el logo de la landing, provisional hasta
que el panel tenga uploader.

Ambos corren con `ts-node`, que es devDependency: en un entorno sin devDependencies hay que
apuntarlos a la base remota desde una máquina local en vez de ejecutarlos allá.

## Estructura

```
src/
├── config/                 configuración por namespace + validación de env
├── infrastructure/
│   ├── database/           conexión Mongoose y resolución de base por tenant
│   ├── cache/              Redis vía cache-manager + Keyv
│   └── messaging/          clientes RabbitMQ y patrones de eventos
├── common/                 enums, DTOs, guards, decoradores, filtros
├── scripts/                seed y carga de branding
└── modules/
    ├── health/             health check con ping a Mongo
    ├── auth/               login del panel, JWT
    ├── tenants/            tiendas, branding y QR del local
    ├── users/              usuarios del panel
    ├── customers/          clientes finales
    ├── enrollment/         alta pública por QR
    ├── loyalty/            programa de sellos y billeteras
    ├── visits/             registro de visitas por escaneo
    ├── rewards/            catálogo de premios y canjes
    ├── promotions/         promociones y cupones
    ├── passes/             pases de wallet
    └── notifications/      correo y push
```

## Deploy

[`render.yaml`](./render.yaml) es un blueprint de Render listo para usar. Mongo y Redis van
en servicios externos — Render no ofrece Mongo administrado — y sus URIs se cargan a mano en
el dashboard junto con `CORS_ORIGINS` y `APP_PUBLIC_URL`, que apuntan al dominio del front.

`APP_ENROLL_PATH` tiene que coincidir con la ruta del router del front que recibe el token
del QR. El QR ya impreso no se puede corregir.

## Estado

Implementados: auth, tenants, enrollment, loyalty, visits, rewards, health, la vista pública
del pase (`GET /passes/:tenantQrToken/:customerQrToken`) y la búsqueda de clientes con la
recuperación del pase en el local.

Pendiente en `passes`: la generación del pase real de wallet. No hay `.pkpass` de Apple ni
objeto de Google Wallet — eso necesita certificado del Apple Developer Program y una cuenta
de emisor de Google, no solo código. Los módulos de promotions y notifications están
cableados pero sin endpoints.
