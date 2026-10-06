# Historial de versiones

## 2.0.0 · 2026-10-05: versión pública
- Almacén con cola por feed y escritura atómica: corrige la pérdida de productos con altas simultáneas.
- Validador de la especificación de Things To Do y exportación bloqueada si hay errores.
- Escapado HTML en el listado, validación estricta de importes y CORS cerrado.
- 12 tests unitarios y de API, y 11 comprobaciones e2e de la interfaz.

## 1.3.x · 2026-01-08 → 2026-02-10
- **2026-01-08**: paquete instalable para Windows (ejecutable + instalador).
- **2026-01-28**: versión 1.3.12 de la interfaz (opciones, precios por tipo de cliente, políticas de cancelación, ubicaciones relacionadas).
- **2026-01-29 → 2026-02-10**: primeros feeds de prueba generados para Google (varios feeds, cientos de productos).

## Antecedentes · 2025-10-27 → 2025-10-30
- Scripts de descarga de catálogo y precios de las plataformas de reserva para alimentar el feed (ver [booking-catalog-export](https://github.com/BreixoHR/booking-catalog-export)).
