# Panel Vet · Agenda (vista Día) — propuesta

Mockup: `Panel_Vet___Agenda_día__propuesta_.png`
Producto: **MyAnimaLog Vet** · Clínica de ejemplo: *Clínica Patitas*

---

## 1. Layout general

Pantalla de escritorio con tres zonas:

1. **Sidebar de navegación** (izquierda, fondo índigo oscuro).
2. **Columna lateral de contexto** (mini calendario, solicitudes de la app, leyenda de estados).
3. **Grilla de agenda** (zona principal, columnas por profesional).

---

## 2. Sidebar

| Ítem | Notas |
|---|---|
| Inicio | |
| **Agenda** | Activo. Badge naranja con contador: `8` |
| Pacientes | |
| Clientes | |
| Reportes | |
| Equipo | |
| Servicios y horarios | |
| Mi clínica | |
| Plan | |

**Pie del sidebar:** avatar `AG` · **Ana Gómez** · ícono de verificación + *Clínica Patitas*.

---

## 3. Header de la página

- Título: **Agenda**
- Navegación de fecha: botón `<` · botón **Hoy** · botón `>`
- Fecha activa: **Martes, 6 de octubre**
- Toggle de vista (derecha): **Día** (activo) | Semana
- CTA primario: **+ Nueva cita**

---

## 4. Columna lateral

### 4.1 Mini calendario
- Mes: **Octubre 2026**, flechas para cambiar de mes.
- Semana inicia en lunes (L M M J V S D).
- Día seleccionado (6) en círculo índigo relleno.
- Puntos pequeños bajo los días que tienen citas.
- Sábados y domingos en gris atenuado.

### 4.2 Solicitudes de la app `2`
Tarjetas con borde **punteado ámbar** (estado "Por confirmar"):

| Mascota | Servicio | Fecha y hora | Profesional |
|---|---|---|---|
| Milo | Vacunación | Mar 7 oct · 9:00 a. m. | Dr. Luis |
| Nube | Consulta general | Mié 8 oct · 4:00 p. m. | Dra. Sara |

Acciones por tarjeta: **Aceptar** (primario, índigo) · **Rechazar** (secundario, borde negro).

### 4.3 Estados (leyenda)

| Estado | Estilo visual |
|---|---|
| Confirmada | Borde índigo sólido, fondo lavanda claro |
| Por confirmar | Borde punteado ámbar, fondo crema |
| En la clínica | Borde teal, fondo menta |
| Atendida | Borde verde, fondo verde claro |
| No asistió | Borde gris, fondo gris, nombre **tachado** |

---

## 5. Grilla de agenda

- Eje vertical: horas de **8:00 a. m.** a **5:00 p. m.**, con líneas cada 30 min (≈72 px por hora).
- **Línea de hora actual** en rojo con etiqueta `10:05`.
- **Bloques "Almuerzo"** 12:00–1:00 p. m. en cada columna, con rayado diagonal (no agendable).
- Cada columna tiene encabezado con avatar de iniciales, nombre, cargo/rol y conteo de citas.

### 5.1 Columnas (profesionales)

| Avatar | Nombre | Rol | Citas del día |
|---|---|---|---|
| LP (naranja) | Dr. Luis Pérez | Médico veterinario (ícono verificado) | 4 |
| SR (lila) | Dra. Sara Ruiz | Médica veterinaria (ícono verificado) | 3 |
| CM (menta) | Camila Mora | Peluquería | 2 |

### 5.2 Citas del día

**Dr. Luis Pérez**

| Hora | Mascota | Servicio | Estado |
|---|---|---|---|
| 8:00 | Max | Consulta general | Atendida |
| 8:30 | ~~Pelusa~~ | Vacunación | No asistió |
| 9:30 | Luna | Vacunación | En la clínica |
| 2:00 p. m. | Simón | Vacunación | Confirmada |

**Dra. Sara Ruiz**

| Hora | Mascota | Servicio | Estado |
|---|---|---|---|
| 10:30 | Toby | Control posoperatorio | Confirmada · chip **Próxima** |
| 11:30 | Kira | Consulta general | Por confirmar |
| 4:00 p. m. | Nala | Consulta general | Confirmada |

**Camila Mora** (peluquería — bloques de 1 h, más altos, con ícono de tijeras)

| Hora | Mascota | Servicio | Estado |
|---|---|---|---|
| 9:00 – 10:00 | Bruno | Baño y corte | Atendida |
| 3:00 – 4:00 | Coco | Baño y corte | Confirmada |

### 5.3 Anatomía de un bloque de cita

- **Citas médicas (30 min):** una sola línea → `Mascota` (negrita) · servicio · chip de estado a la derecha.
- **Citas de peluquería (1 h):** rango horario arriba, ícono ✂ + mascota, servicio abajo.
- El color/borde lo define el estado (ver 4.3).

---

## 6. Comportamiento esperado (supuestos de la propuesta)

- Clic en un bloque de cita → abre el panel **Detalle de la cita** (ver `panel-vet-agenda-detalle-cita.md`).
- Aceptar una solicitud de la app la convierte en cita **Confirmada** y actualiza el contador del sidebar.
- Rechazar una solicitud la elimina de la lista.
- Los bloques de almuerzo no admiten citas.
- El chip **Próxima** aparece cuando la cita empieza en menos de ~30 min.
- Toggle **Semana** cambia a vista semanal (fuera del alcance de este mockup).
