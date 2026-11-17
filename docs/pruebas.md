# Pruebas de campo y pruebas manuales

Lo que las pruebas automáticas no pueden comprobar: un teléfono real, un micrófono real, cuentas reales y una hora caminando. Cada prueba dice qué hacer, qué debe pasar y qué anotar. Al terminar, registrar los resultados en la última sección sin incluir contraseñas, tokens ni datos personales.

## Asistente y navegación de experiencia (ADR-47)

1. Con sesión, abrir Asistente y consultar «Mis registros de esta semana» → «¿Y ayer?» → «Solo los provisionales» → «Abre el primero». Verificar confianza y estado, filtros aplicados, detalle correcto y regreso con el hilo conservado. Las consultas reconocidas no deben enviar texto al proveedor ni gastar su cuota. Si no hay resultados, no debe afirmarse que no había aves.
2. Comparar esta semana con la pasada. Contrastar los recuentos con la Bitácora: los cantos descartados no cuentan y las observaciones visuales se muestran aparte. Si se corta la lista de especies exclusivas, el aviso debe distinguirla de los totales completos.
3. Con una aceptación antigua del aviso, escribir una pregunta que requiera interpretación: debe pedir permiso nuevo antes de enviar. Probar una explicación pública y una pregunta sobre una especie. La explicación tiene fuentes; el hilo no muestra nombre del modelo ni tokens. Las consultas claras de lectura se ejecutan directamente; una referencia ambigua pide aclaración.
4. Cancelar una petición, iniciar una nueva consulta y retirar el permiso, también desde otra pestaña. No deben aparecer respuestas tardías ni conservarse el contexto después de retirarlo. Salir de Asistente, cerrar sesión y entrar de nuevo: el hilo anterior debe haberse borrado.
5. Comprobar Registros, Salidas, Colecciones y otras listas largas: inicialmente hasta diez elementos, con los siguientes accesibles mediante «Mostrar más». En el asistente, cada página añade cinco resultados. Volver de un detalle debe mantener el recorrido y los filtros que correspondan.
6. En un teléfono real, abrir el teclado, escribir varias líneas, desplegar un filtro y consultar mensajes anteriores mientras llega una respuesta. El campo y sus controles deben seguir accesibles; la llegada de una respuesta no debe quitar la posición de lectura. Repetir a 360 y 1280 px, es/en y claro/oscuro, y recorrer los controles con teclado. La simulación de altura reducida en escritorio no sustituye el teclado real de Android/iOS.

Las cuentas, el correo y el proveedor reales siguen siendo comprobaciones independientes. Una prueba con Auth o respuestas sustituidas no demuestra el funcionamiento de Supabase o Gemini reales.

## Beta: diario y asistentes

Complementa las pruebas existentes; requiere aplicar la migración beta y publicar primero la API (`docs/despliegue.md`). Las verificaciones automáticas locales se describen en `beta-validacion.md`.

| Prueba manual | Resultado esperado |
|---|---|
| Escuchar en un teléfono real, detener y volver al Diario; repetir caminando, con y sin permiso de guardar recorridos | Una salida por sesión; sus cantos quedan vinculados por UUID. El diario no sube un recorrido sin el permiso independiente |
| Abrir una salida con cantos, descartes, observaciones y un clip | Orden temporal, confianza/estado en acústicas, observaciones marcadas manuales; solo se reproducen clips existentes |
| Añadir observación sin señal, con nota y foto del teléfono; volver a tener red y abrir otro teléfono | Metadatos privados sincronizados; foto solo en el primero, sin metadatos originales; no aumenta el total de detecciones acústicas |
| Editar el mismo registro en dos dispositivos; borrar uno mientras el otro tiene un cambio pendiente | Conflicto visible, notas conservadas, elección explícita; ningún borrado remoto se resucita por una respuesta tardía |
| Crear colección, añadir/quitar registros; borrar colección y salida | Los registros originales y sus clips se conservan; solo cambian sus vínculos |
| Añadir especie de interés y escuchar un canto de ella | Aviso visual de posible coincidencia, como máximo una vez por especie y sesión; no afirma una identificación |
| Importar WAV/MP3/M4A/FLAC/Ogg/WebM reales, incluido uno largo, y cancelar | Compatibilidad comprobada por navegador/códec; memoria y batería aceptables, progreso y cancelación; clips y resultados parciales según permisos |
| Importar sin fecha en «solo analizar»; guardar otro con fecha y lugar originales diferentes al lugar actual | El primero no persiste; el segundo respeta los datos explícitos redondeados. No usa fecha del archivo ni GPS actual |
| Asistente con cuenta real sin marcar consentimiento; aceptar, interpretar, revisar y confirmar | Sin consentimiento no se envía texto; el plan no consulta hasta confirmar. Resultados y paginación no se envían a Gemini |
| Tutor con pregunta dentro y fuera de los cinco temas; cuota agotada; sin red | Respuesta con fuentes/contexto público o rechazo claro, uso real/desconocido sin estimaciones; errores de red/cuota visibles |
| Retirar consentimiento durante una petición; cambiar de cuenta y volver; borrar la cuenta de prueba | No reaparecen respuestas tardías; el consentimiento depende de cuenta/dispositivo; borrado local selectivo conserva la otra cuenta |

Anotar teléfono, sistema, navegador, códec, duración/tamaño, modelo elegido, latencia, memoria si es medible y batería. No dar por probados Safari/iOS, móviles o Gemini real a partir de Edge y de un proveedor simulado.

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
| Solo con cuenta (ADR-45) | Sin sesión, abrir `#/log` y entrar con Google; repetir con correo y contraseña. Crear una cuenta y activarla con el enlace del correo en lugar del código | Tras entrar se abre la Bitácora en la misma dirección; con el enlace, la app queda con la sesión iniciada |
| Sin señal más de una hora (ADR-45) | Con la sesión iniciada, poner el teléfono en modo avión una hora y media, abrir Trino y escuchar; volver a tener señal | La app se abre sin pedir entrar, Cuenta dice «Sin conexión», lo grabado sale en la Bitácora y se sube al volver la señal |
| Teléfono compartido (ADR-45) | Entrar con una cuenta y grabar; cerrar sesión; entrar con otra | La segunda no ve nada de la primera; al volver la primera, ve lo suyo y lo pendiente se sube |

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

### Encuentros en caminata (ADR-48)

- Escuchar repetidamente una especie sin desplazarse: debe aumentar el número de detecciones del encuentro, sin añadir un punto por cada detección.
- Caminar fuera del radio de 60 m del primer registro, o volver después de una pausa de más de 5 minutos sin detecciones de esa especie: comprobar que aparece otro encuentro. Ningún texto debe afirmar que son individuos diferentes.
- Abrir el punto y la especie en el panel: las detecciones originales deben conservar confianza, estado y acceso a la revisión de las propias. Comparar el CSV: debe conservar cada registro.
- Probar GPS inestable, pérdida de ubicación, pantalla bloqueada y caminata sin señal en el teléfono real; comprobar que se representa la posición aproximada del teléfono y no se promete localizar el ave.
- Ver una especie ajena amenazada y una caminata antigua sin detalle: deben mostrarse como resúmenes y declarar los encuentros sin estimar, conservando la generalización de privacidad.

Copiar aquí cada resumen y cada prueba, con fecha, teléfono y quién la hizo.

| Fecha | Teléfono / navegador | Prueba | Resultado | Observaciones |
|---|---|---|---|---|
| | | | | |
