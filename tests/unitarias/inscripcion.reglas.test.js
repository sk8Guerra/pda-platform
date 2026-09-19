'use strict';

const servicio = require('../../src/modules/inscripcion/servicio');

/**
 * Reglas de edad del recorrido de inscripcion.
 * Cada disciplina define un rango de edad y la solicitud se valida contra el
 * rango antes de que la direccion pueda aceptarla.
 */

describe('calculo de edad de la aspirante', () => {
  const referencia = new Date('2026-09-19T00:00:00Z');

  test('calcula la edad exacta cuando el cumpleanios ya paso en el anio', () => {
    expect(servicio.calcularEdad('2016-03-14', referencia)).toBe(10);
  });

  test('resta un anio cuando el cumpleanios aun no ocurre', () => {
    expect(servicio.calcularEdad('2016-12-01', referencia)).toBe(9);
  });

  test('cuenta el anio cumplido el mismo dia del cumpleanios', () => {
    expect(servicio.calcularEdad('2016-09-19', referencia)).toBe(10);
  });
});

describe('validacion del rango de edad por disciplina', () => {
  const ballet = { disciplina: 'Ballet clasico', edad_minima: 4, edad_maxima: 25 };

  test('acepta una edad dentro del rango', () => {
    expect(() => servicio.validarEdad(10, ballet)).not.toThrow();
  });

  test('acepta los extremos del rango', () => {
    expect(() => servicio.validarEdad(4, ballet)).not.toThrow();
    expect(() => servicio.validarEdad(25, ballet)).not.toThrow();
  });

  test('rechaza con codigo 422 una edad por debajo del minimo', () => {
    expect(() => servicio.validarEdad(3, ballet)).toThrow(/edad minima/i);
    try {
      servicio.validarEdad(3, ballet);
    } catch (err) {
      expect(err.estado).toBe(422);
      expect(err.codigo).toBe('EDAD_FUERA_DE_RANGO');
    }
  });

  test('rechaza una edad por encima del maximo', () => {
    expect(() => servicio.validarEdad(30, ballet)).toThrow(/edad maxima/i);
  });

  test('no impone limite cuando la disciplina no define rango', () => {
    const abierta = { disciplina: 'Taller libre', edad_minima: null, edad_maxima: null };
    expect(() => servicio.validarEdad(45, abierta)).not.toThrow();
  });
});
