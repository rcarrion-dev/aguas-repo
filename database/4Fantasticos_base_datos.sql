-- =====================================================================
-- ESQUEMA DE BASE DE DATOS (MySQL 8+) - Proyecto "Aguas!" (4Fantasticos)
-- Basado en el ERD dibujado por el equipo (Rol, Usuario, Notificacion,
-- Tipo_fraude, Reporte, Bitacora, Evidencia, Revision_reporte)
-- =====================================================================
SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS aguas_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE aguas_db;

-- ---------------------------------------------------------------------
-- ROL
-- ---------------------------------------------------------------------
CREATE TABLE rol (
    id_rol       INT AUTO_INCREMENT PRIMARY KEY,
    nombre_rol   VARCHAR(50) NOT NULL UNIQUE,   -- usuario, SSC, administrador
    descripcion  VARCHAR(255)
) ENGINE=InnoDB;

INSERT INTO rol (nombre_rol, descripcion) VALUES
    ('usuario',        'Puede crear, consultar y dar seguimiento a sus reportes'),
    ('SSC',            'Consulta reportes, estadísticas y usuarios sin modificarlos'),
    ('administrador',  'Aprueba o rechaza reportes, gestiona cuentas y roles, y consulta la bitácora');

-- ---------------------------------------------------------------------
-- USUARIO  (Rol 1 --- N Usuario)
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
    id_usuario      INT AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    apellido        VARCHAR(100) NOT NULL,
    correo          VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,   -- hash bcrypt (campo "contraseña" en el diagrama)
    telefono        VARCHAR(20),
    id_rol          INT NOT NULL,
    fecha_registro  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- FALSE = cuenta suspendida por un administrador: no puede iniciar sesión
    -- ni crear reportes. Para una BD que ya existe:
    --   ALTER TABLE usuario ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE;
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (id_rol) REFERENCES rol(id_rol)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PASSWORD_RESET
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset (
    id_password_reset       INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario              INT NOT NULL UNIQUE,
    codigo_hash             VARCHAR(255) NOT NULL,
    codigo_expira           DATETIME NOT NULL,
    intentos                INT NOT NULL DEFAULT 0,
    codigo_verificado       BOOLEAN NOT NULL DEFAULT FALSE,
    reset_token_hash        CHAR(64) UNIQUE,
    reset_token_expira      DATETIME,
    utilizado               BOOLEAN NOT NULL DEFAULT FALSE,
    ultimo_envio            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- NOTIFICACION  (Usuario 1 --- N Notificacion / Reporte 1 --- N Notificacion)
-- ---------------------------------------------------------------------
CREATE TABLE notificacion (
    id_notificacion     INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario          INT NOT NULL,
    id_reporte          INT NOT NULL,
    tipo                VARCHAR(50) NOT NULL,
    titulo              VARCHAR(255) NOT NULL,
    mensaje             TEXT NOT NULL,
    motivo              TEXT,
    fecha_notificacion  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    leida               BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- REPORTE  (Usuario 1 --- N Reporte)
-- El proyecto ya solo maneja phishing/spoofing: no existe más el concepto
-- de "tipo de fraude" como catálogo (por eso ya no hay tabla tipo_fraude
-- ni columna id_tipo_fraude aquí).
-- ---------------------------------------------------------------------
CREATE TABLE reporte (
    id_reporte          INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario          INT NOT NULL,   -- quién reporta
    -- Obligatoria: el usuario debe describir el intento de fraude
    descripcion         TEXT NOT NULL,
    telefono_estafador  VARCHAR(20),    -- paso 1
    enlace_sospechoso   VARCHAR(255),   -- paso 1
    fecha_reporte       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    empresa_suplantada  VARCHAR(150),
    estado              VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'verificado', 'rechazado')),
    evidencia_principal VARCHAR(255),   -- ruta/URL de la evidencia de portada, mostrada en el buscador sin JOIN a Evidencia
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
) ENGINE=InnoDB;

ALTER TABLE notificacion
    ADD CONSTRAINT notificacion_ibfk_2
    FOREIGN KEY (id_reporte)
    REFERENCES reporte(id_reporte)
    ON DELETE CASCADE;

-- ---------------------------------------------------------------------
-- BITACORA  (Reporte 1 --- N Bitacora)
-- id_usuario: agregado sobre el diagrama original para cumplir NF04
-- ("las modificaciones deberán quedar registradas con fecha, usuario
-- y acción realizada"). Nulleable por si alguna acción es del sistema.
-- ---------------------------------------------------------------------
CREATE TABLE bitacora (
    id_bitacora  INT AUTO_INCREMENT PRIMARY KEY,
    id_reporte   INT NOT NULL,
    id_usuario   INT NULL,           -- quién ejecutó la acción (administrador)
    fecha_hora   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accion       VARCHAR(100) NOT NULL,
    descripcion  TEXT,
    FOREIGN KEY (id_reporte) REFERENCES reporte(id_reporte) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- EVIDENCIA  (Reporte 1 --- N Evidencia)
-- ---------------------------------------------------------------------
CREATE TABLE evidencia (
    id_evidencia    INT AUTO_INCREMENT PRIMARY KEY,
    id_reporte      INT NOT NULL,
    tipo_evidencia  VARCHAR(50),      -- imagen, pdf
    archivo         VARCHAR(255) NOT NULL,   -- ruta o URL del archivo
    formato         VARCHAR(20),
    descripcion     VARCHAR(255),
    FOREIGN KEY (id_reporte) REFERENCES reporte(id_reporte) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- REVISION_REPORTE  (Bitacora 1 --- N Revision_reporte)
-- ---------------------------------------------------------------------
CREATE TABLE revision_reporte (
    id_revision     INT AUTO_INCREMENT PRIMARY KEY,
    id_bitacora     INT NOT NULL,
    fecha_revision  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resultado       VARCHAR(20),   -- verificado, rechazado
    comentario      TEXT,
    FOREIGN KEY (id_bitacora) REFERENCES bitacora(id_bitacora) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ÍNDICES para búsqueda pública (RF04) y filtros del panel
-- ---------------------------------------------------------------------
CREATE INDEX idx_reporte_estado    ON reporte(estado);
CREATE INDEX idx_reporte_empresa   ON reporte(empresa_suplantada);
CREATE INDEX idx_bitacora_reporte  ON bitacora(id_reporte);

-- ---------------------------------------------------------------------
-- DATOS DE EJEMPLO (para validar el funcionamiento de la base)
-- Todas las cuentas de ejemplo usan la contraseña "Prueba123!" (hash scrypt,
-- el mismo formato que genera el backend en src/auth/password.ts).
-- Roles: María, Jorge y Ana = usuario; Laura = SSC; Carlos y Sofía = administrador.
-- ---------------------------------------------------------------------
INSERT INTO usuario (nombre, apellido, correo, password_hash, telefono, id_rol) VALUES
    ('María',   'López',     'maria.lopez@gmail.com',   'scrypt$9QRqDdJSyVupxY99z1BUig==$dVmlW28sXuYcUZuvRBWj2lLVynIlTZVGFij75cxFZs3uNd+/BSCFwLgOJAAQDvaGzFV2MudBgipkxH1EKun9WA==', '5512345678', 1),
    ('Jorge',   'Hernández', 'jorge.hdz@outlook.com',   'scrypt$9QRqDdJSyVupxY99z1BUig==$dVmlW28sXuYcUZuvRBWj2lLVynIlTZVGFij75cxFZs3uNd+/BSCFwLgOJAAQDvaGzFV2MudBgipkxH1EKun9WA==', '5523456789', 1),
    ('Ana',     'Torres',    'ana.torres@yahoo.com',    'scrypt$9QRqDdJSyVupxY99z1BUig==$dVmlW28sXuYcUZuvRBWj2lLVynIlTZVGFij75cxFZs3uNd+/BSCFwLgOJAAQDvaGzFV2MudBgipkxH1EKun9WA==', NULL,         1),
    ('Laura',   'Ramírez',   'laura.ramirez@ssc.cdmx.gob.mx',   'scrypt$9QRqDdJSyVupxY99z1BUig==$dVmlW28sXuYcUZuvRBWj2lLVynIlTZVGFij75cxFZs3uNd+/BSCFwLgOJAAQDvaGzFV2MudBgipkxH1EKun9WA==', NULL, 2),
    ('Carlos',  'Mendoza',   'carlos.mendoza@redciberseguridad.mx', 'scrypt$9QRqDdJSyVupxY99z1BUig==$dVmlW28sXuYcUZuvRBWj2lLVynIlTZVGFij75cxFZs3uNd+/BSCFwLgOJAAQDvaGzFV2MudBgipkxH1EKun9WA==', NULL, 3),
    ('Sofía',   'Castro',    'sofia.castro@redciberseguridad.mx',   'scrypt$9QRqDdJSyVupxY99z1BUig==$dVmlW28sXuYcUZuvRBWj2lLVynIlTZVGFij75cxFZs3uNd+/BSCFwLgOJAAQDvaGzFV2MudBgipkxH1EKun9WA==', NULL, 3);

INSERT INTO reporte (id_usuario, descripcion, telefono_estafador, enlace_sospechoso, empresa_suplantada, estado, evidencia_principal) VALUES
    (1, 'Recibí un SMS que decía que mi paquete estaba retenido en aduana y que debía pagar $89 en un enlace.', '5587654321', 'https://dhl-aduana-pago.com', 'DHL', 'verificado', 'uploads/evidencias/rep1_sms.jpg'),
    (2, 'Mensaje de WhatsApp de un supuesto ejecutivo del banco pidiendo mi NIP para cancelar un cargo.', '5598765432', NULL, 'BBVA', 'verificado', 'uploads/evidencias/rep2_chat.png'),
    (3, 'Correo que imita a Mercado Libre diciendo que mi cuenta fue suspendida y pide iniciar sesión en un enlace.', NULL, 'https://mercadolibre-verificacion.net', 'Mercado Libre', 'pendiente', 'uploads/evidencias/rep3_correo.png'),
    (1, 'Otro SMS del mismo número, ahora diciendo que mi paquete será devuelto si no pago hoy.', '5587654321', 'https://dhl-aduana-pago.com', 'DHL', 'pendiente', NULL),
    (2, 'Me llegó un mensaje de promoción de Amazon, pero el enlace llevaba a la página oficial.', NULL, 'https://www.amazon.com.mx', 'Amazon', 'rechazado', 'uploads/evidencias/rep5_promo.png');

INSERT INTO evidencia (id_reporte, tipo_evidencia, archivo, formato, descripcion) VALUES
    (1, 'imagen', 'uploads/evidencias/rep1_sms.jpg',    'jpg', 'Captura del SMS recibido'),
    (1, 'imagen', 'uploads/evidencias/rep1_pagina.png', 'png', 'Captura de la página de pago falsa'),
    (2, 'imagen', 'uploads/evidencias/rep2_chat.png',   'png', 'Captura de la conversación de WhatsApp'),
    (3, 'imagen', 'uploads/evidencias/rep3_correo.png', 'png', 'Captura del correo recibido'),
    (5, 'imagen', 'uploads/evidencias/rep5_promo.png',  'png', 'Captura del mensaje de promoción');

INSERT INTO bitacora (id_reporte, id_usuario, accion, descripcion) VALUES
    (1, 5, 'reporte_verificado', 'Evidencia clara del SMS y de la página de pago falsa.'),
    (2, 6, 'reporte_verificado', 'La conversación muestra la solicitud del NIP.'),
    (5, 5, 'reporte_rechazado', 'El enlace corresponde al sitio oficial de Amazon.');

INSERT INTO revision_reporte (id_bitacora, resultado, comentario) VALUES
    (1, 'verificado', 'Evidencia clara del SMS y de la página de pago falsa.'),
    (2, 'verificado', 'La conversación muestra la solicitud del NIP.'),
    (3, 'rechazado',  'El enlace corresponde al sitio oficial de Amazon, no es un fraude.');

-- Mismo formato que genera el backend al moderar (reportes.service.ts).
INSERT INTO notificacion (id_usuario, id_reporte, tipo, titulo, mensaje, motivo, leida) VALUES
    (1, 1, 'verificado', 'Tu reporte fue verificado', 'El estado de tu reporte cambió.', NULL, TRUE),
    (2, 2, 'verificado', 'Tu reporte fue verificado', 'El estado de tu reporte cambió.', NULL, FALSE),
    (2, 5, 'rechazado',  'Tu reporte fue rechazado',  'El estado de tu reporte cambió.', 'El enlace corresponde al sitio oficial de Amazon, no es un fraude.', FALSE);