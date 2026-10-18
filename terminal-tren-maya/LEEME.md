# Simulador visual 3D · Terminal ferroviaria de carga · Tren Maya

Carpeta portátil: funciona sin internet.

## Abrir
- **Doble clic en `index.html`** (Chrome, Edge o Firefox recientes).
- Si el navegador bloquea archivos locales, ejecute `iniciar-servidor.bat` (Windows) o `iniciar-servidor.sh` (Linux/macOS); requiere Python 3 y abre `http://127.0.0.1:8765`.

## Controles
- **Reproducir / Pausa** (barra espaciadora), **Anterior / Siguiente** (flechas), velocidad **×1 ×10 ×50 ×100**; la barra roja permite saltar dentro de la escena.
- **Escenas**: lista de las 19 escenas por fase; un clic salta a cualquiera.
- **Cámara**: cinemática (toma automática por escena), vista aérea, seguir el movimiento, nivel de vía y libre (arrastrar con el ratón: girar, botón derecho: desplazar, rueda: acercar). Al arrastrar se pasa a libre.
- **Etiquetas**: muestra u oculta el puesto sobre cada persona.
- **Calidad alta / media**: la media quita la oclusión ambiental y la profundidad de campo y reduce sombras para laptops de oficina.
- **Captura**: guarda una imagen PNG al doble de la resolución de pantalla.
- **Presentación**: pantalla completa con botones y textos más grandes.
- Clic sobre un elemento (locomotora, carro, cambio, señal, báscula, persona): ficha breve.

## Guion
- Fase 1 · Arribo (pasos 1–4), Fase 2 · Recepción (5–8), Fase 3 · Clasificación (9–11): según la guía «Arribo y recepción en destino» (EDI 417/418, CONSIST, OD-14, boleta de báscula).
- Fase 4 · Carga (12–14) y Fase 5 · Formación y salida (15–19): **proceso propuesto**, con documentos genéricos (orden de carga, certificado de carga, documentación de salida).
- Velocidades: máximo 10 km/h en patio y 5 km/h en báscula y llenadera; aceleración y frenado graduales con holgura entre carros.
- Los tiempos de cada escena siguen los rangos de la guía; las acciones sin tiempo en la guía usan su duración real de movimiento.

## Desarrollo
Código en `src/`. Para regenerar `app.js`:
```
npm install
node build.mjs
```
three.js 0.186.1 empaquetado con esbuild en un solo script clásico (sin módulos ni CDN).
