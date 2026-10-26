# visual_feedback.md — Indicadores, alertas y animaciones de la partida

> Estado: **v1.0**. Complementa `game_loop.md` (reglas) y `ui_screens.md` (pantallas HTML). Todo lo de este documento se dibuja en el canvas, forma parte de la simulación visual de `Game` y **no usa el DOM ni la red**. Los tiempos están en segundos de juego (avanzan con `dt`; en coop, con el reloj del servidor) y los valores viven en `src/game/visuals.js`.

## 1. Principios

1. **Legible de un vistazo:** texto grande y con contraste sobre el fondo oscuro; un solo aviso importante a la vez en el centro.
2. **Sin solapes:** ningún texto de estado se dibuja encima de otro ni del HUD (§6).
3. **Cosmético y determinista donde importa:** las animaciones no cambian el resultado de la partida. Las que dependen de una fase (franjas, aviso del jefe, entrada de enemigos) se calculan con el tiempo de juego, así que en coop ambos clientes las ven a la vez.
4. **Movimiento reducido:** con `prefers-reduced-motion: reduce` desaparecen el temblor y los desplazamientos de las franjas (aparecen con fundido); la entrada de enemigos pasa a ser un fundido sin desplazamiento.
5. En pausa y tras el Game Over las animaciones quedan congeladas (no avanzan con `dt`).

## 2. Franja de oleada (tarea 5.1)

- Cada vez que empieza una oleada normal a partir de la **2** (y también la 1, al arrancar la partida) se muestra una **franja horizontal centrada** en la altura del lienzo con el texto «OLEADA N».
- Dura **0,5 s** y se anima de **izquierda a derecha**: entra desde el borde izquierdo (primer 25 %), se mantiene centrada (50 %) y sale por el borde derecho (último 25 %), con el texto dentro.
- Estilo: franja de 56 px de alto, fondo `#0b1a3a` al 88 % con borde superior e inferior en `#67f5d5`, texto blanco en negrita de 26 px con espaciado.
- Solo hay una franja activa; si llega otra, sustituye a la anterior.
- En coop la lanzan ambos clientes al iniciar la oleada anunciada por el host (`phase`).

## 3. Franja dorada de la fase bonus (tarea 5.8)

- Al iniciar una fase bonus se muestra la **misma franja** (§2, 0,5 s) con el texto «FASE BONUS» en **dorado**: fondo `#3a2a05` al 90 %, bordes y texto `#ffd166`.
- Sustituye a la franja de oleada si coincidiera en el tiempo.

## 4. Entrada de los enemigos (tarea 5.2)

- Al crearse una formación, cada enemigo **entra desde arriba**: parte 220 px por encima de su posición y con opacidad 0, y baja hasta su sitio con desaceleración (`easeOutCubic`) mientras aparece.
- Duración por enemigo **0,5 s**, escalonada por rejilla: retraso `fila · 0,08 s + columna · 0,04 s` (la entrada completa dura ≤ 1,2 s).
- El progreso sale de `Formation.time` (determinista): `progress = clamp((time − retraso) / 0,5, 0, 1)`.
- Mientras `progress < 1` el enemigo **no recibe impactos de balas** ni dispara (el dibujo y la caja de colisión no coinciden); sí cuenta para «oleada completada» y para la línea de derrota.
- Con movimiento reducido: sin desplazamiento, solo aparece con fundido.

## 4.1 Entrada del jefe: advertencia (tarea 5.3)

- El jefe **no aparece de golpe**. Al completarse la oleada que lo dispara (3, 6, 9…) se muestra durante **2 s** un **icono de advertencia intermitente** (triángulo amarillo con «!» y el texto «¡ALERTA! JEFE») en el centro de la pantalla. Parpadea a 4 Hz (visible en la primera mitad de cada 0,25 s) con un fondo rojo tenue pulsante.
- Pasados los 2 s aparece el jefe en su posición inicial y empieza a actuar. Durante la advertencia no hay jefe ni enemigos normales: los peligros ambientales y los potenciadores en caída siguen activos.
- **Coop:** el host publica `phase { kind: 'boss' }` al empezar la advertencia; cada cliente cuenta sus 2 s (descontando el retraso del evento) y crea el jefe al terminar. La advertencia cuenta como parte de la fase: el host no vuelve a evaluar el fin de oleada mientras dura.
- Si el host cae durante la advertencia, el nuevo host completa la fase al terminar el temporizador local.

## 5. Escudo hexagonal (tarea 5.6)

- Con el potenciador de **escudo** activo la nave lleva un **hexágono** a su alrededor: radio 26 px, trazo de 2,5 px en `#67f5d5`, relleno `#67f5d5` al 14 %, rotación lenta (0,6 rad/s) y un pulso suave de opacidad.
- En el último **1,5 s** del escudo el hexágono **parpadea** (avisa de que termina).
- La nave ya no parpadea por tener escudo: el parpadeo queda reservado a la invulnerabilidad tras un golpe (`Player.invulnerable`).

## 6. Pila de textos de estado (tarea 5.4)

Los avisos de texto del canvas se ordenan en una **pila vertical** bajo el HUD, de arriba abajo, en este orden de prioridad:

1. Alerta o evento de peligro (`⚠ LLUVIA DE ASTEROIDES · EN 3s`, `CAMPO MAGNÉTICO · 8s`).
2. `FASE BONUS · Ns · COMBO xN`.
3. `+1 VIDA · 2 POTENCIADORES`.
4. Un renglón por potenciador activo (`ESCUDO 3,2s`, …).

- La pila empieza en `y = 36` (bajo la fila del HUD) y cada renglón ocupa **15 px**; nunca se dibuja dos veces en la misma `y`.
- La **barra de salud del jefe** se dibuja debajo de la pila (`y = 36 + 15·renglones + 14`) y su título encima de la barra, de modo que no se pisa con los renglones.
- Los avisos de la parte inferior (conexión, mensajes temporales) se apilan hacia arriba desde `height − 14`, 20 px por renglón.
- El HUD superior mantiene `Puntos` (izquierda), `Vidas` (centro) y `Oleada` (derecha, ver §7).

## 7. HUD y botón de pausa (tarea 5.5)

- El botón de pausa/salida (48 × 48 px a 8 px de la esquina superior derecha) **no puede tapar** ningún dato. El texto «Oleada: N» se alinea a la derecha en `x = width − 64`, dejando libre la zona del botón (`x ≥ width − 56`).
- Los textos del HUD no deben solaparse entre sí a 320 px de ancho: «Vidas» se centra en `width / 2` y «Oleada» no pasa de 80 px de ancho.

## 8. Temblor de pantalla al perder una vida (tarea 5.7)

- Cuando la nave local **pierde una vida** (solo) o **cae** tras un impacto (coop: `Player.hit()` que baja la nave) el lienzo **tiembla levemente**: desplazamiento aleatorio de hasta **4 px** que decae linealmente en **0,35 s**.
- El temblor desplaza la escena de juego (fondo, enemigos, balas y naves) pero **no el HUD ni las franjas** para mantener el texto estable.
- Sin temblor con movimiento reducido (`Game.reducedMotion`, fijado en `main.js` con `matchMedia`).
- Usa un generador de azar propio y sin estado de partida (`Math.random`): no consume la secuencia determinista (`multiplayer_sync.md` §3).

## 9. Pruebas esperadas

- Franja: aparece al empezar cada oleada, dura 0,5 s, su posición avanza de izquierda a derecha, la de bonus es dorada, y una nueva sustituye a la anterior.
- Entrada: el progreso es 0 al crear la formación, 1 tras ≤ 1,2 s, el retraso crece con fila y columna, y un enemigo en entrada no recibe balas ni dispara.
- Jefe: tras completar la oleada hay 2 s de advertencia sin jefe; después aparece; el host no repite la transición; el invitado cuenta su propia advertencia.
- Pila: dos eventos simultáneos (peligro + potenciadores + bonus) producen `y` distintas con 15 px de separación y la barra del jefe queda debajo.
- HUD: «Oleada» queda a la izquierda de `width − 56`.
- Escudo: con el potenciador activo se dibuja el hexágono (6 vértices) y la nave no parpadea; en el último 1,5 s parpadea.
- Temblor: se activa al perder una vida, decae a 0 en 0,35 s y no se activa con movimiento reducido.
