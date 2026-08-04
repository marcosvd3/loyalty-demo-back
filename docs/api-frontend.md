# API de fidelización — guía de integración para el front

Documento para conectar el front contra el backend y empezar a probar. Cubre lo que hoy
está implementado y funcionando; al final está la lista de lo que todavía no existe para
que no se planifique contra endpoints que no responden.

---

## 1. Cómo levantar el back

```bash
npm install
cp .env.example .env      # revisar MONGODB_URI, REDIS_URL, RABBITMQ_URL
npm run start:dev
```

Dependencias externas necesarias: **MongoDB**, **Redis** y **RabbitMQ**
(`RABBITMQ_ENABLED=false` en el `.env` si no lo tienen levantado).

### Crear una tienda de prueba con su usuario

```bash
npm run seed:tenant -- "Cafetería Central" owner@demo.com clave123
```

Imprime en consola lo que hace falta para probar:

```
Tenant creado: Cafetería Central
  id             : <tenantId>
  base           : loyalty_<tenantId>
  qrToken        : <tenantQrToken>   <-- para el alta pública de clientes
  cartilla       : 10 sellos
  cooldown       : 120s
  owner del panel: owner@demo.com
```

El seed también deja creado un programa de sellos por defecto y un premio de ejemplo, así
que la tienda queda operativa desde el minuto cero.

---

## 2. Base URL y convenciones

| | |
|---|---|
| Base URL | `http://localhost:3000/api/v1` |
| Versionado | por URI, `v1` es el default |
| Swagger UI | `http://localhost:3000/api/docs` (con "Authorize" para pegar el token) |
| CORS | solo los orígenes de `CORS_ORIGINS` (default `http://localhost:4200`), con `credentials: true` |

Si el front corre en otro puerto, avísennos para agregarlo a `CORS_ORIGINS` — el navegador
va a bloquear las requests hasta entonces.

### Autenticación

- **Todos los endpoints requieren `Authorization: Bearer <accessToken>` por defecto.** Las
  únicas excepciones están marcadas como PÚBLICAS más abajo.
- El token se obtiene en `POST /auth/login` y vence a los **15 minutos**
  (`JWT_ACCESS_TTL`). Hoy **no hay refresh token**: al recibir un 401 hay que mandar al
  usuario de vuelta al login.
- **El front nunca manda el `tenantId`.** Va firmado dentro del JWT y el back lo usa para
  resolver contra qué base de datos trabajar. No hay header de tenant ni query param: no
  intenten mandarlo, se ignora.

### Validación de bodies

El pipe global corre con `whitelist: true` y `forbidNonWhitelisted: true`. Traducción
práctica: **mandar un campo que el DTO no declara devuelve 400**, no se ignora en silencio.
Nada de mandar el objeto entero del formulario con campos extra.

### Formato de error

Todos los errores salen con la misma forma:

```json
{
  "statusCode": 409,
  "path": "/api/v1/visits",
  "timestamp": "2026-08-03T14:22:31.005Z",
  "message": "El cliente está inactivo",
  "error": "Conflict"
}
```

En los errores de validación, `message` es un **array de strings** (uno por campo que
falló), no un string. Conviene normalizarlo en el interceptor del front.

| Código | Cuándo |
|---|---|
| 400 | validación del body, o regla de negocio del scan (ver §5) |
| 401 | sin token, token vencido o credenciales inválidas |
| 403 | rol insuficiente, usuario sin tienda, o tienda suspendida |
| 404 | QR inválido, cliente sin tarjeta, premio inexistente |
| 409 | cliente inactivo, programa pausado, premio no disponible, sin créditos, email duplicado |

### Roles

`platform_admin` (global, sin tienda) · `tenant_owner` · `tenant_manager` · `tenant_staff`.

El staff puede escanear y canjear; **editar la configuración del programa y el catálogo de
premios es solo owner/manager**. El front debería ocultar esas acciones según
`user.role` del login, aunque el back las bloquea igual con 403.

---

## 3. Endpoints

### 3.1 Auth

#### `POST /auth/login` — PÚBLICO

```ts
// request
{ email: string; password: string }

// response 200
{
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'platform_admin' | 'tenant_owner' | 'tenant_manager' | 'tenant_staff';
    tenantId?: string;   // ausente en platform_admin
  };
}
```

Credenciales inválidas → 401 `"Credenciales inválidas"`. El mensaje es el mismo para
usuario inexistente, contraseña incorrecta y cuenta desactivada, a propósito.

#### `GET /auth/me`

```ts
// response 200
{ id: string; email: string; role: UserRole; tenantId?: string }
```

Útil para rehidratar la sesión al recargar la página.

---

### 3.2 Alta pública de clientes (la landing del QR)

El QR impreso en el local apunta a **`{APP_PUBLIC_URL}/{tenantQrToken}/register`**, o sea a una
ruta del front, no de la API. El front lee el `tenantQrToken` de la URL y lo usa en estos
dos endpoints.

#### `GET /enrollment/:tenantQrToken` — PÚBLICO

```ts
// response 200
{
  name: string;           // nombre de la tienda, para pintar el encabezado del form
  logoUrl?: string;       // isotipo; ausente si la tienda todavía no cargó branding
  wordmarkUrl?: string;   // logotipo de letras; si falta, se rotula con `name`
}
```

QR inválido o tienda suspendida → 404.

El front **no arma el `logoUrl`**: lo usa tal cual venga en un `<img src>`. Hoy apunta a un
estático servido por el propio front; cuando exista el uploader va a ser una URL absoluta de
Bunny/S3 y el front no cambia.

#### `POST /enrollment/:tenantQrToken` — PÚBLICO

```ts
// request
{
  name: string;                  // max 80
  lastName: string;              // max 80
  identificationNumber: string;  // max 30
  address?: string;              // max 200, opcional
  phone: string;                 // max 30
  email: string;                 // formato email, max 160
}

// response 201
{
  id: string;
  name: string;
  lastName: string;
  email: string;
  qrToken: string;   // <-- el QR personal del cliente
}
```

**El `qrToken` de la respuesta es la pieza clave del flujo**: es lo que el cliente muestra
en el mostrador y lo que el staff escanea. El front lo guarda en `localStorage` con clave
`loyalty.pass.<tenantQrToken>` y lo usa para abrir el pase en las visitas siguientes.

Email o cédula repetidos **en esa misma tienda** → 409 `"Ya estás registrado en esta
tienda"`. La misma persona sí puede registrarse en otra tienda sin conflicto.

#### `GET /passes/:tenantQrToken/:customerQrToken` — PÚBLICO

```ts
// response 200
{
  tenantName: string;
  logoUrl?: string;
  wordmarkUrl?: string;
  programName: string;       // nombre visible de la cartilla
  customerName: string;
  stampsRequired: number;    // el "N" del "3/10"
  earnedStamps: number;
  availableRewards: number;  // premios ya acreditados, sin canjear
  code: string;              // el qrToken del cliente, para que la tienda lo escanee
}
```

Token de tienda o de cliente inválido → 404.

**Pide los dos tokens y no solo el del cliente** porque los clientes viven en la base de su
tienda: sin el token del local no hay contra qué base resolver, salvo recorriéndolas todas.

`stampsRequired` sale de la tarjeta del cliente, no del programa. Son valores distintos a
propósito: la tarjeta guarda el umbral con el que nació, así que cambiar el del programa no
altera ninguna cartilla en curso.

Es público porque el `qrToken` del cliente ya es la credencial que la tienda escanea — quien
lo tiene puede usar el pase de todos modos. Por eso mismo **no puede existir un endpoint que
devuelva ese token a partir de un dato adivinable como el email**: sería regalar los premios
ajenos a quien itere direcciones.

#### `GET /passes/:tenantQrToken/:customerQrToken/qr.svg` — PÚBLICO

SVG del QR del pase, listo para un `<img src>`. Encodea el `qrToken` del cliente **pelado**,
no una URL: es exactamente lo que `POST /visits` espera en `customerQrToken`, así que lo que
lea el escáner del mostrador se manda tal cual.

Token de tienda o de cliente inválido → 404.

---

### 3.3 Programa de fidelización

#### `GET /loyalty/program`

```ts
// response 200
{
  name: string;                  // lo que se imprime en la tarjeta
  mechanic: 'stamps';            // hoy siempre 'stamps'
  amountMode: 'visits_only' | 'manual_amount' | 'pos_integration';
  stampsPerVisit: number;
  stampsRequired: number;        // el "N" del "3/10"
  visitCooldownSeconds: number;  // 0 = sin cooldown
  active: boolean;
}
```

#### `PATCH /loyalty/program` — solo `tenant_owner` / `tenant_manager`

Todos los campos son opcionales; se manda solo lo que cambia.

```ts
{
  name?: string;                 // max 80
  mechanic?: LoyaltyMechanic;    // solo 'stamps' es aceptado hoy → 400 con el resto
  amountMode?: AmountMode;
  stampsPerVisit?: number;       // entero, 1..1000
  stampsRequired?: number;       // entero, 1..1000
  visitCooldownSeconds?: number; // entero, 0..86400
  active?: boolean;              // false pausa el programa: los scans pasan a fallar
}
```

Devuelve el programa actualizado con la misma forma del GET.

> **Importante para la UI:** cambiar `stampsRequired` **solo afecta a las tarjetas nuevas**.
> Un cliente que va 9/10 sigue en 9/10 aunque la tienda baje el umbral a 8. Vale la pena
> aclararlo con un texto de ayuda en el formulario para que la tienda no crea que es un bug.

#### `GET /loyalty/wallets/:customerId`

```ts
// response 200
{
  id: string;
  customerId: string;
  stampBalance: number;      // posición en la cartilla actual (0..stampsRequired-1)
  stampsRequired: number;    // el umbral de ESTA tarjeta, no el del programa
  availableRewards: number;  // créditos listos para canjear
  lifetimeStamps: number;
  lifetimeRewards: number;
  totalVisits: number;
  lastVisitAt?: string;      // ISO
}
```

Cliente sin tarjeta todavía → 404 `"El cliente todavía no tiene tarjeta"`.

Para la barra de progreso usen siempre `stampBalance / stampsRequired` **de la tarjeta**,
nunca el `stampsRequired` del programa.

---

### 3.4 Visitas (el scan del mostrador)

#### `POST /visits` → **200, no 201**

```ts
// request
{
  customerQrToken: string;  // max 40. Va en el body a propósito, NO en la URL
  amountCents?: number;     // entero >= 0, en centavos. Solo si amountMode = manual_amount
  currency?: string;        // ISO 4217, 3 letras. Solo junto con amountCents
}

// response 200
{
  visitId?: string;         // ausente si stamped = false
  customer: { id: string; name: string; lastName: string };
  stamped: boolean;         // <-- LEER SIEMPRE ESTE CAMPO
  reason?: 'cooldown';
  stampsEarned: number;
  stampBalance: number;
  stampsRequired: number;
  unlockedNow: number;      // cartillas completadas por ESTE scan → "¡Premio desbloqueado!"
  availableRewards: number; // habilita el botón de canje
}
```

Tres cosas que definen la UI de esta pantalla:

1. **El status 200 no significa que se acreditó.** Si el scan cae dentro del cooldown, el
   back devuelve 200 con `stamped: false` y `reason: 'cooldown'`, en vez de un error. Es
   deliberado: un 409 en la cara del cajero con el cliente delante provoca justamente el
   reintento que el cooldown quiere evitar. **La UI debe ramificar por `stamped`**, mostrando
   el balance actual y un mensaje tranquilo tipo "ya registrado hace un momento".
2. `unlockedNow > 0` es el disparador de la animación de premio desbloqueado.
3. La respuesta trae todo lo necesario para pintar el resultado — **no hace falta una
   segunda llamada** a `/loyalty/wallets/:customerId` después del scan.

Errores posibles:

| Código | Mensaje | Causa |
|---|---|---|
| 404 | `QR de cliente inválido` | el token escaneado no existe en esa tienda |
| 409 | `El cliente está inactivo` | ficha dada de baja |
| 409 | `El programa de la tienda está pausado` | `program.active = false` |
| 400 | `Esta tienda no registra montos` | mandaron `amountCents` con `amountMode = visits_only` |
| 400 | `Falta el monto de la compra` | **no** mandaron `amountCents` con `amountMode = manual_amount` |
| 400 | `El modo de integración con POS todavía no está implementado` | `amountMode = pos_integration` |

> El campo de monto en el formulario de scan tiene que **aparecer o desaparecer según el
> `amountMode` que devuelve `GET /loyalty/program`**. Los dos primeros 400 de la tabla son
> exactamente el síntoma de no hacerlo.

#### `GET /visits?limit=50` — feed de la tienda
#### `GET /visits/customers/:customerId?limit=50` — historial de un cliente

```ts
// response 200 — array
{
  id: string;
  customerId: string;
  stampsEarned: number;
  unlockedRewards: number;
  amountCents?: number;
  currency?: string;
  registeredBy?: string;   // id del usuario del panel que escaneó
  createdAt: string;       // ISO
}[]
```

`limit` es opcional: default **50**, máximo **200** (valores fuera de rango se acotan sin
error). Orden: más reciente primero. **Todavía no hay paginación por cursor** — por ahora es
solo "últimos N".

---

### 3.5 Premios y canjes

#### `GET /rewards?onlyActive=true`

```ts
// response 200 — array
{ id: string; name: string; description?: string; active: boolean }[]
```

Para la pantalla de canje conviene pedir `onlyActive=true`; para la de administración, sin
el filtro (así se ven también los dados de baja).

#### `POST /rewards` — solo owner/manager → 201

```ts
{ name: string; description?: string }   // max 80 / max 300
```

#### `PATCH /rewards/:id` — solo owner/manager

```ts
{ name?: string; description?: string; active?: boolean }
```

`active: false` es baja lógica. **No hay DELETE y no lo va a haber**: el id queda
referenciado en los canjes históricos.

> No hay campo de costo en el premio, y es a propósito: con mecánica de cartilla, completar
> `stampsRequired` sellos acredita **un crédito** y todo premio del catálogo cuesta
> exactamente ese crédito. El catálogo define *qué* se puede elegir, no *cuánto* cuesta.
> Costos distintos por premio serían mecánica de puntos, que es otra fase.

#### `POST /rewards/:rewardId/redemptions` — canjear → 201

```ts
// request
{ customerQrToken: string }   // se vuelve a escanear el QR del cliente

// response 201
{
  redemptionId: string;
  customer: { id: string; name: string; lastName: string };
  rewardName: string;
  availableRewards: number;  // créditos que le quedan
  stampBalance: number;      // la cartilla en curso NO se toca: los sellos sobrantes no se pierden
  stampsRequired: number;
}
```

| Código | Mensaje |
|---|---|
| 404 | `QR de cliente inválido` / `Premio no encontrado` |
| 409 | `El cliente está inactivo` |
| 409 | `El premio no está disponible` (dado de baja) |
| 409 | `El cliente no tiene premios disponibles` |

Ese último 409 también es lo que aparece si dos cajas canjean el mismo crédito
simultáneamente: el débito es atómico, así que la segunda pierde. No es un caso raro a
ignorar — hay que mostrarlo con un mensaje claro.

#### `GET /rewards/redemptions?limit=50`

```ts
// response 200 — array
{
  id: string;
  customerId: string;
  rewardId: string;
  rewardName: string;         // snapshot al momento del canje
  status: 'Redeemed' | 'Cancelled';
  redeemedBy?: string;
  createdAt: string;
}[]
```

`rewardName` es el nombre **al momento del canje**: usar siempre este campo en el historial
y no ir a buscar el premio al catálogo, porque puede haberse renombrado.

---

### 3.6 Clientes

#### `GET /customers?search=&limit=`

```ts
// response 200
{
  id: string;
  name: string;
  lastName: string;
  identificationNumber: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
}[]
```

`search` es una sola caja que busca en documento, correo, nombre y apellido: en el mostrador
no hay tiempo de elegir un criterio. Sin `search` devuelve los últimos clientes.

**La respuesta no incluye el `qrToken`.** Es la credencial con la que se acreditan sellos y
se canjean premios, así que no viaja en un listado que devuelve muchos clientes de una.

#### `GET /customers/:id/qr.svg`

QR del pase de **un** cliente, listo para un `<img src>`. Es el camino de recuperación: el
cliente cambió de teléfono, el nuevo no tiene su credencial guardada, el staff lo identifica
en persona y le muestra esto para que lo escanee.

Los dos endpoints son para cualquier rol con tienda, incluido `tenant_staff`: quien atiende
la caja es justamente quien necesita resolverlo.

**No existe ni va a existir una recuperación self-service por documento.** El documento no
es un secreto y además es enumerable, así que un endpoint que devuelva la credencial a
partir de él sería regalar los premios a quien itere números. El factor de autenticación
acá es que la persona está parada frente a la caja.

---

### 3.7 Tienda

#### `GET /tenants` — solo `platform_admin`

```ts
{ id: string; name: string; status: 'Active' | 'Suspended'; enrollUrl: string }[]
```

`enrollUrl` viene armada desde el back — **el front no la construye**.

#### `GET /tenants/:id/qr.svg`

Devuelve el **SVG** del QR imprimible del local (`Content-Type: image/svg+xml`), listo para
el cartel: escala a cualquier tamaño sin pixelarse. Un usuario de tienda solo puede pedir el
de la suya (si no, 403).

Ojo: requiere `Authorization`, así que **no se puede poner directo en un `<img src>`** —
hay que hacer el fetch y renderizar el SVG inline o vía blob URL.

#### `GET /health` — PÚBLICO

Estado del servicio y de Mongo. Formato de `@nestjs/terminus`.

---

## 4. Flujo sugerido para las primeras pruebas end-to-end

1. `npm run seed:tenant -- "Cafetería Central" owner@demo.com clave123` → anotar el
   `qrToken` de la tienda.
2. `POST /auth/login` con `owner@demo.com` / `clave123` → guardar el `accessToken`.
3. `GET /loyalty/program` → ver la config (10 sellos, cooldown 120s, `visits_only`).
4. `GET /enrollment/{tenantQrToken}` → debe devolver `{ "name": "Cafetería Central" }`.
5. `POST /enrollment/{tenantQrToken}` con datos de un cliente → **guardar el `qrToken` del
   cliente**.
6. `POST /visits` con ese `customerQrToken` → `stamped: true`, `stampBalance: 1`.
7. Repetir el paso 6 inmediatamente → `stamped: false`, `reason: 'cooldown'`. **Esta es la
   prueba clave de la UI del scan.**
8. Para no esperar los 120 s en cada prueba: `PATCH /loyalty/program` con
   `{ "visitCooldownSeconds": 0 }`.
9. Escanear 10 veces → en la décima llega `unlockedNow: 1` y `availableRewards: 1`.
10. `GET /rewards?onlyActive=true` → tomar el id del "Premio de la casa".
11. `POST /rewards/{id}/redemptions` con el `customerQrToken` → `availableRewards: 0`.
12. Repetir el 11 → 409 `"El cliente no tiene premios disponibles"`.
13. `GET /visits` y `GET /rewards/redemptions` → verificar que el historial refleje todo.

Atajo para probar la cartilla rápido: `PATCH /loyalty/program` con
`{ "stampsRequired": 2, "visitCooldownSeconds": 0 }` **antes** de registrar al cliente (el
umbral se congela al crear la tarjeta, así que un cliente ya registrado conserva el viejo).

---

## 5. Lo que todavía NO existe

Para que no se planifiquen pantallas contra esto:

| Ruta | Estado |
|---|---|
| `/customers` | controller vacío. **No hay listado ni búsqueda de clientes desde el panel.** Hoy solo se llega a un cliente por su QR. |
| `/users` | controller vacío. No hay ABM de usuarios del panel; se crean por el seed. |
| `/promotions` | controller vacío, sin modelo de datos. |
| `/passes` | controller vacío. **No hay wallet pass de Apple/Google todavía.** El QR del cliente hay que renderizarlo en el front a partir del `qrToken`. |
| `/notifications` | controller vacío. No hay envío de mails ni push. |

Otras ausencias a tener en cuenta al diseñar:

- **No hay refresh token.** 401 → login. El access token dura 15 minutos.
- **No hay paginación por cursor** en ningún listado, solo `limit`.
- **No hay endpoint para crear tiendas** por API: se hace con el script de seed.
- **No hay cancelación de canjes.** El enum `RedemptionStatus` contempla `Cancelled` pero
  no hay endpoint que lo haga.
- **Solo la mecánica de sellos está implementada.** `points`, `coupons` y `tiers` existen en
  el enum pero `PATCH /loyalty/program` los rechaza con 400.

Si algo de esta lista bloquea una pantalla que ya está en el diseño, avisen y lo priorizamos.

---

## 6. Contrato en TypeScript

Los tipos de arriba salen tal cual de las interfaces del back. La fuente de verdad
siempre es **Swagger** (`/api/docs`), que se genera del código: si algo de este documento
quedó desactualizado, gana Swagger. Desde ahí también se puede generar un cliente
tipado automáticamente (`openapi-typescript` sobre `/api/docs-json`) en vez de escribir
las interfaces a mano.
