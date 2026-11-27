"""Genera las imágenes de la plantilla Postal de los correos de Tutoría UNAS.

Salida en backend/TutoriaUNAS.Api/Correo/Recursos (recursos incrustados del API):
  franja.png          franja de correo aéreo verde y dorada del borde superior
  escudo.png          escudo UNAS
  marca.png           «Tutoría UNAS» en Gabarito
  titulo-<tipo>.png   título de cada aviso en Gabarito
  sello-<tipo>.gif    sello dentado con el emoji Fluent animado y matasellos «UNAS · TINGO MARÍA»

Todo se dibuja al doble de tamaño (pantallas de alta densidad) y sobre el color del papel de la postal,
porque el GIF no admite transparencia parcial. Uso (requiere Pillow):

  docker run --rm -v "$PWD":/w -w /w python:3.12-slim sh -c "pip install -q pillow && python scripts/correo/generar_recursos.py"
"""
from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parents[2]
ORIGEN = Path(__file__).resolve().parent
SALIDA = RAIZ / "backend/TutoriaUNAS.Api/Correo/Recursos"
S = 2  # escala de dibujo
# Peso del sello: se dibuja a 2x y se guarda a esta escala, con estos cuadros y colores.
ESCALA_SELLO = float(os.environ.get("CORREO_SELLO_ESCALA", "1.5"))
CUADROS = int(os.environ.get("CORREO_CUADROS", "16"))
COLORES = int(os.environ.get("CORREO_COLORES", "64"))

PAPEL = (255, 254, 250)
VERDE = (43, 125, 60)
VERDE_OSCURO = (14, 90, 50)
TINTA = (11, 46, 25)
DORADO = (233, 164, 0)
MENTA = (234, 246, 236)

# tipo: (título, emoji, animación). Debe coincidir con PlantillaCorreo.Tipos en el backend.
TIPOS = {
    "verificacion": ("Tu código de verificación", "locked_with_key_3d", "flota"),
    "recuperacion": ("Tu código para recuperar tu contraseña", "key_3d", "flota"),
    "acceso": ("Tu acceso está listo", "waving_hand_3d_default", "saludo"),
    "verificada": ("Tu cuenta quedó verificada", "check_mark_button_3d", "pop"),
    "habilitada": ("Tu cuenta fue habilitada", "party_popper_3d", "pop"),
    "rehabilitada": ("Tu cuenta vuelve a estar activa", "sparkles_3d", "brillo"),
    "baja": ("Tu cuenta fue deshabilitada", "locked_3d", "sacude"),
    "coordinador": ("Ahora coordinas tu escuela", "sports_medal_3d", "pop"),
    "coordinador-retirado": ("Terminó tu designación como coordinador", "handshake_3d", "pop"),
    "pendientes": ("Tienes actividades pendientes", "bell_3d", "timbre"),
    "cuenta-existente": ("Ya tienes una cuenta", "light_bulb_3d", "brillo"),
    "sin-cuenta": ("No encontramos una cuenta activa", "magnifying_glass_tilted_left_3d", "busca"),
    "fuera-padron": ("No te encontramos en el padrón", "clipboard_3d", "flota"),
    "prueba": ("Prueba de envío", "open_mailbox_with_raised_flag_3d", "flota"),
}


def fuente(px: float, peso: int = 800) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(ORIGEN / "fuentes/Gabarito.ttf"), round(px))
    f.set_variation_by_axes([peso])
    return f


# ---------- Animaciones del emoji: fotogramas clave (t, dx, dy, grados, escala, brillo) ----------
ANIM = {
    "flota": (2.6, (0.5, 0.5), [(0, 0, 0, -4, 1, 1), (0.5, 0, -6, 4, 1, 1), (1, 0, 0, -4, 1, 1)]),
    "pop": (2.3, (0.5, 0.7), [(0, 0, 0, 0, 1, 1), (0.15, 0, 0, -9, 1.16, 1), (0.32, 0, 0, 7, 0.95, 1), (0.5, 0, 0, -3, 1.06, 1), (0.66, 0, 0, 0, 1, 1), (1, 0, 0, 0, 1, 1)]),
    "timbre": (2.2, (0.5, 0.1), [(0, 0, 0, 0, 1, 1), (0.08, 0, 0, 20, 1, 1), (0.17, 0, 0, -17, 1, 1), (0.26, 0, 0, 12, 1, 1), (0.35, 0, 0, -8, 1, 1), (0.44, 0, 0, 4, 1, 1), (0.58, 0, 0, 0, 1, 1), (1, 0, 0, 0, 1, 1)]),
    "saludo": (2.4, (0.7, 0.85), [(0, 0, 0, 0, 1, 1), (0.1, 0, 0, 16, 1, 1), (0.2, 0, 0, -10, 1, 1), (0.3, 0, 0, 14, 1, 1), (0.4, 0, 0, -6, 1, 1), (0.5, 0, 0, 8, 1, 1), (0.6, 0, 0, 0, 1, 1), (1, 0, 0, 0, 1, 1)]),
    "brillo": (1.8, (0.5, 0.5), [(0, 0, 0, 0, 1, 1), (0.5, 0, 0, 0, 1.12, 1.15), (1, 0, 0, 0, 1, 1)]),
    "busca": (2.8, (0.5, 0.5), [(0, 0, 0, 0, 1, 1), (0.25, -5, 2, -8, 1, 1), (0.5, 3, -3, 5, 1, 1), (0.75, 4, 3, -3, 1, 1), (1, 0, 0, 0, 1, 1)]),
    "sacude": (2.6, (0.5, 0.5), [(0, 0, 0, 0, 1, 1), (0.7, 0, 0, 0, 1, 1), (0.76, -4, 0, -4, 1, 1), (0.82, 4, 0, 4, 1, 1), (0.88, -3, 0, 0, 1, 1), (0.94, 2, 0, 0, 1, 1), (1, 0, 0, 0, 1, 1)]),
}


def estado(nombre: str, t: float):
    _, _, claves = ANIM[nombre]
    for a, b in zip(claves, claves[1:]):
        if a[0] <= t <= b[0]:
            u = 0 if b[0] == a[0] else (t - a[0]) / (b[0] - a[0])
            u = u * u * (3 - 2 * u)  # ease-in-out
            return tuple(a[i] + (b[i] - a[i]) * u for i in range(1, 6))
    return claves[-1][1:]


# ---------- Sello ----------
ANCHO, ALTO = 166 * S, 150 * S
SX, SY, SW, SH = ANCHO - 124 * S, 5 * S, 118 * S, 138 * S  # sello dentro del lienzo, con aire para el dentado y la sombra


def base_sello() -> Image.Image:
    """Papel, sombra, sello dentado y recuadro interior (todo lo que no se mueve, salvo el matasellos)."""
    lienzo = Image.new("RGBA", (ANCHO, ALTO), PAPEL + (255,))
    forma = Image.new("L", (ANCHO, ALTO), 0)
    d = ImageDraw.Draw(forma)
    d.rectangle([SX, SY, SX + SW - 1, SY + SH - 1], fill=255)
    paso, radio = 12 * S, 4.6 * S
    for x in range(SX, SX + SW + 1, paso):
        for y in (SY, SY + SH):
            d.ellipse([x - radio, y - radio, x + radio, y + radio], fill=0)
    for y in range(SY, SY + SH + 1, paso):
        for x in (SX, SX + SW):
            d.ellipse([x - radio, y - radio, x + radio, y + radio], fill=0)
    sombra = Image.new("RGBA", (ANCHO, ALTO), (20, 40, 25, 0))
    sombra.putalpha(forma.point(lambda v: int(v * 0.22)).filter(ImageFilter.GaussianBlur(4 * S)))
    lienzo.alpha_composite(sombra, (0, 3 * S))
    blanco = Image.new("RGBA", (ANCHO, ALTO), (255, 255, 255, 255))
    lienzo.paste(blanco, (0, 0), forma)
    d = ImageDraw.Draw(lienzo)
    m = 8 * S
    d.rectangle([SX + m, SY + m, SX + SW - m, SY + SH - m], fill=MENTA + (255,), outline=VERDE + (255,), width=round(1.5 * S))
    return lienzo


def texto_espaciado(d: ImageDraw.ImageDraw, centro_x: float, y: float, texto: str, f, color, espacio: float):
    anchos = [d.textlength(c, font=f) for c in texto]
    total = sum(anchos) + espacio * (len(texto) - 1)
    x = centro_x - total / 2
    for c, w in zip(texto, anchos):
        d.text((x, y), c, font=f, fill=color)
        x += w + espacio


def matasellos() -> Image.Image:
    """Círculo doble con «UNAS · TINGO MARÍA ·» alrededor y «TUTORÍA» al centro, con 88 % de opacidad."""
    capa = Image.new("RGBA", (ANCHO, ALTO), (0, 0, 0, 0))
    esc = 100 / 120 * S
    cx, cy = 45 * S, 50 * S + 60 * esc
    d = ImageDraw.Draw(capa)
    color = VERDE_OSCURO + (224,)
    for r, w in ((46, 2), (30, 1.2)):
        rr = r * esc
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=color, width=max(1, round(w * esc)))
    f = fuente(9.6 * esc, 800)
    texto = "UNAS · TINGO MARÍA ·"
    radio = 35 * esc  # renglón entre los dos círculos (30 y 46)
    anchos = [f.getlength(c) for c in texto]
    largo = 0.965 * 2 * math.pi * radio
    extra = (largo - sum(anchos)) / len(texto)
    s = 0.0
    for c, w in zip(texto, anchos):
        mitad = s + w / 2
        s += w + extra
        theta = math.pi + mitad / radio  # desde la izquierda, en sentido horario por arriba
        if c == " ":
            continue
        g = Image.new("RGBA", (int(w + 8 * S), int(f.size * 1.6)), (0, 0, 0, 0))
        ImageDraw.Draw(g).text((g.width / 2, g.height / 2), c, font=f, fill=color, anchor="mm")
        g = g.rotate(-math.degrees(theta + math.pi / 2), resample=Image.BICUBIC, expand=True)
        # el renglón queda sobre el radio: la base de las letras mira al centro
        px = cx + (radio + f.size * 0.34) * math.cos(theta)
        py = cy + (radio + f.size * 0.34) * math.sin(theta)
        capa.alpha_composite(g, (int(px - g.width / 2), int(py - g.height / 2)))
    fc = fuente(8.4 * esc, 800)
    texto_espaciado(d, cx, cy - fc.size * 0.62, "TUTORÍA", fc, color, 0.3 * S)
    return capa


def emoji_en(lienzo: Image.Image, emoji: Image.Image, anim: str, t: float):
    dx, dy, grados, escala, brillo = estado(anim, t)
    _, (ox, oy), _ = ANIM[anim]
    tam = 60 * S
    img = emoji.resize((max(1, round(tam * escala)),) * 2, Image.LANCZOS)
    if brillo != 1:
        img = ImageEnhance.Brightness(img).enhance(brillo)
    margen = tam
    pad = Image.new("RGBA", (img.width + 2 * margen, img.height + 2 * margen), (0, 0, 0, 0))
    pad.alpha_composite(img, (margen, margen))
    centro = (margen + ox * img.width, margen + oy * img.height)
    pad = pad.rotate(-grados, resample=Image.BICUBIC, center=centro)
    # posición de reposo: centrado en el recuadro, con «UNAS» debajo
    ix0, iy0 = SX + 8 * S, SY + 8 * S
    iw, ih = SW - 16 * S, SH - 16 * S
    bloque = tam + 7 * S + 12 * S
    x_reposo = ix0 + (iw - tam) / 2
    y_reposo = iy0 + (ih - bloque) / 2
    # el origen de la transformación queda fijo, como transform-origin en CSS
    x = x_reposo + ox * tam * (1 - escala) + dx * S - margen
    y = y_reposo + oy * tam * (1 - escala) + dy * S - margen
    lienzo.alpha_composite(pad, (round(x), round(y)))


def sello(tipo: str, archivo_emoji: str, anim: str):
    emoji = Image.open(ORIGEN / f"emoji/{archivo_emoji}.png").convert("RGBA")
    base = base_sello()
    d = ImageDraw.Draw(base)
    f = fuente(10 * S, 800)
    ix0, iy0, iw, ih = SX + 8 * S, SY + 8 * S, SW - 16 * S, SH - 16 * S
    bloque = 60 * S + 7 * S + 12 * S
    texto_espaciado(d, ix0 + iw / 2, iy0 + (ih - bloque) / 2 + 60 * S + 7 * S, "UNAS", f, VERDE_OSCURO, 1.6 * S)
    marca = matasellos()
    duracion, _, _ = ANIM[anim]
    n = CUADROS
    final = (round(166 * ESCALA_SELLO), round(150 * ESCALA_SELLO))
    cuadros = []
    for i in range(n):
        c = base.copy()
        emoji_en(c, emoji, anim, i / n)
        c.alpha_composite(marca)
        cuadros.append(c.convert("RGB").resize(final, Image.LANCZOS))
    # Paleta única para todos los cuadros (sin tramado: así el fondo quieto no parpadea).
    muestra = Image.new("RGB", (final[0], final[1] * 4))
    for k, idx in enumerate((0, n // 4, n // 2, 3 * n // 4)):
        muestra.paste(cuadros[idx], (0, final[1] * k))
    paleta = muestra.quantize(colors=COLORES, method=Image.Quantize.MEDIANCUT)
    gif = [c.quantize(palette=paleta, dither=Image.Dither.NONE) for c in cuadros]
    gif[0].save(SALIDA / f"sello-{tipo}.gif", save_all=True, append_images=gif[1:], loop=0,
                duration=round(duracion * 1000 / n), disposal=1, optimize=True)
    if os.environ.get("CORREO_VISTAS"):  # cuadros sueltos para revisar el dibujo; no se incrustan en el API
        vistas = Path(os.environ["CORREO_VISTAS"])
        vistas.mkdir(parents=True, exist_ok=True)
        cuadros[0].save(vistas / f"sello-{tipo}-0.png")
        cuadros[n // 6].save(vistas / f"sello-{tipo}-1.png")


# ---------- Títulos, marca y franja ----------
def texto_png(texto: str, nombre: str, px: float, color, ancho_max: float, interlineado: float = 1.08):
    f = fuente(px * S, 800)
    medir = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    palabras, lineas, actual = texto.split(), [], ""
    for p in palabras:
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
    alto = alto_linea * (len(lineas) - 1) + asc + desc
    img = Image.new("RGB", (ancho, alto), PAPEL)
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lineas):
        d.text((0, i * alto_linea), l, font=f, fill=color)
    img.quantize(colors=48, method=Image.Quantize.MEDIANCUT).save(SALIDA / nombre, optimize=True)
    return img.size


def franja():
    img = Image.new("RGB", (580 * S, 8 * S), PAPEL)
    d = ImageDraw.Draw(img)
    for x in range(0, img.width, 60 * S):
        d.rectangle([x, 0, x + 22 * S - 1, img.height], fill=VERDE)
        d.rectangle([x + 30 * S, 0, x + 52 * S - 1, img.height], fill=DORADO)
    img.save(SALIDA / "franja.png", optimize=True)


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    for viejo in SALIDA.glob("*"):
        viejo.unlink()
    franja()
    # Escudo a 2x de su tamaño en el correo (46×54) y con paleta reducida: de 36 KB a unos pocos KB.
    escudo = Image.open(RAIZ / "frontend/src/assets/unas-logo-mark-120.png").convert("RGBA").resize((92, 108), Image.LANCZOS)
    fondo = Image.new("RGBA", escudo.size, PAPEL + (255,))
    fondo.alpha_composite(escudo)
    fondo.convert("RGB").quantize(colors=64, method=Image.Quantize.MEDIANCUT).save(SALIDA / "escudo.png", optimize=True)
    medidas = {"marca": texto_png("Tutoría UNAS", "marca.png", 31, VERDE_OSCURO, 400, 1.0)}
    for tipo, (titulo, archivo, anim) in TIPOS.items():
        medidas[f"titulo-{tipo}"] = texto_png(titulo, f"titulo-{tipo}.png", 28, TINTA, 346)
        sello(tipo, archivo, anim)
    # Medidas en píxeles de pantalla (la mitad del archivo) para los atributos width/height del HTML.
    with open(SALIDA / "medidas.txt", "w", encoding="utf-8") as m:
        for k, (w, h) in medidas.items():
            m.write(f"{k} {w // S} {h // S}\n")
    print("Recursos generados en", SALIDA)


if __name__ == "__main__":
    main()
