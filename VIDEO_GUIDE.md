# Guía para el Video Explicativo — Affiliate Engine

> Duración estimada: **8–12 minutos**
> Herramienta recomendada: Loom, OBS, o cualquier grabador de pantalla
> Tener abierto: el repositorio en VS Code + la app corriendo en el browser

---

## Estructura del video

| Segmento | Contenido | Tiempo aprox. |
|---|---|---|
| 1 | Introducción personal y contexto | 1 min |
| 2 | Arquitectura del sistema | 1.5 min |
| 3 | Demo del dashboard admin | 2 min |
| 4 | Demo del flujo de tracking | 2 min |
| 5 | Recorrido por el código clave | 3 min |
| 6 | Cierre | 30 seg |

---

## Segmento 1 — Introducción (1 min)

**Lo que se ve en pantalla:** Tu rostro o pantalla de bienvenida.

**Qué decir:**

> "Hola, soy Leonardo. En este video voy a presentar el MVP de la aplicación de afiliados para Shopify que desarrollé como parte de la prueba técnica de Converxity.
>
> La aplicación permite a los comerciantes de Shopify crear un programa de afiliados completo: generar códigos únicos de referido, distribuir links rastreables, y registrar automáticamente los clics y las ventas atribuidas a cada afiliado — todo gestionado desde un panel embebido en el admin de Shopify."

---

## Segmento 2 — Arquitectura (1.5 min)

**Lo que se ve en pantalla:** El diagrama del README o un esquema visual.

**Qué decir:**

> "La solución tiene tres capas principales.
>
> Primero, la **extensión Web Pixel** — se ejecuta directamente en el storefront del cliente. Su trabajo es detectar cuando alguien llega con un `?ref=CODIGO` en la URL, guardar ese código en una cookie de 30 días y registrar el clic. Luego, cuando ese mismo cliente completa una compra, el pixel escucha el evento `checkout_completed` y envía los datos al backend.
>
> Segundo, el **backend de la app** — dos endpoints API con CORS habilitado: `/api/click` que registra los clics con protección anti-spam, y `/api/conversion` que calcula las comisiones automáticamente con idempotencia por orderId.
>
> Tercero, la **base de datos con Prisma** — cuatro modelos: Affiliate, Click, Conversion y ReferralSession. La conversión guarda el 5% de fee de la app y la comisión del afiliado según su tasa configurada."

---

## Segmento 3 — Demo del Dashboard Admin (2 min)

**Lo que se ve en pantalla:** La app corriendo en el browser.

**3.1 — Panel principal**
> "Aquí el dashboard. En la parte superior tenemos el resumen: afiliados, clics totales, conversiones, revenue y comisiones acumuladas."

**3.2 — Crear un afiliado**
> "Para crear uno lleno este formulario. El código se normaliza a mayúsculas automáticamente."

*(Ingresar: `DEMO2026`, nombre `Demo Influencer`, tasa `12` → Create Affiliate)*

> "El toast confirma la creación y el afiliado aparece en la tabla con sus contadores en cero."

**3.3 — Tabla de afiliados**
> "La tabla muestra por afiliado: el código con el link `?ref=` listo para compartir, tasa de comisión, clics, conversiones, revenue generado y comisión pendiente."

**3.4 — Toggle activo/inactivo**
> "Puedo pausar a cualquier afiliado. En ese estado el endpoint devuelve 404 y no registra clics."

*(Click en "Active" → "Inactive" → click de nuevo → "Active")*

**3.5 — Delete**
> "El delete hace cascade: elimina clics y conversiones relacionadas antes de borrar el afiliado. Pide confirmación."

---

## Segmento 4 — Demo del Flujo de Tracking (2 min)

**Lo que se ve en pantalla:** DevTools → pestaña Network abierta.

**4.1 — Simular un clic de afiliado**

> "Simulo lo que haría el pixel cuando alguien visita con `?ref=JOHN2026`."

*(Pegar en consola):*
```js
fetch('/api/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'JOHN2026', shop: 'demo.myshopify.com' })
}).then(r => r.json()).then(console.log)
```

> "Respuesta `ok: true`. Si lo ejecuto de nuevo antes de 10 segundos, devuelve `skipped: true` — el anti-spam está activo."

**4.2 — Simular una conversión**

*(Pegar en consola):*
```js
fetch('/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ref: 'JOHN2026',
    shop: 'demo.myshopify.com',
    orderId: 'gid://shopify/Order/99999',
    totalPrice: '200.00',
    currency: 'USD'
  })
}).then(r => r.json()).then(console.log)
```

> "El sistema calculó: 5% de fee para la app — $10 — y 15% de comisión para JOHN2026 — $30. Si intento registrar la misma orden de nuevo, devuelve `skipped: true`."

**4.3 — Ver el impacto en el dashboard**

> "Recargo el dashboard. JOHN2026 ahora muestra 1 conversión, $200 de revenue y $30 de comisión."

---

## Segmento 5 — Recorrido por el Código (3 min)

**5.1 — Schema Prisma**

*(Abrir `prisma/schema.prisma`)*

> "El modelo Conversion guarda el orderId como unique para garantizar idempotencia, y tiene dos campos separados para el fee de la app y la comisión del afiliado."

**5.2 — Endpoint de conversión**

*(Abrir `app/routes/api.conversion.ts`)*

> "Normaliza el código a uppercase, verifica que la orden no fue procesada antes, calcula las comisiones con `toFixed(2)` para evitar errores de punto flotante, y persiste todo incluyendo el `refCode` para trazabilidad. Los headers CORS permiten que el pixel llame desde el storefront."

**5.3 — Web Pixel Extension**

*(Abrir `extensions/affiliate-pixel-v2/src/index.ts`)*

> "En `page_viewed` detecta el `?ref=` en la URL, guarda en cookie con 30 días y sessionStorage, y registra el clic una sola vez por sesión. En `checkout_completed` lee el ref guardado y construye el payload con los datos del evento de Shopify: orderId, totalPrice y currency."

**5.4 — Dashboard**

*(Abrir `app/routes/app._index.tsx`, mostrar el loader)*

> "El loader usa `include` de Prisma para traer los clicks y conversions de cada afiliado en una sola query, y calcula los totales en memoria. La acción maneja tres intents: crear, eliminar con cascade, y toggle de estado."

---

## Segmento 6 — Cierre (30 seg)

**Lo que se ve en pantalla:** El dashboard con datos reales.

> "En resumen, construí un sistema de afiliados funcional end-to-end: captura del clic en el storefront, atribución al checkout, y visualización en el admin de Shopify. El código está en el repositorio. Gracias al equipo de Converxity por la oportunidad, quedo atento a cualquier pregunta."

---

## Tips de grabación

- Grabar en 1080p
- Hablar pausado — la pantalla tiene que verse bien
- Tener `npm run dev` corriendo antes de grabar
- Abrir DevTools → Network antes del segmento 4
- Si algo falla, decirlo con naturalidad y continuar — es más profesional que cortar

---

## Checklist antes de enviar

- [ ] Video subido (Loom, Drive, o YouTube unlisted)
- [ ] Link del repositorio (GitHub/GitLab público o compartido)
- [ ] Responder el **mismo hilo de email** con ambos links
- [ ] Entregar antes del **lunes 27 de abril a las 22:00 UTC**

---

*Documento de preparación — Converxity Technical Evaluation — Abril 2026*
