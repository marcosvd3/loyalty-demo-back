# Panel de la tienda — qué hay que construir en el front

Compañero del [contrato de API](./api-frontend.md): aquel dice **qué responde cada
endpoint**, este dice **qué pantalla lo consume y en qué orden conviene atacarlas**.

El backend del panel está terminado y desplegado. Lo que falta es todo del lado del front.

---

## 1. Punto de partida real

### Lo que ya está hecho y no hay que tocar

| | |
|---|---|
| `core/services/api.ts` | wrapper de `HttpClient` con `get/post/patch/delete` sobre `environment.apiUrl` |
| `core/interceptors/auth-interceptor.ts` | mete el `Authorization: Bearer` en cada request |
| `core/interceptors/error-interceptor.ts` | ante un 401 limpia la sesión y manda a `/login` |
| `core/guards/auth-guard.ts` | protege el shell; redirige a `/login?redirectTo=<url>` |
| `app.routes.ts` | las 7 rutas del panel ya están declaradas con lazy loading bajo el shell |
| `layout/shell/` | sidebar con los 6 ítems de navegación, topbar con el email y botón de salir |
| `core/models/index.ts` | tipos base, incluido `Paginated<T>`, que ya calza con lo que devuelve `GET /customers` |

O sea: la plomería está resuelta. Se pega el token solo, se maneja el 401 solo y las rutas
existen.

### Lo que está diseñado y sirve de referencia

- `features/auth/register/` (305 líneas de TS, 146 de HTML, 89 de SCSS)
- `features/auth/register-success/`
- `features/wallet-pass/` y `shared/components/wallet-card/`
- `features/auth/_auth-card.scss` (174 líneas) y `shared/styles/_palette.scss`

**`register.ts` es el patrón a copiar**: signals para el estado (`submitting`,
`errorMessage`), `computed` para lo derivado, reactive forms con `FormBuilder`, y los
parámetros de ruta entrando por `input.required<string>()` gracias a
`withComponentInputBinding()`.

`_palette.scss` tiene la paleta (neumorfismo sobre `#e9edf0`, acento verde) y la tipografía
display. El panel debería verse como una continuación de eso, no como otra app.

### Lo que está vacío

**Todas las pantallas del panel son scaffold**: `export class X {}`, HTML de una línea, SCSS
vacío. Eso incluye `login`, `dashboard`, `customers`, `customer-detail`, `visits`,
`loyalty`, `promotions` y `settings`.

`layout/shell/shell.scss` también está en cero: el shell funciona pero no tiene ni una regla
de estilo. Y `src/styles.scss` tiene una sola línea.

Dicho de otra forma: **el panel hay que diseñarlo, no cablearlo.** No hay maqueta previa que
respetar más allá del lenguaje visual del recorrido público.

---

## 2. Dos arreglos previos en `core/services/auth.ts`

El servicio guarda y limpia la sesión, pero le faltan dos cosas para que el panel funcione:

1. **No tiene `login()`.** Hay que agregarlo: `POST /auth/login` → `setSession(accessToken, user)`.
2. **No rehidrata el usuario al recargar.** El token se lee de `localStorage` al arrancar,
   pero `user` queda en `null`. Después de un F5 el shell no sabe el rol ni el email:
   el sidebar aparece sin datos y no se pueden ocultar las acciones por rol.

   La solución es pedir `GET /auth/me` al bootear cuando hay token guardado. Ojo que ese
   endpoint devuelve `{ id, email, role, tenantId }` — **sin `name`**, que sí viene en el
   login. Si el shell muestra el nombre, o se guarda también en `localStorage`, o se muestra
   el email.

---

## 3. Orden sugerido

### 1º Login — desbloquea todo lo demás

Ruta `/login`, ya declarada. Es la única pantalla sin la que no se puede probar nada del
panel.

- `POST /auth/login` con `{ email, password }` → `{ accessToken, user }`.
- Guardar con `Auth.setSession()` y navegar.
- **Respetar el `redirectTo`**: el guard lo deja como query param cuando patea a alguien no
  autenticado. Si no está, ir a `/dashboard`.
- Credenciales mal → 401 con `message: "Credenciales inválidas"`. Es el mismo mensaje para
  usuario inexistente, clave incorrecta y cuenta desactivada, a propósito: no queremos que
  se puedan enumerar las cuentas.
- El token dura **15 minutos** y no hay refresh. El interceptor ya maneja el 401.

Visualmente se apoya en `_auth-card.scss`, que es la tarjeta que ya usan register y
register-success.

### 2º Clientes — es donde hay más backend listo

**Listado** (`/customers`) — `GET /customers?search=&page=&limit=`

Devuelve `Paginated<T>`, el tipo que ya está en `core/models`. Cada ítem trae la ficha
resumida **más la tarjeta del cliente**, así que la tabla puede mostrar sellos y premios
disponibles sin una segunda llamada:

```ts
{ id, name, lastName, identificationNumber, email, phone, status, createdAt,
  wallet: { stampBalance, stampsRequired, availableRewards, totalVisits, lastVisitAt } | null }
```

`search` es **una sola caja** que busca en id, documento, correo, teléfono, nombre y
apellido. No hace falta un selector de criterio: en el mostrador no hay tiempo de elegir.
El id matchea exacto, el resto como subcadena sin distinguir mayúsculas.

`wallet` puede venir en `null` si el alta se cortó antes de crear la tarjeta. Es raro pero
pasa, y la tabla no debería romperse.

**Ficha** (`/customers/:id`) — `GET /customers/:id`

Trae todo lo de la vista de detalle en una llamada: `{ customer, wallet, visits[], redemptions[] }`,
con los últimos 20 movimientos de cada tipo, más recientes primero.

- `PATCH /customers/:id` para editar. Ojo con dos cosas: el body solo acepta los campos
  declarados (mandar uno de más da **400**, no se ignora), y `email`/`identificationNumber`
  son únicos dentro de la tienda, así que un choque da **409**.
- `DELETE /customers/:id` es **baja lógica**: pone `status: 'Inactive'`, no borra. El cliente
  deja de sumar sellos y de canjear, pero sigue en el listado con su historial. Conviene que
  la UI lo diga así ("dar de baja", no "eliminar") y que muestre los inactivos con algún
  distintivo. Se revierte con `PATCH { status: 'Active' }`.
- El QR del cliente sale de `GET /customers/:id/qr.svg`. **Requiere `Authorization`, así que
  no se puede poner en un `<img src>` directo**: hay que bajarlo con `HttpClient` como blob y
  pasarlo por `URL.createObjectURL()`.

Editar y dar de baja es **owner/manager**; el staff solo lee. Conviene ocultarle esos
botones, aunque el back igual responde 403.

### 3º Dashboard

**Acá hay una decisión que tomar y conviene tomarla antes de diseñar la pantalla.**

No existe un endpoint de métricas agregadas. Lo que hay para componer una portada es:

| Dato | De dónde |
|---|---|
| Total de clientes | `GET /customers?limit=1` → `meta.total` |
| Últimas visitas | `GET /visits?limit=N` |
| Últimos canjes | `GET /rewards/redemptions?limit=N` |
| Config del programa | `GET /loyalty/program` |

Con eso salen un par de tarjetas y dos feeds de actividad. Lo que **no** sale es nada con
corte temporal: "visitas de hoy", "clientes nuevos esta semana", "sellos del mes". Calcularlo
en el front sobre los últimos N registros da un número que miente en cuanto la tienda tenga
volumen.

Si el diseño del dashboard pide ese tipo de métrica, **pídanla como endpoint** y la
agregamos; es un `$group` del lado del back y sale rápido. Lo que no conviene es simularla.

### 4º Visitas

- `GET /visits?limit=` — feed de actividad de la tienda.
- `POST /visits` con `{ customerQrToken }` — es **el scan del mostrador**, el flujo más
  importante del negocio.
- `GET /visits/customers/:customerId` — historial de un cliente.

Dos cosas del scan que cambian la UI:

1. Si el scan cae dentro del cooldown responde **200 con `stamped: false` y
   `reason: 'cooldown'`**, no un error. Hay que mostrar el saldo actual y un mensaje tranquilo,
   no un cartel rojo: la idea del cooldown es justamente que el cajero no insista.
2. La respuesta trae `unlockedNow` (cartillas completadas por ese scan) y `availableRewards`.
   `unlockedNow > 0` es el momento de "¡Premio desbloqueado!" y `availableRewards >= 1`
   habilita el botón de canjear.

Si la tienda está en modo `manual_amount`, el scan **exige** `amountCents` (entero, en la
unidad menor de la moneda — nunca decimales). En modo `visits_only`, mandarlo da 400. El modo
sale de `GET /loyalty/program`.

### 5º Fidelización

- `GET /loyalty/program` y `PATCH /loyalty/program` — sellos por visita, sellos por cartilla,
  cooldown, pausar el programa.
- `GET /rewards`, `POST /rewards`, `PATCH /rewards/:id` — catálogo de premios.
- `POST /rewards/:rewardId/redemptions` — canjear.

Solo la mecánica de **sellos** está implementada. `points`, `coupons` y `tiers` existen en el
enum pero `PATCH /loyalty/program` los rechaza con 400. No los ofrezcan como opción
seleccionable todavía, o si los muestran que sea deshabilitados.

Cambiar `stampsRequired` **no afecta a las cartillas en curso**: cada tarjeta guarda el umbral
con el que nació. Vale la pena aclararlo en la UI porque es contraintuitivo.

Editar el programa y el catálogo es owner/manager.

### 6º Configuración

Dos bloques:

**La tienda** — `GET /tenants` y `GET /tenants/:id/qr.svg` (el QR para imprimir; mismo tema
del `Authorization`, no va en un `<img src>` directo).

**El equipo del panel** — es un ABM completo, todo **solo owner** salvo el listado, que
también ve el manager:

| | |
|---|---|
| `GET /users` | cuentas de la tienda |
| `POST /users` | crear, con contraseña inicial (8 a 72 caracteres) |
| `PATCH /users/:id` | nombre, rol, activar/desactivar |
| `POST /users/:id/password` | reset por parte del owner |
| `POST /auth/change-password` | cambio de la propia, exige la actual |

Tres reglas que la UI debería reflejar para no mostrar errores evitables:

- Los roles asignables son `tenant_owner`, `tenant_manager` y `tenant_staff`. `platform_admin`
  no es una opción y mandarlo da 400.
- **El owner no puede cambiar su propio rol ni desactivarse** (403). Deshabiliten esos
  controles en su propia fila. Sí puede cambiarse el nombre.
- No hay envío de correo: la contraseña inicial la define el owner y se la pasa por fuera.
  Tampoco hay "olvidé mi contraseña" — si alguien la pierde, se la resetea el owner. Y si la
  pierde el owner, hay que tocar la base a mano.

### Promociones — no hay backend

`/promotions` tiene ruta y componente scaffold, pero el módulo del back **no tiene endpoints
ni modelo de datos**. No planifiquen esa pantalla todavía: si es prioridad, avisen y la
hacemos.

---

## 4. Cosas que ahorran tiempo

- **El front nunca manda el `tenantId`.** Va firmado dentro del JWT. No hay header ni query
  param de tenant; mandarlo se ignora.
- **Mandar un campo que el DTO no declara devuelve 400.** El pipe corre con
  `forbidNonWhitelisted`. Nada de mandar el objeto entero del formulario con campos de más —
  esto es lo que más 400 inesperados genera.
- **En los errores de validación, `message` es un array de strings**, uno por campo. En el
  resto es un string. Conviene normalizarlo en un solo lugar.
- **401 → login.** No hay refresh token; el access dura 15 minutos. Ya lo maneja el
  `errorInterceptor`.
- **Ocultar por rol lo que el rol no puede hacer.** El back lo bloquea igual con 403, pero un
  botón que siempre falla es una mala pantalla. El rol está en `Auth.user()?.role`.
- `environment.apiUrl` es `/api/v1` y Netlify proxea a Render, así que **no hay CORS** ni URLs
  absolutas que configurar.

## 5. Para probar

- **API desplegada**: `https://loyalty-demo-back.onrender.com/api/v1`
- **Swagger** (con "Authorize" para pegar el token): `https://loyalty-demo-back.onrender.com/api/docs`
- **Cuenta**: `owner@demo.com` / `clave123` — rol `tenant_owner` de "Cafetería Central".

Está en el plan gratuito de Render, así que **la primera request después de un rato tarda
~50 segundos** mientras el contenedor despierta. No es un bug del front.

Dato para calibrar expectativas: la tienda de prueba tiene **2 clientes y ninguna visita**,
así que el dashboard y los feeds de actividad van a verse vacíos hasta que se registren
scans. Se pueden generar desde Swagger con `POST /visits`, o pídannos que sembremos datos de
prueba con volumen para poder diseñar contra algo realista.
