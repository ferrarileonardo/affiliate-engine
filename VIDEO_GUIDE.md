# Guía para el Video Explicativo — Affiliate Engine

> Duración objetivo: **3–5 minutos**
> Herramienta recomendada: Loom o YouTube unlisted
> Tener abierto: la app corriendo (`npm run dev`) + DevTools → Network

---

## Estructura del video

| Segmento | Contenido | Tiempo |
|---|---|---|
| 1 | Intro + contexto rápido | 30 seg |
| 2 | Demo: crear afiliado | 1 min |
| 3 | Demo: compra → cobro | 1.5 min |
| 4 | Decisiones arquitectónicas críticas | 1.5 min |
| 5 | Cierre | 20 seg |

---

## Segmento 1 — Intro (30 seg)

**Lo que se ve:** Pantalla del dashboard.

> "Hola, soy Leonardo. Les presento el MVP de afiliados para Shopify que construí para la prueba de Converxity. La app permite crear códigos de referido, rastrear clics y conversiones desde el storefront, y cobrar automáticamente un fee del 5% por cada venta referida usando la API de Usage-Based Billing de Shopify."

---

## Segmento 2 — Demo: crear afiliado (1 min)

**Lo que se ve:** Dashboard abierto en el browser.

> "En el dashboard vemos el resumen global: afiliados activos, clics, conversiones y revenue total."

*(Mostrar las tarjetas de estadísticas)*

> "Creo un afiliado nuevo."

*(Llenar el formulario: código `DEMO2026`, nombre `Demo Influencer`, tasa `12` → Create Affiliate)*

> "El código queda en mayúsculas y el afiliado aparece en la tabla con sus contadores en cero. Desde aquí puedo pausarlo o eliminarlo con cascade completo."

---

## Segmento 3 — Demo: compra → cobro (1.5 min)

**Lo que se ve:** DevTools → Console.

> "Simulo lo que hace el Web Pixel cuando un cliente llega con `?ref=DEMO2026` y completa una compra."

**Paso 1 — Clic del afiliado:**
```js
fetch('/api/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'DEMO2026', shop: 'demo.myshopify.com' })
}).then(r => r.json()).then(console.log)
```

> "`ok: true`. El pixel anti-spam bloquea duplicados dentro de 10 segundos."

**Paso 2 — Conversión:**
```js
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ref: 'DEMO2026',
    shop: 'demo.myshopify.com',
    orderId: 'gid://shopify/Order/99999',
    totalPrice: '200.00',
    currency: 'USD'
  })
}).then(r => r.json()).then(console.log)
```

> "Recibo `ok: true`. El sistema calculó: $10 de fee para la app (5%) y $24 de comisión para DEMO2026 (12%). Asincrónicamente, se dispara `appUsageRecordCreate` contra la API de Shopify para generar el cobro real al merchant. Si intento registrar la misma orden de nuevo, devuelve `skipped: true` — idempotencia garantizada."

*(Recargar el dashboard para mostrar los números actualizados)*

---

## Segmento 4 — Decisiones arquitectónicas críticas (1.5 min)

**Lo que se ve:** Editor abierto en los archivos clave.

**4.1 — Billing asíncrono (fire-and-forget)**

*(Abrir `app/routes/api.conversion.ts`, línea 82)*

> "El `appUsageRecordCreate` se ejecuta en fire-and-forget: el pixel recibe su respuesta sin esperar la latencia de la API de Shopify. Si falla, el error queda logueado sin afectar al cliente."

**4.2 — Idempotencia en dos capas**

*(Mostrar `prisma/schema.prisma`)*

> "La constraint `@unique` en `orderId` en la tabla Conversion es la primera línea de defensa. La segunda: el `idempotencyKey: 'conv-{orderId}'` en `appUsageRecordCreate` previene cobros dobles aunque el proceso se reintente."

**4.3 — Cache de subscriptionLineItemId**

*(Abrir `app/services/billing.service.ts`)*

> "Para crear cada UsageRecord necesito el `subscriptionLineItemId` activo del merchant. En vez de consultarle a Shopify en cada conversión, lo cacheo en la tabla `AppBilling`. Solo llamo a Shopify una vez y reutilizo el valor — esencial para no quemar el rate limit en escenarios de alto volumen."

**4.4 — Retry con backoff exponencial**

> "La función `withRetry` detecta errores 429 y extensiones THROTTLED de Shopify y reintenta con delay exponencial más jitter aleatorio. Sin esto, un burst de conversiones puede colapsar el leaky-bucket de 1000 puntos."

---

## Segmento 5 — Cierre (20 seg)

> "En resumen: affiliate tracking completo con Web Pixel, dashboard embebido en Shopify admin, y billing usage-based con idempotencia y retry resiliente. El código está en el repositorio. Gracias al equipo de Converxity, quedo disponible para cualquier pregunta."

---

## Checklist antes de grabar

- [ ] `npm run dev` corriendo
- [ ] Al menos un afiliado activo en la base de datos (ej: `JOHN2026` de pruebas previas)
- [ ] DevTools abierto en Console para el Segmento 3
- [ ] VS Code con los 3 archivos clave en pestañas listas: `api.conversion.ts`, `schema.prisma`, `billing.service.ts`

## Checklist antes de enviar

- [ ] Video subido (Loom, Drive, o YouTube unlisted)
- [ ] Link del repositorio GitHub público
- [ ] Responder el **mismo hilo de email** con ambos links
- [ ] Antes del **lunes 27 de abril a las 22:00 UTC**

---

*Converxity Technical Evaluation — Abril 2026*
