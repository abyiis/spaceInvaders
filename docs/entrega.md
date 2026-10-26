# Guía de entrega: de este repositorio al APK (tareas 0.6, 0.7, 4.4 y 4.5)

Todo lo que se puede preparar sin Android Studio ya está en el repositorio. Esta guía recoge, en orden, lo que falta hacer en un equipo con **Android Studio** (SDK de Android y JDK 17 o superior). La plataforma `android/` no está versionada porque el entorno de desarrollo no tenía el SDK; se genera con un solo comando.

> Estado: **pendiente de ejecutar en un equipo con Android Studio**. Las tareas 0.6, 0.7, 4.4 y 4.5 de `TASKS.md` siguen sin marcar hasta tener el APK.

## 1. Requisitos

- Node ≥ 20 y `npm install` hecho.
- Android Studio con un SDK de Android (API 34 o superior recomendado) y un emulador o un teléfono con depuración USB.
- Las reglas de Firebase desplegadas (el coop depende de ellas):
  ```bash
  firebase deploy --only database,firestore --project <project-id>
  ```
- `src/net/firebaseConfig.js` con la configuración web del proyecto (ya versionado en este repositorio).

## 2. Generar la plataforma Android (0.6)

`capacitor.config.json` ya trae el `appId` (`co.edu.upb.spacecoop`), el nombre de la app (`Neon Invaders`) y el splash nativo de 800 ms. Si el equipo prefiere otro `appId`, cámbialo **antes** de este paso: no se puede cambiar después sin regenerar el proyecto.

```bash
npm run build
npx cap add android
```

## 3. Ícono y pantalla de arranque nativa (4.4)

Los recursos ya están generados en `assets/` (`npm run assets` los regenera a partir de la nave del splash de la app). Para crear los mipmaps y los splash de Android:

```bash
npx @capacitor/assets generate --android --assetPath assets
```

Comprobar después en `android/app/src/main/res/` que aparecen los `mipmap-*` y los `drawable*/splash.png`.

## 4. Orientación vertical (4.1)

El bloqueo se hace en tiempo de ejecución con `@capacitor/screen-orientation` (`src/orientation.js`). Para evitar además el giro durante la carga, añadir en `android/app/src/main/AndroidManifest.xml`, dentro de la `<activity>` principal:

```xml
android:screenOrientation="portrait"
```

## 5. Probar en un dispositivo (0.7, 2B.13, 4.2)

```bash
npm run android      # build + cap sync + abre Android Studio
```

En Android Studio: elegir el emulador o el teléfono y pulsar *Run*. Comprobar:

- Arranque: splash nativo (≤ 1 s) → splash de la app → Home en ≤ 3,5 s desde que se toca el ícono.
- La app se queda en vertical aunque se gire el teléfono.
- El botón «Atrás» abre la pausa (solo) o el diálogo «¿Salir de la partida?» (coop), y en el Home cierra la app.
- Revisión manual de pantallas de la tarea 2B.13 (360×640 y 320×568 en el navegador; capturas para el informe).
- Rendimiento y tráfico: `docs/pruebas-rendimiento.md`. Coop con dos teléfonos: `docs/pruebas-coop.md`.

## 6. Generar el APK de entrega (4.5)

En Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**. El archivo queda en
`android/app/build/outputs/apk/debug/app-debug.apk`. Para una entrega firmada: **Build → Generate Signed Bundle / APK…** y crear un *keystore* propio (guárdalo fuera del repositorio; está ignorado en `.gitignore`).

Antes de entregar:

1. `npm test` y `npm run build` sin errores.
2. Instalar el APK en un teléfono limpio (`adb install app-debug.apk` o copiándolo) y jugar una partida solo y una coop.
3. Anotar versión, fecha y teléfono de prueba en el informe (`docs/informe.md`, sección de pruebas).

## 7. Después de cambiar el código web

```bash
npm run cap:sync     # build + copia a android/
```

`android/` y `ios/` solo se versionan si se modifican a mano (ver `.gitignore`); los artefactos de compilación no.
