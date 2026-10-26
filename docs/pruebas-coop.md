# Prueba manual del cooperativo con 2 dispositivos (tarea 3.15)

Guía para validar el coop de punta a punta con dos teléfonos reales y **redes distintas** (uno en Wi‑Fi y otro con datos móviles). Los resultados se anotan en la tabla final; hasta que se completen, la tarea 3.15 de `TASKS.md` queda sin marcar.

> Estado: **pendiente de ejecutar**. La lógica de sincronización está cubierta por pruebas automáticas (incluida una prueba de integración con dos clientes y una sala en memoria), pero el comportamiento con latencia, cortes y relojes reales solo se puede confirmar en dispositivos.

## 1. Preparación

1. Las reglas de seguridad de este repositorio son **obligatorias** (los eventos `phase`, `state` y `game-over`, el relevo de host y el borrado de salas dependen de ellas). Publícalas en el mismo proyecto que usa `src/net/firebaseConfig.js`:
   ```bash
   firebase deploy --only database,firestore --project <project-id>
   ```
2. Genera la app y llévala a los dos teléfonos (APK de la tarea 4.5) o abre la versión web publicada en ambos:
   ```bash
   npm run build
   ```
3. Activa en ambos teléfonos la depuración opcional abriendo la app con `?debug=1` (versión web) para ver FPS y tráfico (tareas 4.2 y 4.3).
4. Ten abierta la consola de Firebase → Realtime Database → pestaña *Datos* para observar `rooms/{código}`.
5. Asigna roles: **A** = host (crea la sala), **B** = invitado.

## 2. Escenarios

Marca cada uno en la tabla de la sección 3.

| # | Escenario | Qué hacer | Resultado esperado |
|---|---|---|---|
| 1 | Sala y lobby | A pulsa «Crear sala» y comparte el código; B lo introduce en «Unirse a sala». Ambos pulsan «Listo» y A «Iniciar partida». | Ambos aparecen en la lista; al iniciar, los dos ven la cuenta atrás 3‑2‑1 y la partida arranca a la vez (diferencia visible ≤ 0,3 s). |
| 2 | Sincronía de la formación | Durante 2 minutos, sin disparar a los mismos enemigos, comparar las pantallas. | Los enemigos están en las mismas posiciones y las balas enemigas salen de los mismos tiradores en ambos teléfonos (diferencias ≤ ~100 ms). |
| 3 | Nave del compañero | B se mueve de lado a lado; A observa. | La nave morada de B se mueve con fluidez, sin saltos, con un retraso pequeño (~100 ms). |
| 4 | Bajas y puntaje | Ambos disparan a la vez a la misma fila. | Cada enemigo desaparece en ambas pantallas; el puntaje coincide al terminar cada oleada (puede diferir unos puntos durante la acción). |
| 5 | Oleadas, jefe y bonus | Jugar hasta la oleada 6. | Las oleadas, el jefe de la oleada 3, la fase bonus de la oleada 5 y los potenciadores aparecen a la vez en ambos; las vidas y el puntaje coinciden tras cada fase. |
| 6 | Rescate y vidas | Dejar que un enemigo golpee a B y que A se acerque a su nave. | B queda en «AUXILIO 5s»; A lo rescata gastando una vida compartida; el contador de vidas coincide en ambos. |
| 7 | Corte de red de 5 s | Activar modo avión en B durante 5 s y volver a conectar. | En B: «Conexión inestable». En A: «Compañero desconectado · se retira en N s». Al volver, los avisos desaparecen y B sigue en la partida. |
| 8 | Corte largo | Dejar B sin red más de 10 s. | A ve «Tu compañero salió de la partida» y puede seguir jugando solo. |
| 9 | Caída del host | Cerrar la app de A (host) en mitad de la partida. | A los ~2 s B muestra «Ahora eres el host de la partida» y la partida sigue avanzando de oleada. |
| 10 | Fin de partida | Dejarse eliminar a ambos. | Los dos ven «Resultado del equipo» con el mismo puntaje y oleada, y el desglose de bajas. Solo el host muestra el estado de guardado; el invitado ve la nota del host. |
| 11 | Ranking | Abrir «Ranking» en cualquier teléfono. | Aparece una sola entrada del equipo (modo coop) con el puntaje de la partida. |
| 12 | Salir a mitad de partida | En otra partida, B pulsa ✕ (o «Atrás») → «Salir». | B vuelve al Home; A recibe «Compañero desconectado». Si A también sale, la sala `rooms/{código}` desaparece de la consola. |
| 13 | Limpieza | Al terminar el escenario 10, pulsar «Volver al lobby» en el host. | `rooms/{código}` desaparece de la consola de Firebase. |
| 14 | Duración | Partida continua de 5 minutos. | Sin desincronización visible entre pantallas (criterio de aceptación global de `architecture.md` §8). |

## 3. Registro de resultados

Copiar una fila por ejecución.

| Fecha | Dispositivo A (modelo, Android, red) | Dispositivo B (modelo, Android, red) | Escenarios OK | Escenarios con fallo | Observaciones |
|---|---|---|---|---|---|
| _pendiente_ | | | | | |

## 4. Si algo falla

- **No arranca la partida / «permission_denied»**: las reglas de RTDB no están desplegadas (ver sección 1).
- **Los enemigos no coinciden**: confirmar en la consola que `rooms/{código}/meta/seed` y `startAt` existen y que ambos teléfonos tienen la hora automática activada (el reloj del servidor corrige el desfase, pero un reloj local muy errático dificulta el diagnóstico).
- **Ranking sin entrada coop**: las reglas de Firestore (`firebase/firestore.rules`) también deben estar desplegadas; la entrada la crea solo el host.
- Anotar el código de sala, la hora y capturar la consola de Firebase para reproducir el problema.
