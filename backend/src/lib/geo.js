/* Distancia e faixas da area de entrega.
 *
 * Preservado do server.js original, incluindo o motivo de ser em linha reta:
 * "raio de entrega" mede afastamento da loja, nao trajeto percorrido. */

const RAIO_TERRA_KM = 6371;
const emRadianos = grau => (grau * Math.PI) / 180;

export function distanciaKm(aLng, aLat, bLng, bLat) {
  const dLat = emRadianos(bLat - aLat);
  const dLng = emRadianos(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(emRadianos(aLat)) * Math.cos(emRadianos(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_KM * Math.asin(Math.sqrt(h));
}

/* Primeira faixa que alcanca a distancia, com as faixas em km crescente. */
export function faixaDaDistancia(km, faixas) {
  return [...(faixas || [])]
    .sort((a, b) => a.km - b.km)
    .find(faixa => km <= Number(faixa.km)) || null;
}

/* Coordenada valida, ou null.
 *
 * Number("") e Number(null) valem 0, e 0 e finito: apagar o ponto da loja
 * gravava lat 0 / lng 0, que fica no golfo da Guine. Dali toda distancia dava
 * milhares de km e nenhum endereco do Rio caia em faixa nenhuma. */
export function coordenada(valor, limite) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || Math.abs(numero) > limite) return null;
  return numero;
}

const BRASIL = { lat: [-34, 6], lng: [-74, -34] };
export const dentroDoBrasil = (lat, lng) =>
  lat >= BRASIL.lat[0] && lat <= BRASIL.lat[1] && lng >= BRASIL.lng[0] && lng <= BRASIL.lng[1];
