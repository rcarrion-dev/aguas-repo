# Seguridad del backend

En este documento explicamos qué problemas de seguridad corregimos en el backend de Aguas! (siguiendo la lista de la Semana 09) y cuáles quedan pendientes.

## Lo que corregimos

**Inyección SQL.** Todas las consultas usan `?` en lugar de pegar los valores en el texto del SQL.

**Control de acceso.** Además del guard, revisamos que cada usuario solo vea lo suyo. Si alguien pide un reporte o una evidencia que no es suya, responde 404, igual que si no existiera. El guard también vuelve a revisar la cuenta en la base de datos en cada petición, así que si un admin suspende o borra una cuenta, su token deja de funcionar al instante.

**Contraseñas.** Se guardan con scrypt y una sal aleatoria por usuario, nunca en texto plano ni con SHA-256.

**Secretos.** Las llaves de los tokens están en el `.env`, no en el código. Usamos una llave para el access token y otra distinta para el refresh token. La app se conecta a MySQL con el usuario `aguas_app`, no con root.

**Archivos de evidencia.**
- Revisamos la extensión, el tipo y los primeros bytes del archivo. Antes se podía subir un `.html` disfrazado de imagen.
- Máximo 5 MB.
- El archivo se guarda con un nombre aleatorio (UUID).
- La carpeta `/uploads` ya no es pública: pide token y solo entrega evidencia de reportes que el usuario puede ver.

**Configuración.**
- `helmet` agrega cabeceras de seguridad.
- CORS está cerrado (ni la app ni el dashboard lo necesitan).
- Swagger solo se activa con `ENABLE_DOCS=true`.
- Quitamos los `console.log`.
- Si llega un campo que no está en el DTO, la API responde 400.

**Login.**
- Un solo mensaje de error ("Correo o contraseña incorrectos"), para no revelar qué correos existen.
- Máximo 5 intentos por minuto.

**Reglas de negocio.**
- Un admin no puede borrar a otro admin ni a sí mismo.
- Los roles no se pueden editar desde la API.
- Un usuario de la app no ve quién hizo los reportes de otros.

**Calidad de código.**
- `npm run format` y `npm run lint` pasan sin errores, sin usar `eslint-disable`.
- `npm audit` no tiene vulnerabilidades críticas ni altas.

## Riesgos que quedan

| Riesgo | Por qué importa | Qué haría falta |
|---|---|---|
| No hay logout real y el refresh token dura 7 días | Si alguien lo roba, puede usarlo hasta que caduque (a menos que suspendamos la cuenta) | Guardar los refresh tokens en una tabla y agregar `POST /auth/logout` |
| El registro dice si un correo ya existe | Se puede averiguar quién tiene cuenta | Confirmar el registro por correo |
| La red del laboratorio usa HTTP | Las contraseñas viajan sin cifrar | Poner HTTPS |
| La app guarda los tokens en `UserDefaults` | No están cifrados | Usar el Keychain |
| Quedan vulnerabilidades moderadas en `npm audit` | Están en herramientas de desarrollo y en Swagger, que va apagado | Actualizar Swagger a la versión 12 |
| Las cuentas de ejemplo usan `Prueba123!` | La contraseña está en el repo | Borrarlas o cambiarlas en la base final |

## Cómo lo probamos

Después de cada cambio corrimos las peticiones con curl. Algunas de las pruebas:

- Subir un `.html` como imagen → 400
- Abrir una evidencia sin token → 401
- Abrir la evidencia de un reporte ajeno → 404
- Usar el token de una cuenta suspendida → 403
- Sexto intento de login en un minuto → 429
- Un admin intenta borrar a otro admin → 400