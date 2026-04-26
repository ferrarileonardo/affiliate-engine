# Manual Operativo de Pruebas — Affiliate Engine

> **Versión:** 1.0
> **Stack:** React Router v7 · Prisma/SQLite · Shopify Web Pixel
> **Base URL local:** `https://<tunnel>.trycloudflare.com` (cambia con cada `npm run dev`)

---

## Índice

1. [Preparación del ambiente](#1-preparación-del-ambiente)
2. [Módulo A — Dashboard Admin](#2-módulo-a--dashboard-admin)
3. [Módulo B — API /api/click](#3-módulo-b--apiapiclick)
4. [Módulo C — API /api/conversion](#4-módulo-c--apiapiconversion)
5. [Módulo D — Flujo de integración end-to-end](#5-módulo-d--flujo-de-integración-end-to-end)
6. [Módulo E — Web Pixel Extension](#6-módulo-e--web-pixel-extension)
7. [Módulo F — Validaciones y casos de error](#7-módulo-f--validaciones-y-casos-de-error)
8. [Módulo G — Verificación en base de datos](#8-módulo-g--verificación-en-base-de-datos)
9. [Matriz de resultados](#9-matriz-de-resultados)
10. [Solución de problemas comunes](#10-solución-de-problemas-comunes)

---

## 1. Preparación del ambiente

### 1.1 Requisitos previos

| Requisito | Versión mínima | Verificar con |
|---|---|---|
| Node.js | 20.19 | `node -v` |
| Shopify CLI | 3.x | `shopify version` |
| npm | 9.x | `npm -v` |

### 1.2 Variables de entorno obligatorias

El archivo `.env` debe tener:

```
SHOPIFY_API_KEY=<tu API key>
SHOPIFY_API_SECRET=<tu API secret>
SHOPIFY_APP_URL=https://<tunnel>.trycloudflare.com
SCOPES=read_customer_events,write_pixels,write_products,write_metaobjects,write_metaobject_definitions
```

### 1.3 Inicializar la base de datos

```bash
npm run setup
```

### 1.4 Cargar datos de prueba

```bash
npx prisma db seed
```

Crea tres afiliados base:

| Código | Nombre | Comisión |
|---|---|---|
| `TEST123` | Test Affiliate | 10% |
| `JOHN2026` | John Influencer | 15% |
| `INFLUENCER1` | Top Influencer | 20% |

### 1.5 Iniciar el servidor

```bash
npm run dev
```

Presionar **P** para abrir la app. Anotar la URL del tunnel.

### 1.6 Herramientas necesarias

- **Browser** con DevTools (F12)
- **Pestaña Network** — verificar requests/responses
- **Pestaña Application → Cookies/Storage** — verificar persistencia del pixel
- **Consola del browser** — ejecutar los comandos `fetch()` de prueba
- **Prisma Studio** (opcional): `npx prisma studio` en `http://localhost:5555`

---

## 2. Módulo A — Dashboard Admin

> **Ruta:** `/app` | **Autenticación:** OAuth de Shopify requerido

---

### TC-A01 — Carga del dashboard con resumen de estadísticas

**Pre-condición:** Seed ejecutado

**Pasos:**
1. Navegar a `/app`
2. Observar la sección "Overview"

**Resultado esperado:**

| Card | Valor |
|---|---|
| Affiliates | `3` |
| Total Clicks | `0` |
| Conversions | `0` |
| Total Revenue | `$0.00` |
| Total Commission | `$0.00` |

---

### TC-A02 — Crear afiliado con todos los campos

**Pasos:**
1. **Affiliate Code:** `NUEVO2026` | **Name:** `Influencer de Prueba` | **Commission Rate:** `12`
2. Click en **Create Affiliate**

**Resultado esperado:**
- Toast: `"Affiliate created successfully"`
- Aparece en tabla con comisión `12%`, todos los contadores en `0`, estado `Active`
- Card "Affiliates" sube de 3 a 4

---

### TC-A03 — Crear afiliado sin nombre (campo opcional)

**Pasos:** Solo **Code:** `SINNOMBRE` y **Rate:** `8`

**Resultado esperado:** Columna "Name" muestra `—`

---

### TC-A04 — Normalización del código a mayúsculas

**Pasos:** **Code:** `minuscula2026`, **Rate:** `5`

**Resultado esperado:** Código guardado como `MINUSCULA2026`

---

### TC-A05 — Error: código duplicado

**Pre-condición:** `JOHN2026` existe en el seed

**Pasos:** Intentar crear con **Code:** `john2026`

**Resultado esperado:** Mensaje de error: `Code "JOHN2026" already exists`

---

### TC-A06 — Error: tasa fuera de rango

**Caso A — Rate `0`:** Error `"Commission rate must be between 1 and 100"`

**Caso B — Rate `101`:** Mismo error

---

### TC-A07 — Error: código vacío

**Pasos:** Dejar **Code** vacío, **Rate:** `10`, submit

**Resultado esperado:** Validación HTML5 nativa `required`, no se hace submit

---

### TC-A08 — Toggle: desactivar afiliado activo

**Pasos:** Click en badge verde `Active` de `TEST123`

**Resultado esperado:** Badge cambia a rojo `Inactive` | Toast: `"Status updated"`

---

### TC-A09 — Toggle: reactivar afiliado inactivo

**Pre-condición:** `TEST123` inactivo (TC-A08)

**Pasos:** Click en badge rojo `Inactive`

**Resultado esperado:** Badge vuelve a verde `Active`

---

### TC-A10 — Eliminar afiliado sin datos

**Pre-condición:** Crear `PARA_BORRAR` con rate `5`

**Pasos:** Click en `Delete` → confirmar en el diálogo

**Resultado esperado:** Desaparece de la tabla | Card "Affiliates" decrece en 1

---

### TC-A11 — Eliminar afiliado con datos asociados (cascade)

**Pre-condición:** `JOHN2026` tiene al menos 1 click (ejecutar TC-B01 primero)

**Pasos:** Delete de `JOHN2026` → confirmar

**Verificación en Prisma Studio:**
- Tabla `Click`: 0 registros con el `affiliateId` eliminado
- Tabla `Conversion`: ídem

---

### TC-A12 — Cancelar eliminación

**Pasos:** Click en `Delete` → click en **Cancelar** en el diálogo

**Resultado esperado:** Afiliado NO se elimina, no hay toast ni cambios

---

### TC-A13 — Preview del link de referido

**Verificación visual:** Columna "Code / Link" muestra código en monoespaciada y el dominio + `?ref=CODE` en gris debajo

---

## 3. Módulo B — API /api/click

> Ejecutar en la **consola del browser** (F12 → Console)

---

### TC-B01 — Click válido (caso feliz)

```javascript
fetch('/api/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'JOHN2026', shop: 'demo.myshopify.com', userAgent: 'Test/1.0' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": true, "affiliateId": "<cuid>" }`

---

### TC-B02 — Anti-spam: segundo click en menos de 10 segundos

**Comando:** Mismo que TC-B01, ejecutar inmediatamente después

**Resultado esperado:** `{ "ok": true, "skipped": true }` | Clicks en dashboard NO aumentan

---

### TC-B03 — Click válido después de 10 segundos

**Pre-condición:** Esperar ≥10s desde TC-B01

**Resultado esperado:** `{ "ok": true, "affiliateId": "<cuid>" }` | Clicks suben a 2

---

### TC-B04 — Normalización: código en minúsculas

```javascript
fetch('/api/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'john2026', shop: 'demo.myshopify.com' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": true, "affiliateId": "<cuid>" }` — `john2026` resuelve como `JOHN2026`

---

### TC-B05 — Código inexistente

```javascript
fetch('/api/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'NOEXISTE' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": false, "error": "Affiliate not found" }` | HTTP `404`

---

### TC-B06 — Click en afiliado inactivo

**Pre-condición:** `TEST123` desactivado (TC-A08)

```javascript
fetch('/api/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'TEST123' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": false, "error": "Affiliate not found" }` | HTTP `404`

---

### TC-B07 — Campo `ref` faltante

```javascript
fetch('/api/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ shop: 'demo.myshopify.com' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": false, "error": "Missing ref" }` | HTTP `400`

---

### TC-B08 — CORS: preflight OPTIONS

```javascript
fetch('/api/click', { method: 'OPTIONS' })
  .then(r => { console.log('Status:', r.status); console.log('CORS:', r.headers.get('Access-Control-Allow-Origin')) })
```

**Resultado esperado:** `Status: 204` | `CORS: *`

---

### TC-B09 — Click sin campos opcionales

```javascript
fetch('/api/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'INFLUENCER1' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": true, "affiliateId": "<cuid>" }` | `shop` y `userAgent` se guardan como `null`

---

## 4. Módulo C — API /api/conversion

---

### TC-C01 — Conversión válida con cálculo de comisión

**Pre-condición:** `JOHN2026` activo (rate: 15%)

```javascript
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ref: 'JOHN2026', shop: 'demo.myshopify.com',
    orderId: 'gid://shopify/Order/10001', totalPrice: '200.00', currency: 'USD'
  })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": true, "conversionId": "<cuid>" }`

**Verificación de cálculo:**

| Campo | Fórmula | Valor |
|---|---|---|
| `commissionApp` | `200 × 5%` | `10.00` |
| `commissionAffiliate` | `200 × 15%` | `30.00` |

---

### TC-C02 — Cálculos con diferentes tasas

**TEST123 (10%) — orden $150:**
```javascript
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'TEST123', shop: 'demo.myshopify.com', orderId: 'gid://shopify/Order/10002', totalPrice: '150.00', currency: 'USD' })
}).then(r => r.json()).then(console.log)
```

`commissionApp = 7.50` | `commissionAffiliate = 15.00`

**INFLUENCER1 (20%) — orden $500:**
```javascript
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'INFLUENCER1', shop: 'demo.myshopify.com', orderId: 'gid://shopify/Order/10003', totalPrice: '500.00', currency: 'USD' })
}).then(r => r.json()).then(console.log)
```

`commissionApp = 25.00` | `commissionAffiliate = 100.00`

---

### TC-C03 — Idempotencia: misma orden dos veces

**Pre-condición:** TC-C01 ejecutado

**Comando:** Mismo que TC-C01

**Resultado esperado:** `{ "ok": true, "skipped": true }` | Dashboard no cambia | DB tiene 1 sola conversión

---

### TC-C04 — Normalización: código en minúsculas

```javascript
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'influencer1', shop: 'demo.myshopify.com', orderId: 'gid://shopify/Order/10004', totalPrice: '300.00', currency: 'EUR' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": true, "conversionId": "<cuid>" }` — `influencer1` resuelve como `INFLUENCER1`

---

### TC-C05 — Código inexistente

```javascript
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'FANTASMA', shop: 'demo.myshopify.com', orderId: 'ORD-X', totalPrice: '100.00' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": false, "error": "Affiliate not found" }` | HTTP `404`

---

### TC-C06 — Campos requeridos faltantes

**Sin `ref`:**
```javascript
fetch('/api/conversion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shop: 'demo.myshopify.com', orderId: 'ORD-X', totalPrice: '100' }) }).then(r => r.json()).then(console.log)
```

**Sin `orderId`:**
```javascript
fetch('/api/conversion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'JOHN2026', shop: 'demo.myshopify.com', totalPrice: '100' }) }).then(r => r.json()).then(console.log)
```

**Sin `totalPrice`:**
```javascript
fetch('/api/conversion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'JOHN2026', shop: 'demo.myshopify.com', orderId: 'ORD-X' }) }).then(r => r.json()).then(console.log)
```

**Resultado esperado (los tres):** `{ "ok": false, "error": "Missing required fields" }` | HTTP `400`

---

### TC-C07 — CORS: preflight OPTIONS

```javascript
fetch('/api/conversion', { method: 'OPTIONS' })
  .then(r => { console.log('Status:', r.status); console.log('CORS:', r.headers.get('Access-Control-Allow-Origin')) })
```

**Resultado esperado:** `Status: 204` | `CORS: *`

---

### TC-C08 — Currency por defecto (USD)

```javascript
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'TEST123', shop: 'demo.myshopify.com', orderId: 'gid://shopify/Order/20001', totalPrice: '80.00' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": true }` | Conversión guardada con `currency = "USD"`

---

## 5. Módulo D — Flujo de integración end-to-end

---

### TC-D01 — Flujo completo: clic → checkout → dashboard

**Paso 1 — Limpiar estado previo:**
```javascript
sessionStorage.clear()
document.cookie = "affiliate_ref=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
```

**Paso 2 — Registrar clic y persistir ref:**
```javascript
fetch('/api/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'JOHN2026', shop: window.location.hostname })
}).then(r => r.json()).then(d => {
  console.log('CLICK:', d)
  sessionStorage.setItem('affiliate_ref', 'JOHN2026')
  document.cookie = 'affiliate_ref=JOHN2026; path=/; SameSite=None'
})
```

**Paso 3 — Registrar conversión:**
```javascript
const ref = sessionStorage.getItem('affiliate_ref')
console.log('Ref:', ref)  // debe ser JOHN2026

fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref, shop: window.location.hostname, orderId: 'gid://shopify/Order/FLOW001', totalPrice: '350.00', currency: 'USD' })
}).then(r => r.json()).then(console.log)
```

**Paso 4 — Verificar en dashboard:** `JOHN2026` muestra Revenue `$350.00` y Commission `$52.50`

---

### TC-D02 — Atribución via cookie (sesión cerrada y reabierta)

**Paso 1 — Limpiar sessionStorage, mantener cookie:**
```javascript
sessionStorage.removeItem('affiliate_ref')
sessionStorage.removeItem('affiliate_click_sent')
document.cookie = 'affiliate_ref=INFLUENCER1; path=/; SameSite=None'
```

**Paso 2 — Leer ref del cookie:**
```javascript
function getCookie(name) {
  return document.cookie.split('; ').find(r => r.startsWith(name + '='))?.split('=')[1]
}
const ref = sessionStorage.getItem('affiliate_ref') || getCookie('affiliate_ref')
console.log('Ref recuperado:', ref)  // debe ser INFLUENCER1
```

**Paso 3 — Registrar conversión:**
```javascript
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref, shop: window.location.hostname, orderId: 'gid://shopify/Order/COOKIE001', totalPrice: '120.00', currency: 'USD' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": true }` | `INFLUENCER1` muestra la conversión en dashboard

---

### TC-D03 — Totales acumulados correctos

**Verificación:** Los valores del Overview deben ser la suma exacta de todas las filas individuales de la tabla.

---

## 6. Módulo E — Web Pixel Extension

> Requiere extensión instalada en el storefront y App URL configurado en los settings del pixel.

---

### TC-E01 — Configurar el pixel

1. Shopify Admin → **Settings → Customer events**
2. Localizar **affiliate-pixel-v2** → **Configure**
3. Campo **App URL**: ingresar URL del tunnel
4. Guardar → estado debe quedar "Connected"

---

### TC-E02 — Captura de `?ref=` en page_viewed

**Pasos:**
1. Abrir DevTools → Network, filtrar por `/api/click`
2. Navegar al storefront: `https://tu-tienda.myshopify.com/?ref=JOHN2026`

**Resultado esperado:**
- Request `POST /api/click` con `{ "ref": "JOHN2026", "shop": "..." }`
- Cookie `affiliate_ref = JOHN2026` en Application → Cookies
- `affiliate_ref = JOHN2026` en Application → Session Storage

---

### TC-E03 — Anti-spam: segunda visita en la misma sesión

**Pasos:** Recargar la misma URL con `?ref=JOHN2026`

**Resultado esperado:** No se hace nueva request a `/api/click` (sessionStorage tiene `affiliate_click_sent = 1`)

---

### TC-E04 — Persistencia al navegar sin `?ref=`

**Pasos:** Navegar a otra página del storefront sin `?ref=`

**Resultado esperado:** Cookie y sessionStorage siguen presentes | No se envía request a `/api/click`

---

### TC-E05 — Conversión en checkout_completed

**Pasos:**
1. Llegar al storefront con `?ref=JOHN2026`
2. Agregar producto al carrito y completar checkout

**Verificar en Network:** Request `POST /api/conversion` con orderId, totalPrice y currency reales

**Resultado esperado:** `{ "ok": true, "conversionId": "<cuid>" }` | Dashboard actualizado

---

### TC-E06 — Sin conversión cuando no hay ref

**Pasos:** Limpiar cookies y sessionStorage → navegar sin `?ref=` → completar checkout

**Resultado esperado:** No se envía request a `/api/conversion`

---

## 7. Módulo F — Validaciones y casos de error

---

### TC-F01 — JSON malformado

```javascript
fetch('/api/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: 'esto no es json'
}).then(r => { console.log('Status:', r.status); return r.json() }).then(console.log)
```

**Resultado esperado:** `{ "ok": false, "error": "Server error" }` | HTTP `500`

---

### TC-F02 — Método GET en endpoints de acción

```javascript
fetch('/api/click').then(r => console.log('GET click:', r.status))
fetch('/api/conversion').then(r => console.log('GET conversion:', r.status))
```

**Resultado esperado:** Ambos devuelven `405`

---

### TC-F03 — `totalPrice` como string numérico

```javascript
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'TEST123', shop: 'demo.myshopify.com', orderId: 'gid://shopify/Order/STR001', totalPrice: '99.99', currency: 'USD' })
}).then(r => r.json()).then(console.log)
```

**Resultado esperado:** `{ "ok": true }` — el backend convierte el string con `Number()`

---

### TC-F04 — Comisión con tasa decimal

**Crear afiliado `DECIMAL` con rate `12.5`, luego:**

```javascript
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'DECIMAL', shop: 'demo.myshopify.com', orderId: 'gid://shopify/Order/DEC001', totalPrice: '100.00' })
}).then(r => r.json()).then(console.log)
```

**Verificar en Prisma Studio:** `commissionAffiliate = 12.50` (2 decimales exactos)

---

## 8. Módulo G — Verificación en base de datos

Abrir Prisma Studio:
```bash
npx prisma studio
# Abre en http://localhost:5555
```

---

### TC-G01 — Click registrado correctamente

**Después de TC-B01**, tabla `Click`:

| Campo | Valor esperado |
|---|---|
| `affiliateId` | ID de JOHN2026 |
| `refCode` | `JOHN2026` |
| `shop` | `demo.myshopify.com` |
| `userAgent` | `Test/1.0` |

---

### TC-G02 — Conversión registrada correctamente

**Después de TC-C01**, tabla `Conversion`:

| Campo | Valor |
|---|---|
| `orderId` | `gid://shopify/Order/10001` |
| `refCode` | `JOHN2026` |
| `totalAmount` | `200` |
| `commissionApp` | `10` |
| `commissionAffiliate` | `30` |
| `currency` | `USD` |

---

### TC-G03 — Cascade delete

**Después de TC-A11:** filtrar `Click` y `Conversion` por `affiliateId` eliminado → 0 resultados en ambas tablas

---

### TC-G04 — Idempotencia

**Después de TC-C03:** filtrar `Conversion` por `orderId = gid://shopify/Order/10001` → exactamente 1 registro

---

### TC-G05 — Toggle isActive

**Después de TC-A08:** tabla `Affiliate`, registro `TEST123` → `isActive = false`

**Después de TC-A09:** mismo registro → `isActive = true`

---

## 9. Matriz de resultados

| ID | Descripción | Estado | Notas |
|---|---|---|---|
| TC-A01 | Carga dashboard con stats | ⬜ | |
| TC-A02 | Crear afiliado completo | ⬜ | |
| TC-A03 | Crear sin nombre | ⬜ | |
| TC-A04 | Normalización uppercase | ⬜ | |
| TC-A05 | Error código duplicado | ⬜ | |
| TC-A06 | Error tasa fuera de rango | ⬜ | |
| TC-A07 | Error código vacío | ⬜ | |
| TC-A08 | Toggle desactivar | ⬜ | |
| TC-A09 | Toggle reactivar | ⬜ | |
| TC-A10 | Delete sin datos | ⬜ | |
| TC-A11 | Delete con cascade | ⬜ | |
| TC-A12 | Cancelar eliminación | ⬜ | |
| TC-A13 | Preview link referido | ⬜ | |
| TC-B01 | Click válido | ⬜ | |
| TC-B02 | Anti-spam 10 segundos | ⬜ | |
| TC-B03 | Click post-cooldown | ⬜ | |
| TC-B04 | Normalización código | ⬜ | |
| TC-B05 | Código inexistente | ⬜ | |
| TC-B06 | Afiliado inactivo | ⬜ | |
| TC-B07 | Campo ref faltante | ⬜ | |
| TC-B08 | CORS OPTIONS click | ⬜ | |
| TC-B09 | Click sin campos opcionales | ⬜ | |
| TC-C01 | Conversión válida + cálculo | ⬜ | |
| TC-C02 | Cálculos distintas tasas | ⬜ | |
| TC-C03 | Idempotencia orderId | ⬜ | |
| TC-C04 | Normalización conversión | ⬜ | |
| TC-C05 | Código inexistente conv. | ⬜ | |
| TC-C06 | Campos faltantes | ⬜ | |
| TC-C07 | CORS OPTIONS conversion | ⬜ | |
| TC-C08 | Currency por defecto | ⬜ | |
| TC-D01 | Flujo completo E2E | ⬜ | |
| TC-D02 | Atribución via cookie | ⬜ | |
| TC-D03 | Totales acumulados | ⬜ | |
| TC-E01 | Configurar pixel | ⬜ | |
| TC-E02 | page_viewed captura ref | ⬜ | |
| TC-E03 | Anti-spam en pixel | ⬜ | |
| TC-E04 | Persistencia al navegar | ⬜ | |
| TC-E05 | checkout_completed | ⬜ | |
| TC-E06 | Sin conversión sin ref | ⬜ | |
| TC-F01 | JSON malformado | ⬜ | |
| TC-F02 | Método GET en endpoints | ⬜ | |
| TC-F03 | totalPrice como string | ⬜ | |
| TC-F04 | Comisión decimal | ⬜ | |
| TC-G01 | Click en DB | ⬜ | |
| TC-G02 | Conversión en DB | ⬜ | |
| TC-G03 | Cascade delete en DB | ⬜ | |
| TC-G04 | Idempotencia en DB | ⬜ | |
| TC-G05 | Toggle isActive en DB | ⬜ | |

**Leyenda:** ⬜ Pendiente · ✅ Pasó · ❌ Falló · ⚠️ Pasó con observaciones

---

## 10. Solución de problemas comunes

### El servidor no arranca

```
Error: SHOPIFY_APP_URL no está definida
```

**Solución:** Verificar que `.env` tiene las tres variables obligatorias.

---

### Los endpoints devuelven 401 o redirigen al login

**Causa:** Se accede desde `localhost` en vez del tunnel.

**Solución:** Ejecutar los `fetch()` desde la consola mientras estás en la URL del tunnel.

---

### El contador de clicks no sube en el dashboard

**Posibles causas:**
1. Anti-spam activo → esperar 10s y reintentar
2. Afiliado inactivo → verificar estado en tabla
3. Código con minúsculas → el backend normaliza, pero verificar que exista en DB

---

### Prisma Studio no abre

```bash
npm run setup      # regenera la DB si no existe
npx prisma studio  # abre en :5555
```

Si la DB está corrupta: borrar `prisma/dev.sqlite` → `npm run setup` → `npx prisma db seed`

---

### El pixel no envía requests en el storefront

1. Campo "App URL" no configurado → ver TC-E01
2. URL del tunnel cambió → actualizar el setting
3. Pixel no instalado → Shopify Admin → Settings → Customer events

---

*Manual Operativo de Pruebas — Affiliate Engine v1.0 — Converxity Technical Evaluation — Abril 2026*
