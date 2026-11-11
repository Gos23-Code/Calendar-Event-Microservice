# Panel Vet · Agenda con detalle de cita — propuesta

Mockup: `Panel_Vet___Agenda_con_detalle__propuesta_.png`
Producto: **MyAnimaLog Vet**

Es la misma pantalla de [Agenda · vista Día](panel-vet-agenda-dia.md) con un **panel lateral derecho (drawer)** abierto sobre la cita de **Toby**. La grilla queda parcialmente visible a la izquierda (se oculta la columna de Camila Mora y los controles Día/Semana/Nueva cita).

---

## 1. Panel "Detalle de la cita"

- Anclado a la derecha, altura completa, fondo blanco.
- Título pequeño en mayúsculas: `DETALLE DE LA CITA`
- Botón cerrar `✕` arriba a la derecha.

### 1.1 Cabecera del paciente

- Avatar circular menta con ícono de huella.
- **Toby** (título grande)
- Subtítulo: Beagle · macho · 4 años · 12,4 kg
- Chips de estado:
  - **Confirmada** (índigo claro)
  - **Próxima · en 25 min** (ámbar claro)

### 1.2 Datos de la cita

| Ícono | Dato | Detalle |
|---|---|---|
| Calendario | Martes 6 de octubre | 10:30 – 11:00 a. m. |
| Persona | Dra. Sara Ruiz | Médica veterinaria |
| Etiqueta | Control posoperatorio | 30 min · $45.000 |

### 1.3 Dueño

- Etiqueta de sección: `DUEÑO`
- **Carlos Mendoza**
- Teléfono: 300 123 4567
- Botón secundario con ícono de teléfono: **Llamar**
- Indicador de consentimiento (verde, ícono de escudo): *Comparte la historia de Toby con la clínica*

### 1.4 Nota del dueño

Tarjeta lavanda con ícono de comentario:

- Título: **Nota del dueño al pedir la cita**
- Texto: "Se lame la herida por las noches."

### 1.5 Historial reciente

Encabezado: **Historial reciente** · enlace **Ver ficha →**

| Fecha | Evento | Profesional |
|---|---|---|
| 22 sep | Esterilización | Dra. Sara Ruiz |
| 22 sep | Vacuna antirrábica | Dra. Sara Ruiz |

### 1.6 Acciones (pie del panel)

Jerarquía de arriba hacia abajo:

1. **✓ Marcar llegada** — botón primario índigo, ancho completo.
2. Fila de dos botones secundarios (borde negro): **Reprogramar** · **No asistió**
3. **Cancelar cita** — enlace de texto rojo, centrado (acción destructiva, menor énfasis).

---

## 2. Estado de la grilla de fondo

- La cita de Toby sigue resaltada en la columna de la Dra. Sara (10:30, borde índigo).
- Resto de citas visibles sin cambios (Max, Pelusa, Luna, Simón, Kira, Nala).
- Mini calendario, solicitudes de la app y leyenda de estados permanecen visibles.

---

## 3. Comportamiento esperado (supuestos de la propuesta)

- **Marcar llegada** → estado pasa a *En la clínica* (borde teal) y el chip "Próxima" desaparece.
- **No asistió** → estado *No asistió* (gris, nombre tachado).
- **Reprogramar** → abre selector de nueva fecha/hora/profesional.
- **Cancelar cita** → pide confirmación antes de ejecutar.
- **Llamar** → inicia llamada (`tel:`) al número del dueño.
- **Ver ficha** → navega a la ficha clínica completa de Toby.
- El bloque "Comparte la historia de Toby con la clínica" aparece solo si el dueño dio consentimiento; si no, el historial reciente se oculta.
- El chip **Próxima · en X min** se calcula en vivo respecto a la hora actual.
- La nota del dueño se muestra solo si la cita se pidió desde la app y trae comentario.
