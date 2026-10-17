# Simulador visual 3D · Terminal ferroviaria de carga · Tren Maya

Carpeta portátil: funciona sin internet.

## Abrir
- **Doble clic en `index.html`** (Chrome, Edge o Firefox recientes).
- Si el navegador bloquea archivos locales, ejecute `iniciar-servidor.bat` (Windows) o `iniciar-servidor.sh` (Linux/macOS); requiere Python 3 y abre `http://127.0.0.1:8765`.

## Controles
- Arrastrar con botón izquierdo: girar · botón derecho: desplazar · rueda: acercar.
- **Cámaras**: vistas predefinidas (dron, nivel de vía, llenadera, servicios…).
- **Calidad alta / media**: la media quita la oclusión ambiental y reduce sombras para laptops de oficina.
- **Captura**: guarda una imagen PNG al doble de la resolución de pantalla.
- **Presentación**: pantalla completa con botones grandes.
- Clic sobre un elemento: ficha breve.

## Estado
- Etapa 1 (patio estático): vías, cambios, balasto, terreno, selva baja, instalaciones, cielo, sombras y posproceso.
- Etapas siguientes: equipo rodante, personal, animación de fases y guion completo.

## Desarrollo
Código en `src/`. Para regenerar `app.js`:
```
npm install
node build.mjs
```
three.js 0.186.1 empaquetado con esbuild en un solo script clásico (sin módulos ni CDN).
