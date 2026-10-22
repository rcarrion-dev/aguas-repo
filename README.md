# Aguas! · Backend

API del proyecto Aguas!, hecha con NestJS y MySQL. La usan la app de iOS y el dashboard web.

Lo relacionado con seguridad está en [SEGURIDAD.md](SEGURIDAD.md).

## Requisitos

- Node.js 22
- MySQL 8

## Cómo correrlo

1. Crear la base de datos:

```
   mysql -u root -p < database/4Fantasticos_base_datos.sql
```

2. Crear el usuario de la app en MySQL (no usar root):

```sql
   CREATE USER 'aguas_app'@'aguas_app'@'192.168.20.10'' IDENTIFIED BY 'tu_contraseña';
   GRANT SELECT, INSERT, UPDATE, DELETE ON aguas_db.* TO 'aguas_app'@'%';
```

3. Copiar `.env.example` a `.env` y llenarlo (ver la tabla de abajo).

4. Instalar, compilar y arrancar:

```
   npm ci
   npm run build
   node dist/main.js
```

## Variables del `.env`

| Variable | Para qué sirve |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión a MySQL |
| `JWT_SECRET` y `JWT_REFRESH_SECRET` | Llaves de los tokens. Tienen que ser distintas y de al menos 32 caracteres |
| `HOST` | `127.0.0.1` en local. En el laboratorio, `0.0.0.0` para que se pueda entrar por la red |
| `PORT` | Puerto de la API (3000) |
| `NODE_ENV` | `production` para no mostrar logs de depuración |
| `ENABLE_DOCS` | `true` para ver Swagger en `/docs`. Solo en desarrollo |

Las llaves se generan con:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

## Antes de subir cambios

```
npm run format
npm run lint
```