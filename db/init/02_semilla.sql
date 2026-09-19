-- ============================================================================
-- Perfect Dance Academy - Datos semilla para el entorno de contenedores
--
-- Datos minimos y ficticios que permiten ejercitar el recorrido completo:
-- consultar el catalogo, enviar una solicitud, aceptarla con asignacion de clase
-- y pagar la mensualidad generada. No corresponden a personas reales.
--
-- Credenciales de demostracion (solo entorno local):
--   direccion@pda.local  / Pda2026*admin      -> Administrador
--   docente@pda.local    / Pda2026*docente    -> Docente
--   encargado@pda.local  / Pda2026*encargado  -> Encargado/Alumna
-- ============================================================================

INSERT INTO rol (nombre_rol) VALUES
    ('Administrador'), ('Docente'), ('Encargado/Alumna');

INSERT INTO usuario (id_rol, nombre_completo, correo_electronico, telefono, contrasena_hash, estado) VALUES
    (1, 'Thelma Aguilar',   'direccion@pda.local', '5555-0001', '$2a$12$C3KTwDFnQgIFXksEugvrZe/umS6yqgcZkHrMc2b2t/.64zoqUkbwm', 'Activo'),
    (2, 'Maria Jose Lopez', 'docente@pda.local',   '5555-0002', '$2a$12$R7BinohdY6XGRw3uyeM8pe9/yijSgZ0o97fEd2wKZhhgCwsHEXutG', 'Activo'),
    (3, 'Ana Ruiz',         'encargado@pda.local', '5555-0003', '$2a$12$XIVX8m.OZWCCjnWjC1Z0seVqMHHDGANsV8PIxdZwcgGiEl0b59Jiy', 'Activo');

INSERT INTO disciplina (nombre, descripcion, edad_minima, edad_maxima, monto_mensualidad) VALUES
    ('Ballet clasico', 'Tecnica academica de ballet por niveles progresivos.', 4, 25, 250.00),
    ('Jazz',           'Danza jazz con enfasis en montaje coreografico.',      8, 30, 225.00),
    ('Contemporaneo',  'Danza contemporanea y trabajo de piso.',              12, 35, 240.00);

INSERT INTO nivel (id_disciplina, nombre_nivel) VALUES
    (1, 'Pre-ballet'), (1, 'Basico'), (1, 'Intermedio'), (1, 'Avanzado'),
    (2, 'Basico'), (2, 'Intermedio'),
    (3, 'Basico'), (3, 'Avanzado');

INSERT INTO clase (id_disciplina, id_nivel, id_docente, dia_semana, hora_inicio, hora_fin, cupo_maximo) VALUES
    (1, 1, 2, 'Lunes',     '15:00', '16:00', 12),
    (1, 2, 2, 'Lunes',     '16:00', '17:30', 15),
    (1, 3, 2, 'Miercoles', '16:00', '17:30', 15),
    (2, 5, 2, 'Martes',    '17:00', '18:30', 18),
    (3, 7, 2, 'Jueves',    '18:00', '19:30', 14);

INSERT INTO solicitud_inscripcion
    (nombre_aspirante, fecha_nacimiento, id_disciplina, nombre_encargado, correo_contacto, telefono_contacto, estado)
VALUES
    ('Sofia Ruiz Mendez', '2016-03-14', 1, 'Ana Ruiz', 'encargado@pda.local', '5555-0003', 'Recibida'),
    ('Valeria Perez',     '2012-09-02', 2, 'Carlos Perez', 'cperez@example.local', '5555-0004', 'Recibida');
