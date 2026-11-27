"""Genera las imágenes de la plantilla Postal de los correos de Tutoría UNAS (versión blanca y centrada).

Salida en backend/TutoriaUNAS.Api/Correo/Recursos (recursos incrustados del API):
  franja.png          franja de correo aéreo verde y dorada del borde superior
  escudo.png          escudo UNAS
  marca.png           «Tutoría UNAS» en Gabarito
  titulo-<tipo>.png   título de cada aviso en Gabarito, centrado
  medidas.txt         ancho y alto en pantalla de cada imagen, para el HTML

Se dibuja al doble de tamaño (pantallas de alta densidad) sobre blanco puro, el fondo del correo. Uso (requiere Pillow):

  docker run --rm -v "$PWD":/w -w /w python:3.12-slim sh -c "pip install -q pillow && python scripts/correo/generar_recursos.py"
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parents[2]
ORIGEN = Path(__file__).resolve().parent
SALIDA = RAIZ / "backend/TutoriaUNAS.Api/Correo/Recursos"
S = 2  # escala de dibujo

BLANCO = (255, 255, 255)
VERDE = (43, 125, 60)
VERDE_OSCURO = (14, 90, 50)
TINTA = (11, 46, 25)
DORADO = (233, 164, 0)

# Títulos: deben coincidir con PlantillaCorreo.Tipos en el backend.
TIPOS = {
    "verificacion": "Tu código de verificación",
    "recuperacion": "Tu código para recuperar tu contraseña",
    "acceso": "Tu acceso está listo",
    "verificada": "Tu cuenta quedó verificada",
    "habilitada": "Tu cuenta fue habilitada",
    "rehabilitada": "Tu cuenta vuelve a estar activa",
    "baja": "Tu cuenta fue deshabilitada",
    "coordinador": "Ahora coordinas tu escuela",
    "coordinador-retirado": "Terminó tu designación como coordinador",
    "pendientes": "Tienes actividades pendientes",
    "cuenta-existente": "Ya tienes una cuenta",
    "sin-cuenta": "No encontramos una cuenta activa",
    "fuera-padron": "No te encontramos en el padrón",
    "prueba": "Prueba de envío",
}


def fuente(px: float, peso: int = 800) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(ORIGEN / "fuentes/Gabarito.ttf"), round(px))
    f.set_variation_by_axes([peso])
    return f


def texto_png(texto: str, nombre: str, px: float, color, ancho_max: float, interlineado: float = 1.1):
    """Texto en Gabarito, en una o varias líneas centradas, sobre blanco."""
    f = fuente(px * S, 800)
    medir = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    lineas, actual = [], ""
    for p in texto.split():
        prueba = (actual + " " + p).strip()
        if medir.textlength(prueba, font=f) <= ancho_max * S or not actual:
            actual = prueba
        else:
            lineas.append(actual)
            actual = p
    lineas.append(actual)
    alto_linea = round(px * S * interlineado)
    asc, desc = f.getmetrics()
    ancho = math.ceil(max(medir.textlength(l, font=f) for l in lineas)) + 2 * S
    ancho += ancho % 2  # par: la mitad (tamaño en pantalla) es exacta
    alto = alto_linea * (len(lineas) - 1) + asc + desc
    alto += alto % 2
    img = Image.new("RGB", (ancho, alto), BLANCO)
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lineas):
        d.text(((ancho - medir.textlength(l, font=f)) / 2, i * alto_linea), l, font=f, fill=color)
    img.quantize(colors=48, method=Image.Quantize.MEDIANCUT).save(SALIDA / nombre, optimize=True)
    return img.size


def franja():
    img = Image.new("RGB", (580 * S, 8 * S), BLANCO)
    d = ImageDraw.Draw(img)
    for x in range(0, img.width, 60 * S):
        d.rectangle([x, 0, x + 22 * S - 1, img.height], fill=VERDE)
        d.rectangle([x + 30 * S, 0, x + 52 * S - 1, img.height], fill=DORADO)
    img.save(SALIDA / "franja.png", optimize=True)


def escudo():
    """A 2x de su tamaño en el correo (46×54), sobre blanco y con paleta reducida."""
    img = Image.open(RAIZ / "frontend/src/assets/unas-logo-mark-120.png").convert("RGBA").resize((92, 108), Image.LANCZOS)
    fondo = Image.new("RGBA", img.size, BLANCO + (255,))
    fondo.alpha_composite(img)
    fondo.convert("RGB").quantize(colors=64, method=Image.Quantize.MEDIANCUT).save(SALIDA / "escudo.png", optimize=True)


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    for viejo in SALIDA.glob("*"):
        viejo.unlink()
    franja()
    escudo()
    medidas = {"marca": texto_png("Tutoría UNAS", "marca.png", 31, VERDE_OSCURO, 400, 1.0)}
    for tipo, titulo in TIPOS.items():
        medidas[f"titulo-{tipo}"] = texto_png(titulo, f"titulo-{tipo}.png", 28, TINTA, 470)
    # Medidas en píxeles de pantalla (la mitad del archivo) para los atributos width/height del HTML.
    with open(SALIDA / "medidas.txt", "w", encoding="utf-8") as m:
        for k, (w, h) in medidas.items():
            m.write(f"{k} {w // S} {h // S}\n")
    print("Recursos generados en", SALIDA)


if __name__ == "__main__":
    main()
