# Pruebas de campo y pruebas manuales

Lo que las pruebas automáticas no pueden comprobar: un teléfono real, un micrófono real, cuentas reales y una hora caminando. Cada prueba dice qué hacer, qué debe pasar y qué anotar. Al terminar, se copian los resultados en la última sección y se resumen en `PROGRESS.md`.

## 1. Pruebas de campo (definición de terminado, RNF-01, RNF-02, RNF-04)

La definición de terminado pide **al menos dos sesiones de una hora** en exteriores, sin perder ventanas y con menos del 25 % de batería por hora.

**Antes de salir**
- Teléfono Android de gama media con Chrome, la app instalada y abierta al menos una vez con Wi-Fi (los dos modelos descargados: Ajustes → Opciones técnicas lo dice).
- Batería por encima del 80 % y **sin cargador** durante la sesión.
- Anotar el modelo del teléfono y la versión de Android.

**Durante la sesión**
1. Mapa → «Empezar caminata» (o Escuchar → «Empezar a escuchar»).
2. Caminar o quedarse quieto una hora; puede usarse el modo bolsillo.
3. Si es posible, otra persona anota a la vez lo que oye o lo que dice Merlin.

**Al terminar**
1. Ajustes → Opciones técnicas → «Rendimiento de este teléfono» → «Copiar el resumen».
2. Pegar el resumen en la sección de resultados.

**Cuándo se cumple**
| Requisito | Lo que debe decir el resumen |
|---|---|
| RNF-01 | Máximo por ventana por debajo de 1.500 ms |
| RNF-02 | Ninguna ventana perdida |
| RNF-03 | Ninguna tarea larga de más de 50 ms |
| RNF-04 | Batería por hora por debajo del 25 % |

Si el teléfono es demasiado lento para los dos modelos, la app vuelve sola al primero desde la siguiente escucha (ADR-36) y Escuchar lo dice: anotarlo.

## 2. Pruebas manuales con cuenta real

| Prueba | Pasos | Debe pasar |
|---|---|---|
| Verificación en dos pasos | Cuenta → «Verificación en dos pasos» → «Activar»; escanear el QR con una app autenticadora; escribir el código. Cerrar sesión y entrar con contraseña; luego con Google | Pide el código al entrar; sin él no se sincroniza nada; con él todo funciona. Desactivarla pide un código vigente |
| Recuperar contraseña | «¿Olvidaste tu contraseña?» con una cuenta de prueba | Llega el correo (SMTP propio) y deja poner una nueva |
| Notas | Bitácora → un registro → contar individuos y escribir una nota; sincronizar; exportar el CSV de la cuenta | El CSV trae `individuals` y `note`; el mapa de todos visto desde otra cuenta no la muestra |
| Grabaciones | Ajustes → Grabaciones → guardarlas también en la cuenta; escuchar hasta registrar un ave; oír el clip; borrarlo | Se oye, Ajustes muestra el uso, se borra de la cuenta y del teléfono |
| Revisión | «¿Era esta ave?» → confirmar, corregir o descartar | El estado cambia en la Bitácora y, tras sincronizar, en la ficha |
| Caminatas | Terminar una caminata y responder «Sí, guardarlas»; renombrar; exportar GPX y CSV; abrir el GPX en otra app; en otro navegador con la misma cuenta, abrir «Mi mapa» | Aparece en `#/walks`; el GPX se abre; el otro navegador la dibuja desde la cuenta |
| Fichas e informes | Guía → una ficha → «Escribir la ficha»; Mapa → un lugar → «Redactar el informe» | Textos con sus fuentes; el informe solo cita cifras de la página |
| Cantos de referencia | Guía → una ficha → «Cómo canta» | Suena y dibuja la onda; muestra quién grabó y la licencia |
| Especies amenazadas | Con dos cuentas que comparten: registrar o ver una especie VU, EN o CR | La otra cuenta la ve en una zona de ~11 km con la explicación; la propia, en su punto |
| Borrar la cuenta | Con una cuenta de prueba: Cuenta → «Borrar mi cuenta» → escribir BORRAR | Se borra todo y Supabase ya no la muestra |

## 3. Pruebas manuales del teléfono y la accesibilidad

| Prueba | Debe pasar |
|---|---|
| Actualización: con la app abierta, desplegar una versión nueva | Aparece «Hay una versión nueva de Trino» con «Actualizar» |
| BirdNET+ V3 en segundo plano (Chrome de Android): salir de la app durante la descarga | La descarga sigue entre las del sistema y queda instalada al volver |
| Descarga reanudable (iPhone o Firefox): salir a mitad | Continúa donde iba |
| Modo bolsillo con el teléfono guardado | La pantalla sigue encendida, no se sale con el roce |
| Safari en iPhone | La app escucha; Ajustes dice que no guarda clips si no hay codificador Opus |
| Lector de pantalla (TalkBack o VoiceOver): recorrer Escuchar, Bitácora y Cuenta | Todo se anuncia con su nombre; al cambiar de sección se anuncia el encabezado |
| Sol directo y una sola mano | Los controles principales se leen y se alcanzan |
| Teclado en el ordenador: abrir el menú en pantalla estrecha y recorrerlo con Tab | El foco no sale del menú; Escape lo cierra |

## 4. Resultados

Copiar aquí cada resumen y cada prueba, con fecha, teléfono y quién la hizo.

| Fecha | Teléfono / navegador | Prueba | Resultado | Observaciones |
|---|---|---|---|---|
| | | | | |
