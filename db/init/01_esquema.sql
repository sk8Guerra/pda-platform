-- ============================================================================
-- Perfect Dance Academy - Esquema operativo de los modulos contenerizados
--
-- Este script contiene el subconjunto del modelo relacional que utilizan los
-- cuatro modulos desplegados en esta entrega: auth, catalogo, inscripcion y
-- pagos. El script maestro completo (26 tablas) vive en la entrega anterior;
-- aqui se reproduce solo lo necesario para que el entorno de contenedores
-- levante y las pruebas de integracion se ejecuten.
--
-- Motor objetivo: PostgreSQL 14+
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Modulo 1: Gestion de usuarios, roles y permisos
-- ---------------------------------------------------------------------------

CREATE TABLE rol (
    id_rol      SERIAL PRIMARY KEY,
    nombre_rol  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE usuario (
    id_usuario         SERIAL PRIMARY KEY,
    id_rol             INTEGER NOT NULL REFERENCES rol (id_rol),
    nombre_completo    VARCHAR(120) NOT NULL,
    correo_electronico VARCHAR(150) NOT NULL UNIQUE,
    telefono           VARCHAR(20),
    contrasena_hash    VARCHAR(255) NOT NULL,
    token_recuperacion VARCHAR(255),
    token_expiracion   TIMESTAMP,
    estado             VARCHAR(15) NOT NULL DEFAULT 'Activo'
                       CHECK (estado IN ('Activo', 'Inactivo', 'Suspendido')),
    fecha_registro     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_usuario_correo ON usuario (lower(correo_electronico));

CREATE TABLE bitacora_auditoria (
    id_bitacora         SERIAL PRIMARY KEY,
    id_usuario          INTEGER REFERENCES usuario (id_usuario),
    accion              VARCHAR(50) NOT NULL,
    entidad_afectada    VARCHAR(50) NOT NULL,
    id_entidad_afectada INTEGER,
    fecha_hora          TIMESTAMP NOT NULL DEFAULT now(),
    detalle             TEXT
);

-- ---------------------------------------------------------------------------
-- Modulo 2: Inscripcion y gestion de alumnas
-- ---------------------------------------------------------------------------

CREATE TABLE disciplina (
    id_disciplina     SERIAL PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    descripcion       TEXT,
    edad_minima       SMALLINT,
    edad_maxima       SMALLINT,
    monto_mensualidad DECIMAL(10,2) NOT NULL CHECK (monto_mensualidad >= 0),
    CONSTRAINT ck_disciplina_rango_edad
        CHECK (edad_minima IS NULL OR edad_maxima IS NULL OR edad_minima <= edad_maxima)
);

CREATE TABLE nivel (
    id_nivel      SERIAL PRIMARY KEY,
    id_disciplina INTEGER NOT NULL REFERENCES disciplina (id_disciplina),
    nombre_nivel  VARCHAR(50) NOT NULL,
    UNIQUE (id_disciplina, nombre_nivel)
);

CREATE TABLE alumna (
    id_alumna           SERIAL PRIMARY KEY,
    id_usuario_titular  INTEGER,
    nombre_completo     VARCHAR(120) NOT NULL,
    fecha_nacimiento    DATE NOT NULL,
    direccion           VARCHAR(200),
    contacto_emergencia VARCHAR(150),
    estado              VARCHAR(15) NOT NULL DEFAULT 'Activa'
                        CHECK (estado IN ('Activa', 'Inactiva', 'Suspendida')),
    fecha_registro      TIMESTAMP NOT NULL DEFAULT now(),
    id_usuario_registro INTEGER
);

CREATE TABLE alumna_disciplina (
    id_alumna         INTEGER NOT NULL REFERENCES alumna (id_alumna),
    id_disciplina     INTEGER NOT NULL REFERENCES disciplina (id_disciplina),
    id_nivel          INTEGER NOT NULL REFERENCES nivel (id_nivel),
    fecha_inscripcion DATE NOT NULL DEFAULT current_date,
    PRIMARY KEY (id_alumna, id_disciplina)
);

-- Solicitud de inscripcion: primer tramo del recorrido, anterior a que la
-- aspirante exista como alumna y como usuaria de la plataforma.
CREATE TABLE solicitud_inscripcion (
    id_solicitud       SERIAL PRIMARY KEY,
    nombre_aspirante   VARCHAR(120) NOT NULL,
    fecha_nacimiento   DATE NOT NULL,
    id_disciplina      INTEGER NOT NULL REFERENCES disciplina (id_disciplina),
    nombre_encargado   VARCHAR(120) NOT NULL,
    correo_contacto    VARCHAR(150),
    telefono_contacto  VARCHAR(20),
    estado             VARCHAR(15) NOT NULL DEFAULT 'Recibida'
                       CHECK (estado IN ('Recibida', 'Aceptada', 'Rechazada')),
    fecha_solicitud    TIMESTAMP NOT NULL DEFAULT now(),
    fecha_resolucion   TIMESTAMP,
    id_alumna_generada INTEGER REFERENCES alumna (id_alumna)
);

CREATE INDEX idx_solicitud_estado ON solicitud_inscripcion (estado, fecha_solicitud DESC);

-- ---------------------------------------------------------------------------
-- Modulo 3: Reserva de cupo en clases
-- ---------------------------------------------------------------------------

CREATE TABLE clase (
    id_clase      SERIAL PRIMARY KEY,
    id_disciplina INTEGER NOT NULL REFERENCES disciplina (id_disciplina),
    id_nivel      INTEGER NOT NULL REFERENCES nivel (id_nivel),
    id_docente    INTEGER REFERENCES usuario (id_usuario),
    dia_semana    VARCHAR(15) NOT NULL,
    hora_inicio   TIME NOT NULL,
    hora_fin      TIME NOT NULL,
    cupo_maximo   SMALLINT NOT NULL CHECK (cupo_maximo > 0),
    CONSTRAINT ck_clase_horario CHECK (hora_inicio < hora_fin)
);

CREATE TABLE reserva_cupo (
    id_reserva    SERIAL PRIMARY KEY,
    id_alumna     INTEGER NOT NULL REFERENCES alumna (id_alumna),
    id_clase      INTEGER NOT NULL REFERENCES clase (id_clase),
    fecha_reserva TIMESTAMP NOT NULL DEFAULT now(),
    estado        VARCHAR(15) NOT NULL DEFAULT 'Confirmada'
                  CHECK (estado IN ('Confirmada', 'En espera', 'Liberada')),
    UNIQUE (id_alumna, id_clase)
);

-- El cupo maximo responde a la limitacion fisica del local (RF-014). La regla se
-- impone en el motor y no unicamente en la aplicacion, de modo que ninguna via
-- de acceso pueda sobrepasarlo.
CREATE OR REPLACE FUNCTION fn_validar_cupo_clase()
RETURNS TRIGGER AS $$
DECLARE
    v_ocupados INTEGER;
    v_maximo   SMALLINT;
BEGIN
    IF NEW.estado <> 'Confirmada' THEN
        RETURN NEW;
    END IF;

    SELECT cupo_maximo INTO v_maximo FROM clase WHERE id_clase = NEW.id_clase;

    SELECT count(*) INTO v_ocupados
      FROM reserva_cupo
     WHERE id_clase = NEW.id_clase
       AND estado = 'Confirmada'
       AND id_reserva IS DISTINCT FROM NEW.id_reserva;

    IF v_ocupados >= v_maximo THEN
        RAISE EXCEPTION 'La clase % alcanzo su cupo maximo de % alumnas',
            NEW.id_clase, v_maximo
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_validar_cupo_clase
    BEFORE INSERT OR UPDATE ON reserva_cupo
    FOR EACH ROW EXECUTE FUNCTION fn_validar_cupo_clase();

-- ---------------------------------------------------------------------------
-- Modulo 4: Pagos y mensualidades
-- ---------------------------------------------------------------------------

CREATE TABLE pago (
    id_pago             SERIAL PRIMARY KEY,
    id_usuario          INTEGER NOT NULL REFERENCES usuario (id_usuario),
    concepto            VARCHAR(100) NOT NULL,
    monto_total         DECIMAL(10,2) NOT NULL CHECK (monto_total > 0),
    medio_pago          VARCHAR(30) NOT NULL,
    referencia_pasarela VARCHAR(100),
    estado_transaccion  VARCHAR(20) NOT NULL DEFAULT 'Pendiente'
                        CHECK (estado_transaccion IN ('Pendiente', 'Aprobado', 'Rechazado')),
    fecha_pago          TIMESTAMP NOT NULL DEFAULT now(),
    id_usuario_registro INTEGER REFERENCES usuario (id_usuario)
);

CREATE TABLE comprobante_pago (
    id_comprobante     SERIAL PRIMARY KEY,
    id_pago            INTEGER NOT NULL UNIQUE REFERENCES pago (id_pago),
    numero_correlativo VARCHAR(20) NOT NULL UNIQUE,
    fecha_emision      TIMESTAMP NOT NULL DEFAULT now(),
    url_pdf            VARCHAR(255) NOT NULL
);

CREATE TABLE mensualidad (
    id_mensualidad    SERIAL PRIMARY KEY,
    id_alumna         INTEGER NOT NULL REFERENCES alumna (id_alumna),
    id_disciplina     INTEGER NOT NULL REFERENCES disciplina (id_disciplina),
    periodo_mes       SMALLINT NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
    periodo_anio      SMALLINT NOT NULL,
    monto             DECIMAL(10,2) NOT NULL CHECK (monto >= 0),
    fecha_generacion  DATE NOT NULL DEFAULT current_date,
    fecha_limite_pago DATE NOT NULL,
    estado            VARCHAR(15) NOT NULL DEFAULT 'Pendiente'
                      CHECK (estado IN ('Pendiente', 'Pagada', 'Vencida')),
    id_pago           INTEGER REFERENCES pago (id_pago),
    UNIQUE (id_alumna, id_disciplina, periodo_mes, periodo_anio)
);

CREATE INDEX idx_mensualidad_alumna ON mensualidad (id_alumna, estado);

-- Al aceptarse una solicitud y quedar registrada la alumna, se genera de forma
-- automatica la mensualidad del periodo en curso con el monto de su disciplina.
CREATE OR REPLACE FUNCTION fn_generar_mensualidad_inicial()
RETURNS TRIGGER AS $$
DECLARE
    v_monto DECIMAL(10,2);
BEGIN
    SELECT monto_mensualidad INTO v_monto
      FROM disciplina WHERE id_disciplina = NEW.id_disciplina;

    INSERT INTO mensualidad
        (id_alumna, id_disciplina, periodo_mes, periodo_anio, monto,
         fecha_generacion, fecha_limite_pago, estado)
    VALUES
        (NEW.id_alumna, NEW.id_disciplina,
         EXTRACT(MONTH FROM current_date)::SMALLINT,
         EXTRACT(YEAR FROM current_date)::SMALLINT,
         v_monto, current_date, (date_trunc('month', current_date)
             + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
         'Pendiente')
    ON CONFLICT (id_alumna, id_disciplina, periodo_mes, periodo_anio) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_generar_mensualidad_inicial
    AFTER INSERT ON alumna_disciplina
    FOR EACH ROW EXECUTE FUNCTION fn_generar_mensualidad_inicial();

-- ---------------------------------------------------------------------------
-- Vista de apoyo para el panel operativo
-- ---------------------------------------------------------------------------

CREATE VIEW v_ocupacion_clases AS
SELECT c.id_clase,
       d.nombre AS disciplina,
       n.nombre_nivel AS nivel,
       u.nombre_completo AS docente,
       c.dia_semana,
       c.hora_inicio,
       c.cupo_maximo,
       count(r.id_reserva) FILTER (WHERE r.estado = 'Confirmada')::int AS ocupados,
       c.cupo_maximo - count(r.id_reserva) FILTER (WHERE r.estado = 'Confirmada')::int
           AS disponibles
  FROM clase c
  JOIN disciplina d ON d.id_disciplina = c.id_disciplina
  JOIN nivel n ON n.id_nivel = c.id_nivel
  LEFT JOIN usuario u ON u.id_usuario = c.id_docente
  LEFT JOIN reserva_cupo r ON r.id_clase = c.id_clase
 GROUP BY c.id_clase, d.nombre, n.nombre_nivel, u.nombre_completo;
