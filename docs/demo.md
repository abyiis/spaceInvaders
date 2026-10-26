# Guion de demostración (5 minutos, 2 teléfonos)

Presentan tres personas: **P1** (host, teléfono A), **P2** (invitado, teléfono B) y **P3** (narra y maneja el proyector o el espejo de pantalla). Cada frase en cursiva es lo que se dice; lo demás es lo que se hace.

## Antes de empezar (15 minutos antes)

- [ ] Reglas de Firebase desplegadas y proyecto en plan Spark verificado (`firebase deploy --only database,firestore`).
- [ ] APK instalado en los dos teléfonos (o la versión web abierta); batería > 50 %, «No molestar» activo, brillo alto.
- [ ] Teléfono A en Wi‑Fi y teléfono B con datos móviles (redes distintas).
- [ ] Pantalla de A espejada en el proyector (scrcpy o *Cast*); B visible con una cámara o compartiendo pantalla.
- [ ] Ambos teléfonos con alias distinto guardado (ej. «Ana» y «Beto») y la app cerrada en el Home.
- [ ] Panel de depuración (5 toques en Créditos) **desactivado** para no distraer; solo se enseña al final.
- [ ] Plan B: vídeo grabado de una partida coop completa por si falla la red.

## Guion

| Minuto | Quién | Qué se hace | Qué se dice |
|---|---|---|---|
| 0:00 – 0:30 | P3 | Abrir la app en A: splash nativo → splash de la app → Home. | *«Neon Invaders es un Space Invaders arcade infinito con cooperativo en tiempo real. Es una app híbrida: HTML, Canvas y JavaScript empaquetados con Capacitor; la partida en línea usa Firebase en plan gratuito.»* |
| 0:30 – 1:15 | P1 | «Jugar solo»: mover la nave, dejar que aparezca un potenciador, abrir la pausa (⏸) y «Continuar». | *«El modo solo funciona sin red. Hay oleadas cada vez más rápidas, enemigos con escudo, kamikazes y potenciadores. Cada tres oleadas llega un jefe y cada cinco una fase bonus.»* (Si hay tiempo, saltar a una partida ya avanzada para enseñar el jefe.) |
| 1:15 – 1:30 | P1 | Dejar morir la nave: resultados → «Inicio». | *«Al terminar vemos el puntaje, la oleada y el tiempo, y se guarda en el ranking.»* |
| 1:30 – 2:15 | P1 + P2 | P1: «Crear sala», lee el código en voz alta. P2: «Unirse a sala», escribe el código. Ambos «Listo»; P1 «Iniciar partida». | *«Una sala se crea con un código de cinco letras. Los dos jugadores se ven en el lobby en vivo, y cuando el host inicia, ambos ven la misma cuenta atrás porque comparten el reloj del servidor.»* |
| 2:15 – 3:30 | P1 + P2 | Jugar coop: dispararse en cruz para provocar la **sinergia** (explosión morada), dejar que un enemigo golpee a P2 y que P1 lo **rescate**. | *«La formación enemiga no se envía por red: la calculan los dos teléfonos a partir de la misma semilla y del reloj del servidor, así que solo viajan las posiciones y los eventos. Si a un piloto lo alcanzan, queda en emergencia cinco segundos y su compañero puede rescatarlo gastando una vida compartida.»* |
| 3:30 – 4:00 | P2 | Activar el modo avión 5 segundos y volver a conectar. | *«Si se corta la red, el otro jugador lo ve en pantalla —‘Compañero desconectado’— y la partida sigue. Si se cae el host, el invitado asume el rol automáticamente.»* |
| 4:00 – 4:30 | P1 + P2 | Perder a propósito. Mostrar «Resultado del equipo» con el desglose de bajas en los dos teléfonos; «Volver al lobby» en el host. | *«El host decide el puntaje oficial y lo guarda en el ranking una sola vez; al salir limpia la sala para no dejar basura en la base de datos.»* |
| 4:30 – 5:00 | P3 | Abrir «Ranking» (entrada coop) y, si hay tiempo, el panel de depuración con FPS y tráfico. | *«Cada partida consume unos 2 MB entre los dos jugadores, muy por debajo de los límites gratuitos. Hay 332 pruebas automáticas y las reglas de seguridad están probadas con el emulador de Firebase.»* |

## Preguntas probables

- **¿Cómo evitan que haga trampa?** No lo evitamos: es una limitación declarada (`docs/informe.md` §8). Sin Cloud Functions, un cliente modificado podría falsear bajas.
- **¿Qué pasa si el host cierra la app?** A los 2 s el invitado reclama `meta/hostUid`; las reglas solo lo permiten si el host figura desconectado.
- **¿Por qué Realtime Database y no Firestore?** Firestore cobra por operación; a 10 actualizaciones por segundo agotaría la cuota diaria.
- **¿Cómo se prueba el cooperativo sin dos teléfonos?** Con una prueba de integración que conecta dos juegos reales mediante una sala en memoria (`test/coopIntegration.test.js`).

## Si algo falla en vivo

| Síntoma | Qué hacer |
|---|---|
| «permission_denied» al crear sala | Reglas sin desplegar: pasar al vídeo y seguir con el modo solo. |
| La cuenta atrás no termina | Ambos teléfonos deben tener la hora automática activada; reiniciar la sala. |
| La pantalla de B se ve desfasada | Esperar 2 s (el host la reajusta en cada oleada); si persiste, salir y crear otra sala. |
| Sin internet en la sala | Usar la zona Wi‑Fi de un tercer teléfono para ambos dispositivos. |
