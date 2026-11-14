# Credifi

Billetera virtual de fiado para comercios de barrio en Argentina. La experiencia incluye una vista de cliente y otra de almacenero, con montos en pesos argentinos.

## Ejecutar

```powershell
npm install
npm run dev
```

Abrí http://localhost:3000. Registrate o iniciá sesión con tu cuenta:

- `/customer`: saldo disponible, escaneo QR, pagos y movimientos.
- `/merchant`: cobros QR, clientes vinculados, límites y pagos informados.

Las operaciones usan la sesión autenticada y la base de datos de Supabase; no hay modo de datos de demostración. La cámara requiere permiso y HTTPS o `localhost`.

Los importes se ingresan en pesos enteros y se formatean con separador argentino de miles: por ejemplo, `30.000` se interpreta como treinta mil pesos.

## Supabase

El esquema [`supabase/schema.sql`](./supabase/schema.sql) crea `profiles`, `credit_lines`, `qr_intents` y `transactions`, aplica RLS, habilita Supabase Realtime y define RPC para generar/aprobar QR, ajustar límites, vincular clientes por email, guardar el perfil de pago y revisar avisos. Los comprobantes se guardan en el bucket privado `payment-receipts`; solo las partes de la transacción pueden consultarlos. El comercio puede confirmar o rechazar el aviso durante las 24 horas siguientes. Si ya ejecutaste una versión anterior, volvé a ejecutar el archivo actualizado en el SQL Editor para instalar las columnas, políticas, bucket y RPC nuevos.

Configurá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local` y reiniciá Next.js. Los usuarios pueden registrarse como cliente o almacenero; si está habilitada la confirmación de email en Supabase Auth, deben confirmar el correo antes de iniciar sesión. Para vincular una cuenta, el almacenero usa el email del cliente ya registrado y confirmado. Las líneas de crédito existentes se conservan al repetir la vinculación.

No uses una clave `service_role` en el navegador. El esquema restringe las operaciones de saldo a funciones transaccionales y limita la lectura a las partes vinculadas.

## Instalar Credifi

La aplicación incluye manifest, íconos y un service worker que ofrece una pantalla segura sin conexión; los saldos y operaciones nunca se guardan en caché. En Android, abrí el sitio publicado con HTTPS en Chrome y elegí **Instalar aplicación** en el menú del navegador. En iPhone o iPad, abrilo con Safari, tocá **Compartir** y luego **Agregar a pantalla de inicio**. En desarrollo, `localhost` también permite probar la PWA.
