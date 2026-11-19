import type { Sesion } from '../types/domain';
import { apiJson } from './apiClient';

const maximo = 8 * 1024 * 1024;

export interface EvidenciaAsistencia {
  nombre: string;
  tipo: 'application/pdf' | 'image/jpeg';
  contenido: string;
}

async function comprimirFoto(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo).catch(() => {
    throw new Error('No se pudo abrir la foto. Prueba con una imagen JPG o PNG.');
  });
  try {
    const lienzo = document.createElement('canvas');
    const escala = Math.min(1, 1600 / Math.max(imagen.width, imagen.height));
    lienzo.width = Math.max(1, Math.round(imagen.width * escala));
    lienzo.height = Math.max(1, Math.round(imagen.height * escala));
    const contexto = lienzo.getContext('2d');
    if (!contexto) throw new Error('No se pudo comprimir la foto.');
    contexto.fillStyle = '#fff';
    contexto.fillRect(0, 0, lienzo.width, lienzo.height);
    contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    return await new Promise<Blob>((resolve, reject) =>
      lienzo.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la foto.'))),
        'image/jpeg',
        0.78,
      ),
    );
  } finally {
    imagen.close();
  }
}

export async function prepararEvidencia(archivo: File, sesion: Sesion['tipo']) {
  const pdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
  if (!pdf && (sesion === 'individual' || !archivo.type.startsWith('image/')))
    throw new Error(sesion === 'individual' ? 'Adjunta un PDF.' : 'Adjunta una foto o un PDF.');
  if (!pdf && archivo.size > 25 * 1024 * 1024) throw new Error('La foto supera los 25 MB.');
  const blob = pdf ? archivo : await comprimirFoto(archivo);
  if (!blob.size || blob.size > maximo) throw new Error('La evidencia debe pesar hasta 8 MB.');
  const contenido = await new Promise<string>((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer la evidencia.'));
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '');
    lector.readAsDataURL(blob);
  });
  const resultado: EvidenciaAsistencia = {
    nombre: archivo.name,
    tipo: pdf ? 'application/pdf' : 'image/jpeg',
    contenido,
  };
  return resultado;
}

export async function descargarEvidencia(sesionId: string) {
  const evidencia = await apiJson<EvidenciaAsistencia>(
    `/api/sesiones/${encodeURIComponent(sesionId)}/evidencia`,
  );
  const bytes = Uint8Array.from(atob(evidencia.contenido), (caracter) => caracter.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: evidencia.tipo }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = evidencia.nombre;
  enlace.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
