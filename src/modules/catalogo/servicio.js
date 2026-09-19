'use strict';

const repositorio = require('./repositorio');
const cache = require('../../core/cache');
const { noEncontrado } = require('../../core/errores');

/**
 * El catalogo se modifica pocas veces al ano y se consulta en practicamente cada
 * visita, por lo que sus lecturas se resuelven desde Redis con un tiempo de vida
 * corto. Si Redis no esta disponible, la consulta cae a PostgreSQL sin error.
 */

const LLAVE_DISCIPLINAS = 'catalogo:disciplinas';

const listarDisciplinas = async () => {
  const enCache = await cache.obtener(LLAVE_DISCIPLINAS);
  if (enCache) return { origen: 'cache', disciplinas: enCache };

  const disciplinas = await repositorio.listarDisciplinas();
  await cache.guardar(LLAVE_DISCIPLINAS, disciplinas);
  return { origen: 'base_de_datos', disciplinas };
};

const listarNiveles = async (idDisciplina) => {
  const disciplina = await repositorio.buscarDisciplina(idDisciplina);
  if (!disciplina) throw noEncontrado('Disciplina');
  return { disciplina, niveles: await repositorio.listarNiveles(idDisciplina) };
};

const listarClases = async (filtros) => {
  const llave = `catalogo:clases:${filtros.idDisciplina || 'todas'}:${filtros.idNivel || 'todos'}`;
  const enCache = await cache.obtener(llave);
  if (enCache) return { origen: 'cache', clases: enCache };

  const clases = await repositorio.listarClases(filtros);
  await cache.guardar(llave, clases, 30);
  return { origen: 'base_de_datos', clases };
};

const invalidarCache = () => cache.invalidar('catalogo:*');

module.exports = { listarDisciplinas, listarNiveles, listarClases, invalidarCache };
